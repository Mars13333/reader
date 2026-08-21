import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  readBoundBookSource,
  resolveProjectSource,
} from './source-file.mjs';

test('resolves, binds, and detects replacement of a source-directory original', () => {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'ai-media-source-'));
  try {
    const sourceDir = path.join(projectRoot, 'source');
    const contentDir = path.join(projectRoot, 'books', 'book-001-test', 'content');
    mkdirSync(sourceDir, {recursive: true});
    mkdirSync(contentDir, {recursive: true});
    const sourceFile = path.join(sourceDir, '测试书.txt');
    writeFileSync(sourceFile, '第一章\n人物进入故事。\n', 'utf8');

    const source = resolveProjectSource({
      sourceReference: '测试书',
      projectRoot,
    });
    assert.equal(source.sourcePath, 'source/测试书.txt');
    assert.equal(source.sourceEncoding, 'UTF-8');
    assert.match(source.sourceSha256, /^[A-F0-9]{64}$/u);

    const sourceMap = {
      sourceMode: 'local-source',
      sourcePath: source.sourcePath,
      sourceSha256: source.sourceSha256,
      sourceEncoding: source.sourceEncoding,
    };
    writeFileSync(
      path.join(contentDir, 'source-map.json'),
      `${JSON.stringify(sourceMap, null, 2)}\n`,
      'utf8',
    );
    const context = {root: projectRoot, contentDir};
    assert.equal(readBoundBookSource(context).sourceSha256, source.sourceSha256);

    writeFileSync(sourceFile, '第二份不同原文。\n', 'utf8');
    assert.throws(() => readBoundBookSource(context), /SHA-256 已变化/u);
  } finally {
    rmSync(projectRoot, {recursive: true, force: true});
  }
});

test('rejects source paths outside the project source directory', () => {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'ai-media-source-path-'));
  try {
    mkdirSync(path.join(projectRoot, 'source'), {recursive: true});
    assert.throws(
      () => resolveProjectSource({sourceReference: '../outside.txt', projectRoot}),
      /必须位于项目 source 目录内/u,
    );
  } finally {
    rmSync(projectRoot, {recursive: true, force: true});
  }
});
