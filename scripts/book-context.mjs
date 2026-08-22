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
const LEGACY_BOOK_PICKER_INTRO_STANDARD = 'book-picker-v1';
const BOOK_PICKER_INTRO_STANDARD = 'book-picker-v2';
const BOOK_PICKER_INTRO_DEFAULT_SECONDS = 7.2;
const BOOK_PICKER_INTRO_DURATION_RANGES = Object.freeze({
  [LEGACY_BOOK_PICKER_INTRO_STANDARD]: Object.freeze({minimum: 2.8, maximum: 4.8}),
  [BOOK_PICKER_INTRO_STANDARD]: Object.freeze({minimum: 6.8, maximum: 8.8}),
});
const BOOK_PICKER_CONTENT_GAP_MS = 550;
const BOOK_PICKER_SPOKEN_LEAD_PREFIX = '大家好，今天我们讲';
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

const getBookPickerSpokenLead = (title) =>
  `${BOOK_PICKER_SPOKEN_LEAD_PREFIX}《${String(title ?? '').trim()}》。`;

const planBookPickerIntroTiming = ({
  requestedDurationSeconds,
  spokenDurationSeconds,
  minimumLeadInSeconds,
  contentGapSeconds,
}) => {
  const spokenStartSeconds = Math.max(
    minimumLeadInSeconds,
    requestedDurationSeconds - contentGapSeconds - spokenDurationSeconds,
  );
  return {
    spokenStartSeconds,
    contentStartsSeconds: Math.max(
      requestedDurationSeconds,
      spokenStartSeconds + spokenDurationSeconds + contentGapSeconds,
    ),
  };
};

const inspectBookPickerIntro = ({book, layout}) => {
  const errors = [];
  const picker = layout?.bookPickerIntro;
  const expectedStandard = book?.editorialStandards?.introStandard;
  if (picker?.enabled !== true || picker?.standard !== expectedStandard) {
    errors.push(`新书必须启用 ${expectedStandard || BOOK_PICKER_INTRO_STANDARD} 开场选书动画。`);
    return {errors, standard: expectedStandard, picker};
  }
  const durationRange = BOOK_PICKER_INTRO_DURATION_RANGES[expectedStandard];
  const durationSeconds = Number(picker.durationSeconds);
  if (!durationRange) {
    errors.push(`不支持的开场选书标准：${expectedStandard}。`);
  } else if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds < durationRange.minimum ||
    durationSeconds > durationRange.maximum
  ) {
    errors.push(
      `${expectedStandard} 开场选书动画必须为 ${durationRange.minimum}～${durationRange.maximum} 秒。`,
    );
  }
  const candidateLabels = picker.candidateLabels ?? [];
  if (!Array.isArray(candidateLabels) || candidateLabels.length < 3) {
    errors.push('开场选书动画至少需要 3 个中文候选书名。');
  } else if (candidateLabels.some((label) => /[A-Za-z]/u.test(String(label)))) {
    errors.push('开场选书动画的候选书名不得出现英文。');
  }
  return {errors, standard: expectedStandard, picker};
};

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
  LEGACY_BOOK_PICKER_INTRO_STANDARD,
  BOOK_PICKER_INTRO_STANDARD,
  BOOK_PICKER_INTRO_DEFAULT_SECONDS,
  BOOK_PICKER_INTRO_DURATION_RANGES,
  BOOK_PICKER_CONTENT_GAP_MS,
  BOOK_PICKER_SPOKEN_LEAD_PREFIX,
  CONTENT_FLOW_STANDARD,
  SOURCE_LED_DURATION_RANGE_SECONDS,
  activeBookPath,
  assertFixedNarration,
  assertEditorialStandards,
  assertScriptApproved,
  booksRoot,
  getBookContext,
  getBookPickerSpokenLead,
  getCliOption,
  getPronunciationOverrides,
  getPronunciationOverridesSha256,
  getScriptState,
  hashText,
  inspectBookPickerIntro,
  planBookPickerIntroTiming,
  readActiveBookId,
  readJson,
  root,
  setActiveBook,
  validateBookId,
  writeJson,
};
