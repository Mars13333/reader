import {existsSync} from 'node:fs';
import path from 'node:path';
import {
  assertEditorialStandards,
  getBookContext,
  getScriptState,
  readJson,
} from './book-context.mjs';

const context = getBookContext();
const {script, hash} = getScriptState(context);
const hashOnly = process.argv.includes('--hash-only');

if (hashOnly) {
  console.log(hash);
  process.exit(0);
}

const sourceMapPath = path.join(context.contentDir, 'source-map.json');
if (!existsSync(sourceMapPath)) {
  throw new Error(`缺少来源映射：${sourceMapPath}`);
}

const sourceMap = readJson(sourceMapPath);
const errors = [];
const warnings = [];
const segments = Array.isArray(script.segments) ? script.segments : [];
const countCharacters = (text) => String(text ?? '').replace(/\s/gu, '').length;
const narrationText = segments.map((segment) => segment.narration ?? '').join('\n');
const scriptText = [
  script.title,
  script.angle,
  ...segments.flatMap((segment) => [segment.section, segment.kicker, segment.narration]),
]
  .filter(Boolean)
  .join('\n');

const addError = (message) => errors.push(message);
const addWarning = (message) => warnings.push(message);

if (!script.title?.trim() || script.title.includes('待确定')) {
  addError('script.title 尚未完成。');
}
if (!script.angle?.trim()) addError('script.angle 不能为空。');
if (segments.length === 0) addError('script.segments 不能为空。');

const segmentIds = new Set();
for (const [index, segment] of segments.entries()) {
  const label = `第 ${index + 1} 段`;
  if (!segment.id?.trim()) addError(`${label}缺少 id。`);
  else if (segmentIds.has(segment.id)) addError(`段落 id 重复：${segment.id}`);
  else segmentIds.add(segment.id);
  if (!segment.section?.trim()) addError(`${label}缺少 section。`);
  if (!segment.kicker?.trim()) addError(`${label}缺少 kicker。`);
  if (!segment.narration?.trim()) addError(`${label}缺少 narration。`);
  if (!Array.isArray(segment.sourceRefs) || segment.sourceRefs.length === 0) {
    addError(`${label}缺少 sourceRefs。`);
  }
}

const narrationCharacters = segments.reduce(
  (total, segment) => total + countCharacters(segment.narration),
  0,
);
const targetSeconds = Number(script.targetDurationSeconds ?? 600);
const recommendedMinimum = Math.round(targetSeconds * 4.1);
const recommendedMaximum = Math.round(targetSeconds * 5.2);
if (narrationCharacters < recommendedMinimum || narrationCharacters > recommendedMaximum) {
  addWarning(
    `口播共 ${narrationCharacters} 字；按当前固定配音经验，${targetSeconds} 秒目标建议先控制在 ${recommendedMinimum}～${recommendedMaximum} 字，再以真实音频为准。`,
  );
}

const openingText = segments
  .slice(0, 2)
  .flatMap((segment) => [segment.section, segment.kicker, segment.narration])
  .filter(Boolean)
  .join('\n');
const openingBoundaryPattern =
  /阅读边界|先分清.{0,8}(?:史实|小说)|(?:史实|历史).{0,5}(?:和|与).{0,5}小说|小说.{0,12}(?:不能|不可).{0,8}(?:史书|史实|史料)|不能.{0,8}把.{0,8}(?:情节|小说).{0,8}当成.{0,8}(?:史书|史实|史料)/u;
const openingException = script.editorialExceptions?.allowOpeningBoundaryDisclaimer === true;
if (openingBoundaryPattern.test(openingText)) {
  if (!openingException) {
    addError(
      '前两段出现独立的“史实与小说边界”提示。默认应把必要边界自然放入相关叙述，不得在开场后用整段免责声明消耗留存。',
    );
  } else if (!script.editorialExceptions?.openingBoundaryReason?.trim()) {
    addError('允许开场边界提示时，必须填写 editorialExceptions.openingBoundaryReason。');
  }
}

try {
  assertEditorialStandards(context, script);
} catch (error) {
  addError(error instanceof Error ? error.message : String(error));
}

const webSourceIds = new Set(
  Array.isArray(sourceMap.webSources)
    ? sourceMap.webSources.map((source) => source.id).filter(Boolean)
    : [],
);
if (sourceMap.sourceMode === 'web-research') {
  if (webSourceIds.size === 0) addError('联网研究模式必须填写 webSources。');
  if (!sourceMap.accessedAt?.trim() || Number.isNaN(Date.parse(sourceMap.accessedAt))) {
    addError('联网研究模式必须填写有效的 accessedAt。');
  }
  if (webSourceIds.size !== sourceMap.webSources.length) {
    addError('webSources 的来源 id 不能为空或重复。');
  }
  for (const [index, source] of sourceMap.webSources.entries()) {
    const label = `webSources[${index}]`;
    if (!source.title?.trim()) addError(`${label}.title 不能为空。`);
    if (!source.publisher?.trim()) addError(`${label}.publisher 不能为空。`);
    try {
      const url = new URL(source.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
    } catch {
      addError(`${label}.url 必须是有效的 HTTP(S) 地址。`);
    }
    if (!Array.isArray(source.supports) || source.supports.length === 0) {
      addError(`${label}.supports 不能为空。`);
    }
  }
  for (const [index, segment] of segments.entries()) {
    for (const reference of segment.sourceRefs ?? []) {
      const ids = String(reference.lines ?? '')
        .split(/[；;,，]/u)
        .map((value) => value.trim())
        .filter(Boolean);
      for (const id of ids) {
        if (!webSourceIds.has(id)) addError(`第 ${index + 1} 段引用了不存在的来源：${id}`);
      }
    }
  }
} else if (!sourceMap.sourcePath?.trim() || !sourceMap.sourceSha256?.trim()) {
  addError('本地原文模式必须填写 sourcePath 和 sourceSha256。');
}

const terminology = Array.isArray(sourceMap.terminology) ? sourceMap.terminology : [];
if (terminology.length === 0) {
  addError(
    'source-map.json 必须填写 terminology，至少列出人名、地名、书中专名或多音字中的一项，并记录标准写法。',
  );
}
for (const [index, term] of terminology.entries()) {
  const label = `terminology[${index}]`;
  if (!term.canonical?.trim()) {
    addError(`${label}.canonical 不能为空。`);
    continue;
  }
  if (!term.pronunciation?.trim()) {
    addError(`${label}.pronunciation 不能为空。`);
  }
  if (term.requiredInScript !== false && !scriptText.includes(term.canonical)) {
    addError(`脚本未使用术语标准写法：${term.canonical}`);
  }
  for (const avoided of term.avoid ?? []) {
    if (avoided && scriptText.includes(avoided)) {
      addError(`脚本出现术语禁用写法“${avoided}”，应使用“${term.canonical}”。`);
    }
  }
  for (const sourceId of term.sourceRefs ?? []) {
    if (sourceMap.sourceMode === 'web-research' && !webSourceIds.has(sourceId)) {
      addError(`术语“${term.canonical}”引用了不存在的来源：${sourceId}`);
    }
  }
}

const selfReview = sourceMap.selfReview;
const requiredReviewChecks = [
  'terminologyVerified',
  'openingRetentionReviewed',
  'sentenceFluencyReviewed',
  'sourceConsistencyReviewed',
  'originalityAndCommentaryReviewed',
];
if (!selfReview) {
  addError('source-map.json 缺少 Codex 自审记录 selfReview。');
} else {
  if (selfReview.status !== 'passed') addError('Codex 自审尚未标记为 passed。');
  if (!selfReview.reviewedAt || Number.isNaN(Date.parse(selfReview.reviewedAt))) {
    addError('Codex 自审缺少有效的 reviewedAt。');
  }
  if (selfReview.scriptSha256 !== hash) {
    addError(`Codex 自审哈希与当前脚本不一致；当前脚本 SHA-256：${hash}`);
  }
  const incompleteChecks = requiredReviewChecks.filter(
    (check) => selfReview.checks?.[check] !== true,
  );
  if (incompleteChecks.length > 0) {
    addError(`Codex 自审项未完成：${incompleteChecks.join(', ')}`);
  }
}

const narrationCounts = new Map();
for (const segment of segments) {
  const normalized = String(segment.narration ?? '').replace(/\s/gu, '');
  if (!normalized) continue;
  narrationCounts.set(normalized, (narrationCounts.get(normalized) ?? 0) + 1);
}
if ([...narrationCounts.values()].some((count) => count > 1)) {
  addError('脚本存在完全重复的口播段落。');
}

for (const warning of warnings) console.warn(`警告：${warning}`);
if (errors.length > 0) {
  console.error('脚本质量门未通过：');
  for (const error of errors) console.error(`- ${error}`);
  throw new Error(`共发现 ${errors.length} 个必须修正的问题。`);
}

console.log(`脚本质量门通过：${context.bookId}`);
console.log(`脚本 SHA-256：${hash}`);
console.log(`口播段落：${segments.length} 段`);
console.log(`口播字符：${narrationCharacters} 个（不含空白）`);
console.log('已验证：专名、自审记录、开场留存、来源引用、编辑禁则与基础结构。');
