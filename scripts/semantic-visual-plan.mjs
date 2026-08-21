const SEMANTIC_VISUAL_STANDARD = 'semantic-key-moments-v1';
const SEMANTIC_DURATION_POLICY = 'semantic-weighted-v1';
const GENERATED_TEXT_POLICY = 'no-text-in-generated-images';
const CONTENT_FLOW_PHASES = [
  ['realityQuestion', '现实问题', 'author-commentary'],
  ['concreteScene', '具体场景', 'source-scene'],
  ['sourceCore', '原著核心案例或剧情', 'source-scene'],
  ['explanation', '解释原理', 'core-concept'],
  ['returnToReality', '回到现实', 'modern-analogy'],
  ['limitations', '补充局限', 'limitation'],
];
const VISUAL_KINDS = new Set([
  'source-scene',
  'core-concept',
  'modern-analogy',
  'author-commentary',
  'limitation',
  'transition',
  'closing',
]);

const normalizeShotRef = (segmentId, shotIndex) =>
  `${segmentId}-${String(shotIndex + 1).padStart(2, '0')}`;

const inspectSemanticVisualPlan = ({book, script, visualPlan}) => {
  const configuredStandard = book.editorialStandards?.visualCoverageStandard;
  if (!configuredStandard) {
    return {enabled: false, standard: '', errors: [], warnings: []};
  }

  const errors = [];
  const warnings = [];
  if (configuredStandard !== SEMANTIC_VISUAL_STANDARD) {
    errors.push(`不支持的关键画面覆盖标准：${configuredStandard}`);
  }
  if (visualPlan.standard !== SEMANTIC_VISUAL_STANDARD) {
    errors.push(`visual-plan.json.standard 必须为 ${SEMANTIC_VISUAL_STANDARD}。`);
  }
  if (visualPlan.durationPolicy !== SEMANTIC_DURATION_POLICY) {
    errors.push(`visual-plan.json.durationPolicy 必须为 ${SEMANTIC_DURATION_POLICY}。`);
  }
  if (visualPlan.visibleTextLanguage !== 'zh-CN') {
    errors.push('visual-plan.json.visibleTextLanguage 必须为 zh-CN。');
  }
  if (visualPlan.generatedTextPolicy !== GENERATED_TEXT_POLICY) {
    errors.push(`visual-plan.json.generatedTextPolicy 必须为 ${GENERATED_TEXT_POLICY}。`);
  }

  const avoidText = (visualPlan.visualDirection?.avoid ?? []).join('、');
  if (!/英文/u.test(avoidText) || !/字母/u.test(avoidText) || !/文字/u.test(avoidText)) {
    errors.push('visualDirection.avoid 必须明确禁止英文、字母和生成式文字。');
  }

  const scriptSegments = Array.isArray(script.segments) ? script.segments : [];
  const scriptIds = new Set(scriptSegments.map((segment) => segment.id));
  const visualSegments = Array.isArray(visualPlan.segments) ? visualPlan.segments : [];
  const visualsById = new Map();
  const shotsByRef = new Map();
  const usedPanels = new Set();

  for (const visual of visualSegments) {
    if (!visual?.id || !scriptIds.has(visual.id)) {
      errors.push(`分镜段落引用了不存在的脚本段落：${visual?.id ?? '(empty)'}`);
      continue;
    }
    if (visualsById.has(visual.id)) {
      errors.push(`分镜段落 id 重复：${visual.id}`);
      continue;
    }
    visualsById.set(visual.id, visual);
    if (!Array.isArray(visual.shots) || visual.shots.length < 1 || visual.shots.length > 4) {
      errors.push(`${visual.id} 必须按语义需要规划 1～4 个镜头，不能按固定数量凑图。`);
      continue;
    }
    for (const [shotIndex, shot] of visual.shots.entries()) {
      const ref = normalizeShotRef(visual.id, shotIndex);
      const image = String(shot?.image ?? visual.image ?? '').trim();
      if (!image) errors.push(`${ref} 缺少分镜母图路径。`);
      if (!Number.isInteger(shot?.panel) || shot.panel < 0 || shot.panel > 3) {
        errors.push(`${ref}.panel 必须是 0～3。`);
      }
      if (!shot?.label?.trim()) errors.push(`${ref}.label 不能为空。`);
      if (!VISUAL_KINDS.has(shot?.purpose)) {
        errors.push(`${ref}.purpose 必须说明这是原著场景、核心概念、现代类比、作者判断或局限。`);
      }
      const weight = Number(shot?.weight ?? 1);
      if (!Number.isFinite(weight) || weight <= 0 || weight > 6) {
        errors.push(`${ref}.weight 必须大于 0 且不超过 6，用于按内容重要性分配停留时间。`);
      }
      const visualKey = `${image}#${shot?.panel}`;
      if (image && Number.isInteger(shot?.panel)) {
        if (usedPanels.has(visualKey)) errors.push(`重复使用同一分镜子画面：${visualKey}`);
        usedPanels.add(visualKey);
      }
      shotsByRef.set(ref, {segmentId: visual.id, purpose: shot?.purpose, shot});
    }
  }
  for (const segment of scriptSegments) {
    if (!visualsById.has(segment.id)) errors.push(`缺少脚本段落的分镜配置：${segment.id}`);
  }
  if (visualsById.size !== scriptSegments.length) {
    errors.push('脚本段落与分镜段落必须一一对应，但每段镜头数量由语义决定。');
  }

  const keyMoments = Array.isArray(visualPlan.keyMoments) ? visualPlan.keyMoments : [];
  if (keyMoments.length === 0) {
    errors.push('visual-plan.json.keyMoments 不能为空；必须先挑出关键剧情和关键概念再生成图片。');
  }
  const keyMomentIds = new Set();
  const keyMomentShotRefs = new Set();
  const keyKindsBySegment = new Map();
  for (const [index, moment] of keyMoments.entries()) {
    const label = `keyMoments[${index}]`;
    if (!moment?.id?.trim()) errors.push(`${label}.id 不能为空。`);
    else if (keyMomentIds.has(moment.id)) errors.push(`关键画面 id 重复：${moment.id}`);
    else keyMomentIds.add(moment.id);
    if (!scriptIds.has(moment?.segmentId)) errors.push(`${label}.segmentId 不存在：${moment?.segmentId}`);
    if (!VISUAL_KINDS.has(moment?.kind) || moment.kind === 'transition' || moment.kind === 'closing') {
      errors.push(`${label}.kind 必须是原著场景、核心概念、现代类比、作者判断或局限。`);
    }
    if (!moment?.anchor?.trim()) errors.push(`${label}.anchor 必须写清对应的剧情、概念或判断。`);
    const shot = shotsByRef.get(moment?.shotRef);
    if (!shot) {
      errors.push(`${label}.shotRef 未指向有效镜头：${moment?.shotRef}`);
    } else {
      if (shot.segmentId !== moment.segmentId) {
        errors.push(`${label}.shotRef 必须属于 ${moment.segmentId}。`);
      }
      if (shot.purpose !== moment.kind) {
        errors.push(`${label}.kind 必须与 ${moment.shotRef}.purpose 一致。`);
      }
    }
    if (moment?.shotRef) {
      if (keyMomentShotRefs.has(moment.shotRef)) {
        errors.push(`每个关键内容必须使用独立镜头，重复映射：${moment.shotRef}`);
      }
      keyMomentShotRefs.add(moment.shotRef);
    }
    if (scriptIds.has(moment?.segmentId) && VISUAL_KINDS.has(moment?.kind)) {
      const kinds = keyKindsBySegment.get(moment.segmentId) ?? new Set();
      kinds.add(moment.kind);
      keyKindsBySegment.set(moment.segmentId, kinds);
    }
  }

  const loops = Array.isArray(script.contentFlow?.loops) ? script.contentFlow.loops : [];
  for (const [loopIndex, loop] of loops.entries()) {
    for (const [phase, phaseLabel, requiredKind] of CONTENT_FLOW_PHASES) {
      if (phase === 'realityQuestion') continue;
      const ids = Array.isArray(loop?.[phase]?.segmentIds) ? loop[phase].segmentIds : [];
      const covered = ids.some((id) => keyKindsBySegment.get(id)?.has(requiredKind));
      if (!covered) {
        errors.push(
          `contentFlow.loops[${loopIndex}] 的“${phaseLabel}”没有 ${requiredKind} 关键配图。`,
        );
      }
    }
  }

  if (visualPlan.assetReview?.status !== 'passed') {
    errors.push('分镜素材尚未完成 assetReview；保存图片并逐张检查后才能进入 TTS。');
  }
  if (visualPlan.assetReview?.semanticCoverageReviewed !== true) {
    errors.push('assetReview.semanticCoverageReviewed 必须为 true。');
  }
  if (visualPlan.assetReview?.noEnglishVisible !== true) {
    errors.push('assetReview.noEnglishVisible 必须为 true；画面不得出现英文或乱码文字。');
  }
  return {
    enabled: true,
    standard: configuredStandard,
    errors,
    warnings,
    shotCount: shotsByRef.size,
    keyMomentCount: keyMoments.length,
  };
};

export {
  CONTENT_FLOW_PHASES,
  GENERATED_TEXT_POLICY,
  SEMANTIC_DURATION_POLICY,
  SEMANTIC_VISUAL_STANDARD,
  inspectSemanticVisualPlan,
  normalizeShotRef,
};
