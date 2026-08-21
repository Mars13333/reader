import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SEMANTIC_VISUAL_STANDARD,
  inspectSemanticVisualPlan,
} from './semantic-visual-plan.mjs';

const book = {
  editorialStandards: {visualCoverageStandard: SEMANTIC_VISUAL_STANDARD},
};
const phase = (segmentIds) => ({summary: '测试摘要', segmentIds});
const script = {
  contentFlow: {
    loops: [{
      realityQuestion: phase(['s1']),
      concreteScene: phase(['s1']),
      sourceCore: phase(['s1']),
      explanation: phase(['s1']),
      returnToReality: phase(['s1']),
      limitations: phase(['s1']),
    }],
  },
  segments: [{id: 's1'}],
};
const visualPlan = {
  standard: SEMANTIC_VISUAL_STANDARD,
  durationPolicy: 'semantic-weighted-v1',
  visibleTextLanguage: 'zh-CN',
  generatedTextPolicy: 'no-text-in-generated-images',
  visualDirection: {avoid: ['英文', '字母', '生成式文字']},
  assetReview: {
    status: 'passed',
    semanticCoverageReviewed: true,
    noEnglishVisible: true,
  },
  segments: [{
    id: 's1',
    shots: [
      {image: 'assets/storyboards/a.png', panel: 0, label: '原著场景', purpose: 'source-scene', weight: 2},
      {image: 'assets/storyboards/a.png', panel: 1, label: '核心概念', purpose: 'core-concept', weight: 1},
      {image: 'assets/storyboards/a.png', panel: 2, label: '现代类比', purpose: 'modern-analogy', weight: 1},
      {image: 'assets/storyboards/a.png', panel: 3, label: '局限', purpose: 'limitation', weight: 1},
    ],
  }],
  keyMoments: [
    {id: 'k1', segmentId: 's1', kind: 'source-scene', anchor: '原著关键场景', shotRef: 's1-01'},
    {id: 'k2', segmentId: 's1', kind: 'core-concept', anchor: '核心概念', shotRef: 's1-02'},
    {id: 'k3', segmentId: 's1', kind: 'modern-analogy', anchor: '回到现实', shotRef: 's1-03'},
    {id: 'k4', segmentId: 's1', kind: 'limitation', anchor: '补充局限', shotRef: 's1-04'},
  ],
};

test('accepts semantic key-moment coverage without a fixed shot count', () => {
  const result = inspectSemanticVisualPlan({book, script, visualPlan});
  assert.deepEqual(result.errors, []);
  assert.equal(result.shotCount, 4);
  assert.equal(result.keyMomentCount, 4);
});

test('rejects missing key-concept coverage and visible English review', () => {
  const invalid = structuredClone(visualPlan);
  invalid.keyMoments = invalid.keyMoments.filter((moment) => moment.kind !== 'core-concept');
  invalid.assetReview.noEnglishVisible = false;
  const result = inspectSemanticVisualPlan({book, script, visualPlan: invalid});
  assert.ok(result.errors.some((error) => error.includes('解释原理')));
  assert.ok(result.errors.some((error) => error.includes('英文')));
});

test('requires every selected key moment to use a distinct shot', () => {
  const invalid = structuredClone(visualPlan);
  invalid.keyMoments[1].shotRef = invalid.keyMoments[0].shotRef;
  invalid.keyMoments[1].kind = invalid.keyMoments[0].kind;
  const result = inspectSemanticVisualPlan({book, script, visualPlan: invalid});
  assert.ok(result.errors.some((error) => error.includes('独立镜头')));
});
