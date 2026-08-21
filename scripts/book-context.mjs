import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const booksRoot = path.join(root, 'books');
const activeBookPath = path.join(root, 'active-book.json');

const FIXED_VOICE = Object.freeze({
  engine: '火山引擎豆包语音合成2.0',
  voiceName: '刘飞男声',
  speaker: 'zh_male_liufei_uranus_bigtts',
  resourceId: 'seed-tts-2.0',
  speechRate: -10,
  pitchRate: 0,
  sampleRate: 24000,
});
const CLOSING_BRAND_LINE = '这里是十分钟读懂一本书';
const REQUIRED_CLOSING_BRAND_LINE = '这里是陈拾叁，陪你一起读书破万卷。';
const SOURCE_LED_CHANNEL_STANDARD = 'source-led-unbounded-v2';
const SOURCE_LED_CONTENT_STANDARD = 'source-analogy-commentary-v2';
const SEMANTIC_VISUAL_STANDARD = 'semantic-key-moments-v1';
const BOOK_PICKER_INTRO_STANDARD = 'book-picker-v1';
const CONTENT_FLOW_STANDARD = 'reality-scene-source-explanation-reality-limits-v1';
const SOURCE_LED_DURATION_RANGE_SECONDS = Object.freeze({
  minimum: 480,
  maximum: 1140,
  default: 720,
});

const readJson = (filePath) => JSON.parse(readFileSync(filePath, 'utf8'));

const writeJson = (filePath, value) => {
  mkdirSync(path.dirname(filePath), {recursive: true});
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const getCliOption = (name, args = process.argv.slice(2)) => {
  const equalsPrefix = `${name}=`;
  const equalsValue = args.find((argument) => argument.startsWith(equalsPrefix));
  if (equalsValue) return equalsValue.slice(equalsPrefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const validateBookId = (bookId) => {
  if (!bookId || typeof bookId !== 'string') throw new Error('缺少书籍 ID。');
  if (bookId.includes('/') || bookId.includes('\\') || bookId === '.' || bookId === '..') {
    throw new Error(`非法书籍 ID：${bookId}`);
  }
  const candidate = path.resolve(booksRoot, bookId);
  const relative = path.relative(booksRoot, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`书籍目录不在 books 下：${bookId}`);
  }
  return bookId;
};

const readActiveBookId = () => {
  if (!existsSync(activeBookPath)) {
    throw new Error('尚未选择当前书籍。请先运行 npm run book:list 或 npm run book:use -- <book-id>。');
  }
  return validateBookId(readJson(activeBookPath).bookId);
};

const resolveBookId = (explicitBookId) =>
  validateBookId(
    explicitBookId ??
      getCliOption('--book') ??
      process.env.AI_MEDIA_BOOK_ID ??
      readActiveBookId(),
  );

const getBookContext = (explicitBookId) => {
  const bookId = resolveBookId(explicitBookId);
  const bookRoot = path.join(booksRoot, bookId);
  const bookConfigPath = path.join(bookRoot, 'book.json');
  if (!existsSync(bookConfigPath)) {
    throw new Error(`书籍项目不存在：${bookRoot}`);
  }
  return {
    root,
    booksRoot,
    activeBookPath,
    bookId,
    bookRoot,
    book: readJson(bookConfigPath),
    bookConfigPath,
    approvalPath: path.join(bookRoot, 'approval.json'),
    contentDir: path.join(bookRoot, 'content'),
    generatedDir: path.join(bookRoot, 'generated'),
    publicDir: path.join(bookRoot, 'public'),
    outputDir: path.join(bookRoot, 'output'),
    runtimeDir: path.join(root, '.runtime'),
  };
};

const setActiveBook = (bookId) => {
  const validated = validateBookId(bookId);
  const bookConfigPath = path.join(booksRoot, validated, 'book.json');
  if (!existsSync(bookConfigPath)) throw new Error(`书籍项目不存在：${validated}`);
  writeJson(activeBookPath, {bookId: validated});
  return validated;
};

const hashText = (value) =>
  createHash('sha256').update(value, 'utf8').digest('hex').toUpperCase();

const getPronunciationOverrides = (config) => {
  const overrides = config.pronunciationOverrides ?? [];
  if (!Array.isArray(overrides)) {
    throw new Error('pronunciationOverrides must be an array.');
  }
  const seenTerms = new Set();
  return overrides.map((override, index) => {
    const term = typeof override?.term === 'string' ? override.term.trim() : '';
    const ttsText =
      typeof override?.ttsText === 'string' ? override.ttsText.trim() : '';
    const pronunciation =
      typeof override?.pronunciation === 'string'
        ? override.pronunciation.trim()
        : '';
    if (!term || !ttsText || !pronunciation) {
      throw new Error(
        `pronunciationOverrides[${index}] must contain non-empty term, ttsText, and pronunciation.`,
      );
    }
    if (term === ttsText) {
      throw new Error(
        `pronunciationOverrides[${index}] must use a distinct TTS-only spelling.`,
      );
    }
    if (seenTerms.has(term)) {
      throw new Error(`Duplicate pronunciation override: ${term}`);
    }
    seenTerms.add(term);
    return {term, ttsText, pronunciation};
  });
};

const getPronunciationOverridesSha256 = (config) =>
  hashText(JSON.stringify(getPronunciationOverrides(config)));

const getScriptState = (context) => {
  const scriptPath = path.join(context.contentDir, 'script.json');
  if (!existsSync(scriptPath)) throw new Error(`缺少脚本：${scriptPath}`);
  const raw = readFileSync(scriptPath, 'utf8');
  return {scriptPath, raw, script: JSON.parse(raw), hash: hashText(raw)};
};

const assertFixedNarration = (config) => {
  const mismatches = [];
  for (const field of ['engine', 'voiceName', 'speaker', 'resourceId', 'speechRate', 'pitchRate', 'sampleRate']) {
    if (config[field] !== FIXED_VOICE[field]) {
      mismatches.push(`${field}=${JSON.stringify(config[field])}`);
    }
  }
  if (mismatches.length) {
    throw new Error(
      `配音标准不允许修改；必须使用刘飞男声、语速 -10。异常字段：${mismatches.join(', ')}`,
    );
  }
  getPronunciationOverrides(config);
};

const assertEditorialStandards = (context, script) => {
  const narrations = (script.segments ?? [])
    .map((segment) => segment.narration ?? '')
  const narration = narrations.join('\n');
  if (
    context.book.editorialStandards?.allowClosingBrandLine !== true &&
    narration.includes(CLOSING_BRAND_LINE)
  ) {
    throw new Error(`结尾口播不得使用“${CLOSING_BRAND_LINE}”。请删除后重新审阅。`);
  }
  if (
    context.book.editorialStandards?.channelStandard ===
    SOURCE_LED_CHANNEL_STANDARD
  ) {
    const configuredLine =
      context.book.editorialStandards?.requiredClosingBrandLine;
    if (configuredLine !== REQUIRED_CLOSING_BRAND_LINE) {
      throw new Error(
        `新书 requiredClosingBrandLine 必须固定为“${REQUIRED_CLOSING_BRAND_LINE}”。`,
      );
    }
    const lastNarration = String(narrations.at(-1) ?? '').trim();
    if (!lastNarration.endsWith(REQUIRED_CLOSING_BRAND_LINE)) {
      throw new Error(
        `新书最后一句口播必须是“${REQUIRED_CLOSING_BRAND_LINE}”。`,
      );
    }
    const occurrences = narration.split(REQUIRED_CLOSING_BRAND_LINE).length - 1;
    if (occurrences !== 1) {
      throw new Error('固定频道收尾句必须且只能在整条口播末尾出现一次。');
    }
  }
};

const assertScriptApproved = (context) => {
  if (!existsSync(context.approvalPath)) {
    throw new Error('脚本尚未批准。请先运行 npm run book:review，确认后运行 npm run book:approve。');
  }
  const approval = readJson(context.approvalPath);
  const scriptState = getScriptState(context);
  if (approval.status !== 'approved' || approval.scriptSha256 !== scriptState.hash) {
    throw new Error('脚本在批准后发生变化，或批准状态无效。请重新审阅并批准后再制作。');
  }
  return {approval, scriptState};
};

export {
  FIXED_VOICE,
  CLOSING_BRAND_LINE,
  REQUIRED_CLOSING_BRAND_LINE,
  SOURCE_LED_CHANNEL_STANDARD,
  SOURCE_LED_CONTENT_STANDARD,
  SEMANTIC_VISUAL_STANDARD,
  BOOK_PICKER_INTRO_STANDARD,
  CONTENT_FLOW_STANDARD,
  SOURCE_LED_DURATION_RANGE_SECONDS,
  activeBookPath,
  assertFixedNarration,
  assertEditorialStandards,
  assertScriptApproved,
  booksRoot,
  getBookContext,
  getCliOption,
  getPronunciationOverrides,
  getPronunciationOverridesSha256,
  getScriptState,
  hashText,
  readActiveBookId,
  readJson,
  root,
  setActiveBook,
  validateBookId,
  writeJson,
};
