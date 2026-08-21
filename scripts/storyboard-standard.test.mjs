import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  STORYBOARD_STANDARD,
  inspectStoryboardStandard,
  validateStoryboardDimensions,
} from './storyboard-standard.mjs';

const makePngHeader = (width, height) => {
  const header = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
};

const createPlan = () => ({
  storyboardStandard: STORYBOARD_STANDARD,
  canvasAspectRatio: '9:16',
  panelLayout: '2x2',
  panelOrder: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
  segments: [{id: 'hook', image: 'assets/storyboards/01-hook.png'}],
});

test('accepts exact and pixel-rounded portrait 9:16 storyboard sheets', () => {
  assert.deepEqual(validateStoryboardDimensions({width: 1080, height: 1920}), []);
  assert.deepEqual(validateStoryboardDimensions({width: 941, height: 1672}), []);
});

test('rejects square and non-9:16 storyboard sheets', () => {
  assert.match(
    validateStoryboardDimensions({width: 1254, height: 1254})[0],
    /不符合纵向 9:16/u,
  );
  assert.match(
    validateStoryboardDimensions({width: 1024, height: 1536})[0],
    /不符合纵向 9:16/u,
  );
});

test('uses a versioned standard for future-book opt-in', () => {
  assert.equal(STORYBOARD_STANDARD, 'portrait-2x2-9x16-v1');
});

test('inspects saved PNG assets for opted-in future books', () => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'ai-media-storyboards-'));
  try {
    const imagePath = path.join(temporaryRoot, 'assets', 'storyboards', '01-hook.png');
    mkdirSync(path.dirname(imagePath), {recursive: true});
    writeFileSync(imagePath, makePngHeader(1080, 1920));
    const result = inspectStoryboardStandard({
      book: {editorialStandards: {storyboardStandard: STORYBOARD_STANDARD}},
      visualPlan: createPlan(),
      publicDir: temporaryRoot,
    });
    assert.equal(result.enabled, true);
    assert.deepEqual(result.errors, []);

    writeFileSync(imagePath, makePngHeader(1254, 1254));
    const rejected = inspectStoryboardStandard({
      book: {editorialStandards: {storyboardStandard: STORYBOARD_STANDARD}},
      visualPlan: createPlan(),
      publicDir: temporaryRoot,
    });
    assert.match(rejected.errors[0], /1254x1254.*不符合纵向 9:16/u);
  } finally {
    rmSync(temporaryRoot, {recursive: true, force: true});
  }
});

test('does not retrofit the standard onto published legacy books', () => {
  const result = inspectStoryboardStandard({
    book: {editorialStandards: {visualStandard: 'book-jacket-v2'}},
    visualPlan: createPlan(),
    publicDir: 'Z:/not-used',
  });
  assert.equal(result.enabled, false);
  assert.deepEqual(result.errors, []);
});
