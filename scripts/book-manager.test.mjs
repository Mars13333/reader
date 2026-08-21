import assert from 'node:assert/strict';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {
  REQUIRED_CLOSING_BRAND_LINE,
  SOURCE_LED_CHANNEL_STANDARD,
  assertEditorialStandards,
} from './book-context.mjs';

const readJson = (filePath) => JSON.parse(readFileSync(filePath, 'utf8'));

test('new books use the post-book-002 visual and delivery standard', () => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'ai-media-book-manager-'));
  try {
    const scriptsDir = path.join(temporaryRoot, 'scripts');
    mkdirSync(scriptsDir, {recursive: true});
    cpSync(new URL('./book-context.mjs', import.meta.url), path.join(scriptsDir, 'book-context.mjs'));
    cpSync(new URL('./book-manager.mjs', import.meta.url), path.join(scriptsDir, 'book-manager.mjs'));
    cpSync(new URL('./source-file.mjs', import.meta.url), path.join(scriptsDir, 'source-file.mjs'));
    cpSync(new URL('./storyboard-standard.mjs', import.meta.url), path.join(scriptsDir, 'storyboard-standard.mjs'));
    const sourceDir = path.join(temporaryRoot, 'source');
    mkdirSync(sourceDir, {recursive: true});
    writeFileSync(path.join(sourceDir, '测试书.txt'), '第一章\n这是用于测试的完整原文。\n', 'utf8');

    const result = spawnSync(
      process.execPath,
      [
        path.join(scriptsDir, 'book-manager.mjs'),
        'new',
        '--title',
        '测试书',
        '--author',
        '测试作者',
        '--audience',
        '测试观众',
        '--source',
        '测试书.txt',
      ],
      {cwd: temporaryRoot, encoding: 'utf8'},
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const bookRoot = path.join(temporaryRoot, 'books', 'book-001-测试书');
    const book = readJson(path.join(bookRoot, 'book.json'));
    const videoLayout = readJson(path.join(bookRoot, 'content', 'video-layout.json'));
    const cover = readJson(path.join(bookRoot, 'content', 'cover.json'));
    const visualPlan = readJson(path.join(bookRoot, 'content', 'visual-plan.json'));
    const sourceMap = readJson(path.join(bookRoot, 'content', 'source-map.json'));
    const script = readJson(path.join(bookRoot, 'content', 'script.json'));

    assert.equal(book.editorialStandards.visualStandard, 'book-jacket-v2');
    assert.equal(book.editorialStandards.storyboardStandard, 'portrait-2x2-9x16-v1');
    assert.equal(book.editorialStandards.sourceStandard, 'local-source-v1');
    assert.equal(book.editorialStandards.channelStandard, 'source-led-unbounded-v2');
    assert.equal(book.editorialStandards.contentStandard, 'source-analogy-commentary-v2');
    assert.equal(book.editorialStandards.visualCoverageStandard, 'semantic-key-moments-v1');
    assert.equal(book.editorialStandards.introStandard, 'book-picker-v1');
    assert.equal(
      book.editorialStandards.requiredClosingBrandLine,
      '这里是陈拾叁，陪你一起读书破万卷。',
    );
    assert.deepEqual(book.editorialStandards.durationRangeSeconds, {
      minimum: 480,
      maximum: 1140,
      default: 720,
    });
    assert.deepEqual(book.deliverables.covers, [
      'output/cover-3x4.png',
      'output/cover-4x3.png',
    ]);
    assert.equal(videoLayout.visualTreatment.backgroundColor, '#000000');
    assert.equal(videoLayout.header.fontSize, 44);
    assert.equal(videoLayout.header.text, '《测试书》');
    assert.equal(videoLayout.bookPickerIntro.enabled, true);
    assert.equal(videoLayout.bookPickerIntro.standard, 'book-picker-v1');
    assert.ok(videoLayout.bookPickerIntro.candidateLabels.every((label) => !/[A-Za-z]/u.test(label)));
    assert.equal(videoLayout.keywordCard.minimumVisibleSeconds, 6);
    assert.equal(videoLayout.keywordCard.secondsPerCharacter, 0.35);
    assert.equal(cover.design, 'book-jacket-v2');
    assert.equal(cover.bookTitle, '测试书');
    assert.equal(cover.badge, '陈拾叁读书');
    assert.doesNotMatch(JSON.stringify({videoLayout, cover}), /10分钟读书|十分钟读书/u);
    assert.equal(visualPlan.standard, 'semantic-key-moments-v1');
    assert.equal(visualPlan.durationPolicy, 'semantic-weighted-v1');
    assert.equal(visualPlan.visibleTextLanguage, 'zh-CN');
    assert.equal(visualPlan.storyboardStandard, 'portrait-2x2-9x16-v1');
    assert.equal(visualPlan.canvasAspectRatio, '9:16');
    assert.equal(visualPlan.panelLayout, '2x2');
    assert.equal(cover.layouts.vertical9x16, undefined);
    assert.ok(cover.layouts.portrait3x4);
    assert.ok(cover.layouts.landscape4x3);
    assert.equal(sourceMap.sourceMode, 'local-source');
    assert.equal(sourceMap.sourcePath, 'source/测试书.txt');
    assert.equal(sourceMap.sourceEncoding, 'UTF-8');
    assert.match(sourceMap.sourceSha256, /^[A-F0-9]{64}$/u);
    assert.equal(sourceMap.selfReview.checks.storyCoverageReviewed, false);
    assert.equal(script.retentionPlan.sourceAnchorRatioMinimum, 0.6);
    assert.equal(script.retentionPlan.maxConsecutiveAbstractSegments, 2);
    assert.equal(script.retentionPlan.introductionTargetSeconds, 40);
    assert.equal(script.retentionPlan.firstConcreteSceneDeadlineSeconds, 45);
    assert.equal(script.targetDurationSeconds, 720);
    assert.equal(
      script.contentFlow.standard,
      'reality-scene-source-explanation-reality-limits-v1',
    );
    assert.equal(sourceMap.selfReview.checks.contentFlowReviewed, false);
    assert.equal(sourceMap.selfReview.checks.contentLayerDistinctionReviewed, false);
    assert.equal(sourceMap.selfReview.checks.semanticVisualMomentsReviewed, false);
    assert.equal(sourceMap.selfReview.checks.closingBrandLineReviewed, false);
  } finally {
    rmSync(temporaryRoot, {recursive: true, force: true});
  }
});

test('new books require the exact closing sentence once while legacy books stay compatible', () => {
  const newBookContext = {
    book: {
      editorialStandards: {
        channelStandard: SOURCE_LED_CHANNEL_STANDARD,
        requiredClosingBrandLine: REQUIRED_CLOSING_BRAND_LINE,
      },
    },
  };
  const validScript = {
    segments: [{narration: `前文。${REQUIRED_CLOSING_BRAND_LINE}`}],
  };
  assert.doesNotThrow(() => assertEditorialStandards(newBookContext, validScript));
  assert.throws(
    () => assertEditorialStandards(newBookContext, {segments: [{narration: '前文。'}]}),
    /最后一句口播必须是/u,
  );
  assert.throws(
    () => assertEditorialStandards(newBookContext, {
      segments: [
        {narration: REQUIRED_CLOSING_BRAND_LINE},
        {narration: REQUIRED_CLOSING_BRAND_LINE},
      ],
    }),
    /必须且只能/u,
  );

  const legacyContext = {book: {editorialStandards: {allowClosingBrandLine: true}}};
  assert.doesNotThrow(() =>
    assertEditorialStandards(legacyContext, {segments: [{narration: '旧作品原有结尾。'}]}),
  );
});
