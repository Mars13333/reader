import assert from 'node:assert/strict';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const readJson = (filePath) => JSON.parse(readFileSync(filePath, 'utf8'));

test('new books use the post-book-002 visual and delivery standard', () => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'ai-media-book-manager-'));
  try {
    const scriptsDir = path.join(temporaryRoot, 'scripts');
    mkdirSync(scriptsDir, {recursive: true});
    cpSync(new URL('./book-context.mjs', import.meta.url), path.join(scriptsDir, 'book-context.mjs'));
    cpSync(new URL('./book-manager.mjs', import.meta.url), path.join(scriptsDir, 'book-manager.mjs'));
    cpSync(new URL('./storyboard-standard.mjs', import.meta.url), path.join(scriptsDir, 'storyboard-standard.mjs'));

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
      ],
      {cwd: temporaryRoot, encoding: 'utf8'},
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const bookRoot = path.join(temporaryRoot, 'books', 'book-001-测试书');
    const book = readJson(path.join(bookRoot, 'book.json'));
    const videoLayout = readJson(path.join(bookRoot, 'content', 'video-layout.json'));
    const cover = readJson(path.join(bookRoot, 'content', 'cover.json'));
    const visualPlan = readJson(path.join(bookRoot, 'content', 'visual-plan.json'));

    assert.equal(book.editorialStandards.visualStandard, 'book-jacket-v2');
    assert.equal(book.editorialStandards.storyboardStandard, 'portrait-2x2-9x16-v1');
    assert.deepEqual(book.deliverables.covers, [
      'output/cover-3x4.png',
      'output/cover-4x3.png',
    ]);
    assert.equal(videoLayout.visualTreatment.backgroundColor, '#000000');
    assert.equal(videoLayout.header.fontSize, 44);
    assert.equal(videoLayout.keywordCard.minimumVisibleSeconds, 6);
    assert.equal(videoLayout.keywordCard.secondsPerCharacter, 0.35);
    assert.equal(cover.design, 'book-jacket-v2');
    assert.equal(cover.bookTitle, '测试书');
    assert.equal(visualPlan.storyboardStandard, 'portrait-2x2-9x16-v1');
    assert.equal(visualPlan.canvasAspectRatio, '9:16');
    assert.equal(visualPlan.panelLayout, '2x2');
    assert.equal(cover.layouts.vertical9x16, undefined);
    assert.ok(cover.layouts.portrait3x4);
    assert.ok(cover.layouts.landscape4x3);
  } finally {
    rmSync(temporaryRoot, {recursive: true, force: true});
  }
});
