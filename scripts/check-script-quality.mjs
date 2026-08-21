import {existsSync} from 'node:fs';
import path from 'node:path';
import {
  CONTENT_FLOW_STANDARD,
  SOURCE_LED_CHANNEL_STANDARD,
  SOURCE_LED_CONTENT_STANDARD,
  SOURCE_LED_DURATION_RANGE_SECONDS,
  assertEditorialStandards,
  getBookContext,
  getScriptState,
  readJson,
} from './book-context.mjs';
import {CONTENT_FLOW_PHASES} from './semantic-visual-plan.mjs';
import {readPublishMaterials} from './publish-materials.mjs';
import {
  SOURCE_MODE,
  SOURCE_STANDARD,
  readBoundBookSource,
} from './source-file.mjs';

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
const channelStandard = context.book.editorialStandards?.channelStandard;
const usesSourceLedStandard = channelStandard === SOURCE_LED_CHANNEL_STANDARD;
const contentStandard = context.book.editorialStandards?.contentStandard;
const sourceLedContent =
  contentStandard === 'story-first-source-only-v1' ||
  contentStandard === SOURCE_LED_CONTENT_STANDARD;

if (!script.title?.trim() || script.title.includes('待确定')) {
  addError('script.title 尚未完成。');
}
if (!script.angle?.trim()) addError('script.angle 不能为空。');
if (segments.length === 0) addError('script.segments 不能为空。');
if (usesSourceLedStandard && /(?:10\s*分钟|十分钟)读书/u.test(scriptText)) {
  addError('新频道标准已取消“10分钟读书”全局标签，脚本标题、章节和口播均不得再使用。');
}
if (
  usesSourceLedStandard &&
  /不(?:复述|展开|讲述|剧透).{0,12}(?:具体)?(?:关卡|情节|剧情|反转|结局)/u.test(scriptText)
) {
  addError('新书默认服务没读过原著的观众，不得用“不复述具体剧情、反转或结局”回避核心原著内容。');
}

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
if (
  usesSourceLedStandard &&
  (!Number.isFinite(targetSeconds) ||
    targetSeconds < SOURCE_LED_DURATION_RANGE_SECONDS.minimum ||
    targetSeconds > SOURCE_LED_DURATION_RANGE_SECONDS.maximum)
) {
  addError(
    `新书 targetDurationSeconds 必须按内容量在 ${SOURCE_LED_DURATION_RANGE_SECONDS.minimum}～${SOURCE_LED_DURATION_RANGE_SECONDS.maximum} 秒之间选择，不再固定为 10 分钟。`,
  );
}
const recommendedMinimum = Math.round(targetSeconds * 4.1);
const recommendedMaximum = Math.round(targetSeconds * 5.2);
if (narrationCharacters < recommendedMinimum || narrationCharacters > recommendedMaximum) {
  addWarning(
    `口播共 ${narrationCharacters} 字；按当前固定配音经验，${targetSeconds} 秒目标建议先控制在 ${recommendedMinimum}～${recommendedMaximum} 字，再以真实音频为准。`,
  );
}

if (context.book.deliverables?.publishCopy) {
  const {errors: publishErrors} = readPublishMaterials(context);
  for (const error of publishErrors) addError(error);
}

const retentionStandard = context.book.editorialStandards?.retentionStandard;
if (retentionStandard) {
  const retentionPlan = script.retentionPlan;
  if (retentionStandard !== 'hook-payoff-loops-v1') {
    addError(`不支持的留存标准：${retentionStandard}`);
  } else if (!retentionPlan || typeof retentionPlan !== 'object') {
    addError('新作品必须填写 script.retentionPlan，记录开场钩子、首次兑现和后续悬念链。');
  } else {
    if (retentionPlan.standard !== retentionStandard) {
      addError(`retentionPlan.standard 必须为 ${retentionStandard}。`);
    }

    const hookDeadlineSeconds = Number(retentionPlan.hookDeadlineSeconds);
    const firstPayoffDeadlineSeconds = Number(retentionPlan.firstPayoffDeadlineSeconds);
    const loopCadenceSeconds = Number(retentionPlan.loopCadenceSeconds);
    const storyFirst = sourceLedContent;
    if (!Number.isFinite(hookDeadlineSeconds) || hookDeadlineSeconds <= 0 || hookDeadlineSeconds > 2) {
      addError('开场钩子必须在前 2 秒内出现：hookDeadlineSeconds 应大于 0 且不超过 2。');
    }
    if (
      !Number.isFinite(firstPayoffDeadlineSeconds) ||
      firstPayoffDeadlineSeconds < 10 ||
      firstPayoffDeadlineSeconds > 20
    ) {
      addError('首次价值兑现必须在前 10～20 秒完成：firstPayoffDeadlineSeconds 应晚于钩子且不超过 20。');
    }
    if (!Number.isFinite(loopCadenceSeconds) || loopCadenceSeconds < 20 || loopCadenceSeconds > 40) {
      addError('后续小悬念的计划间隔必须为 20～40 秒。');
    }
    if (storyFirst) {
      if (Number(retentionPlan.sourceAnchorRatioMinimum) !== 0.6) {
        addError('story-first 新书的 sourceAnchorRatioMinimum 必须为 0.6。');
      }
      if (Number(retentionPlan.maxConsecutiveAbstractSegments) !== 2) {
        addError('story-first 新书的 maxConsecutiveAbstractSegments 必须为 2。');
      }
    }
    if (usesSourceLedStandard) {
      const introductionTargetSeconds = Number(retentionPlan.introductionTargetSeconds);
      const firstConcreteSceneDeadlineSeconds = Number(
        retentionPlan.firstConcreteSceneDeadlineSeconds,
      );
      if (
        !Number.isFinite(introductionTargetSeconds) ||
        introductionTargetSeconds < 30 ||
        introductionTargetSeconds > 45
      ) {
        addError('引言目标时长必须控制在 30～45 秒。');
      }
      if (
        !Number.isFinite(firstConcreteSceneDeadlineSeconds) ||
        firstConcreteSceneDeadlineSeconds < 30 ||
        firstConcreteSceneDeadlineSeconds > 45
      ) {
        addError('第一个具体场景必须在前 30～45 秒内开始。');
      }
      const introductionSegmentIds = retentionPlan.introductionSegmentIds;
      if (!Array.isArray(introductionSegmentIds) || introductionSegmentIds.length === 0) {
        addError('retentionPlan.introductionSegmentIds 必须标出 30～45 秒引言包含的连续段落。');
      } else {
        const expectedIds = segments
          .slice(0, introductionSegmentIds.length)
          .map((segment) => segment.id);
        if (JSON.stringify(introductionSegmentIds) !== JSON.stringify(expectedIds)) {
          addError('introductionSegmentIds 必须从第一段开始连续排列，不能把中段包装成引言。');
        }
      }
    }

    const firstNarration = String(segments[0]?.narration ?? '');
    const normalizedFirstNarration = firstNarration.replace(/\s/gu, '');
    const openingHook = String(retentionPlan.openingHook ?? '').replace(/\s/gu, '');
    const firstPayoff = String(retentionPlan.firstPayoff ?? '').replace(/\s/gu, '');
    if (!openingHook) {
      addError('retentionPlan.openingHook 不能为空。');
    } else if (!normalizedFirstNarration.startsWith(openingHook)) {
      addError('第一段口播必须直接以 retentionPlan.openingHook 开始，不得先报书名、作者或栏目介绍。');
    }
    if (!firstPayoff) {
      addError('retentionPlan.firstPayoff 不能为空。');
    } else if (!normalizedFirstNarration.includes(firstPayoff)) {
      addError('第一段口播必须包含 retentionPlan.firstPayoff，在前 20 秒内兑现第一份价值。');
    }
    if (Number.isFinite(firstPayoffDeadlineSeconds)) {
      const openingCharacterLimit = Math.round(firstPayoffDeadlineSeconds * 5.2);
      if (countCharacters(firstNarration) > openingCharacterLimit) {
        addError(
          `第一段口播共 ${countCharacters(firstNarration)} 字；为确保首次兑现不晚于 ${firstPayoffDeadlineSeconds} 秒，按固定配音经验应不超过 ${openingCharacterLimit} 字。`,
        );
      }
    }

    const segmentBeats = retentionPlan.segmentBeats;
    if (!Array.isArray(segmentBeats) || segmentBeats.length !== segments.length) {
      addError('retentionPlan.segmentBeats 必须与口播段落一一对应，记录每段兑现内容和下一悬念。');
    } else {
      const anchoredSegments = [];
      for (const [index, segment] of segments.entries()) {
        const beat = segmentBeats[index];
        const label = `segmentBeats[${index}]`;
        if (beat?.segmentId !== segment.id) {
          addError(`${label}.segmentId 必须按顺序对应 ${segment.id}。`);
        }
        if (typeof beat?.payoff !== 'string' || !beat.payoff.trim()) {
          addError(`${label}.payoff 不能为空。`);
        }
        if (
          index < segments.length - 1 &&
          (typeof beat?.nextHook !== 'string' || !beat.nextHook.trim())
        ) {
          addError(`${label}.nextHook 不能为空；每段兑现后必须自然引出下一问题。`);
        }
        if (storyFirst) {
          if (typeof beat?.sourceAnchor !== 'string') {
            addError(`${label}.sourceAnchor 必须是字符串；具体新场景写人物、行动和后果，纯分析段明确留空。`);
            anchoredSegments.push(false);
          } else {
            anchoredSegments.push(Boolean(beat.sourceAnchor.trim()));
          }
        }
        if (usesSourceLedStandard) {
          const layers = Array.isArray(beat?.contentLayers) ? beat.contentLayers : [];
          const allowedLayers = new Set(['source', 'analogy', 'commentary', 'bridge']);
          if (layers.length === 0 || layers.some((layer) => !allowedLayers.has(layer))) {
            addError(
              `${label}.contentLayers 必须从 source、analogy、commentary、bridge 中选择至少一项。`,
            );
          }
          if (layers.includes('source') && !String(beat?.sourceAnchor ?? '').trim()) {
            addError(`${label} 标记为 source 时必须填写具体 sourceAnchor。`);
          }
        }
      }
      if (storyFirst && anchoredSegments.length === segments.length) {
        const anchoredCount = anchoredSegments.filter(Boolean).length;
        const minimumAnchored = Math.ceil(segments.length * 0.6);
        if (anchoredCount < minimumAnchored) {
          addError(
            `具体原文场景仅覆盖 ${anchoredCount}/${segments.length} 段；story-first 新书至少需要 ${minimumAnchored} 段。`,
          );
        }
        let consecutiveAbstract = 0;
        for (const anchored of anchoredSegments) {
          consecutiveAbstract = anchored ? 0 : consecutiveAbstract + 1;
          if (consecutiveAbstract > 2) {
            addError('不得连续超过两个段落没有新的具体原文场景。');
            break;
          }
        }
      }
      if (usesSourceLedStandard && Array.isArray(segmentBeats)) {
        const usedLayers = new Set(segmentBeats.flatMap((beat) => beat?.contentLayers ?? []));
        for (const requiredLayer of ['source', 'analogy', 'commentary']) {
          if (!usedLayers.has(requiredLayer)) {
            addError(`整条脚本必须包含 ${requiredLayer} 内容层，并用自然过渡帮助观众区分。`);
          }
        }
      }
    }
  }
}

if (usesSourceLedStandard) {
  const contentFlow = script.contentFlow;
  if (!contentFlow || contentFlow.standard !== CONTENT_FLOW_STANDARD) {
    addError(`script.contentFlow.standard 必须为 ${CONTENT_FLOW_STANDARD}。`);
  } else if (!Array.isArray(contentFlow.loops) || contentFlow.loops.length === 0) {
    addError('script.contentFlow.loops 不能为空；不限题材都必须落实现实问题到局限反思的完整链条。');
  } else {
    const segmentIndex = new Map(segments.map((segment, index) => [segment.id, index]));
    const loopIds = new Set();
    for (const [loopIndex, loop] of contentFlow.loops.entries()) {
      const label = `contentFlow.loops[${loopIndex}]`;
      if (!loop?.id?.trim()) addError(`${label}.id 不能为空。`);
      else if (loopIds.has(loop.id)) addError(`contentFlow loop id 重复：${loop.id}`);
      else loopIds.add(loop.id);
      let previousIndex = -1;
      for (const [phase, phaseLabel] of CONTENT_FLOW_PHASES) {
        const value = loop?.[phase];
        if (!value?.summary?.trim()) addError(`${label}.${phase}.summary 不能为空（${phaseLabel}）。`);
        const ids = Array.isArray(value?.segmentIds) ? value.segmentIds : [];
        if (ids.length === 0) {
          addError(`${label}.${phase}.segmentIds 不能为空（${phaseLabel}）。`);
          continue;
        }
        const indexes = ids.map((id) => segmentIndex.get(id));
        for (const [idIndex, index] of indexes.entries()) {
          if (index === undefined) addError(`${label}.${phase} 引用了不存在的段落：${ids[idIndex]}`);
        }
        const validIndexes = indexes.filter((index) => index !== undefined);
        if (validIndexes.length > 0) {
          const firstIndex = Math.min(...validIndexes);
          if (firstIndex < previousIndex) {
            addError(`${label} 的“${phaseLabel}”顺序早于上一环节；相邻环节可自然混在同一段，但不能倒序。`);
          }
          previousIndex = Math.max(previousIndex, firstIndex);
        }
      }
      const realityStart = segmentIndex.get(loop.realityQuestion?.segmentIds?.[0]);
      if (loopIndex === 0 && realityStart !== 0) {
        addError('第一条内容链必须从第一段的现实问题开始。');
      }
      const firstSceneIndexes = (loop.concreteScene?.segmentIds ?? [])
        .map((id) => segmentIndex.get(id))
        .filter((index) => index !== undefined);
      if (loopIndex === 0 && Math.min(...firstSceneIndexes) > 1) {
        addError('第一个具体场景必须最迟在第二段开始，不能让抽象引言继续拖长。');
      }
    }
  }
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
const sourceStandard = context.book.editorialStandards?.sourceStandard;
if (sourceStandard === SOURCE_STANDARD) {
  if (sourceMap.sourceMode !== SOURCE_MODE) {
    addError(`新作品必须使用 ${SOURCE_MODE}，不得使用联网资料模式。`);
  } else {
    try {
      readBoundBookSource(context, sourceMap);
    } catch (error) {
      addError(error instanceof Error ? error.message : String(error));
    }
  }
  if (Array.isArray(sourceMap.webSources) && sourceMap.webSources.length > 0) {
    addError('本地原文模式不得填写 webSources。');
  }
  for (const [index, segment] of segments.entries()) {
    for (const reference of segment.sourceRefs ?? []) {
      if (!reference.label?.trim() || !String(reference.lines ?? '').trim()) {
        addError(`第 ${index + 1} 段的原文引用必须填写 label 和 lines。`);
      }
    }
  }
} else if (sourceMap.sourceMode === 'web-research') {
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
  ...(retentionStandard ? ['retentionStructureReviewed'] : []),
  'sentenceFluencyReviewed',
  'sourceConsistencyReviewed',
  ...(context.book.editorialStandards?.contentStandard === 'story-first-source-only-v1'
    ? ['storyCoverageReviewed']
    : []),
  ...(usesSourceLedStandard
    ? [
        'storyCoverageReviewed',
        'contentFlowReviewed',
        'contentLayerDistinctionReviewed',
        'semanticVisualMomentsReviewed',
        'closingBrandLineReviewed',
      ]
    : []),
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
console.log(
  `已验证：专名、自审记录、开场留存、${retentionStandard ? '留存结构、' : ''}来源引用、编辑禁则与基础结构。`,
);
