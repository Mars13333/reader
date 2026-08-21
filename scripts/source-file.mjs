import {createHash} from 'node:crypto';
import {existsSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {readJson, root} from './book-context.mjs';

const SOURCE_MODE = 'local-source';
const SOURCE_STANDARD = 'local-source-v1';
const SOURCE_ENCODING = 'UTF-8';
const ALLOWED_SOURCE_EXTENSIONS = new Set(['.txt', '.md']);

const getSourceRoot = (projectRoot = root) => path.join(projectRoot, 'source');

const assertInsideSourceRoot = (candidate, projectRoot = root) => {
  const sourceRoot = getSourceRoot(projectRoot);
  const relative = path.relative(sourceRoot, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`原文文件必须位于项目 source 目录内：${sourceRoot}`);
  }
  return sourceRoot;
};

const inspectSourceFile = (absolutePath, projectRoot = root) => {
  assertInsideSourceRoot(absolutePath, projectRoot);
  const extension = path.extname(absolutePath).toLowerCase();
  if (!ALLOWED_SOURCE_EXTENSIONS.has(extension)) {
    throw new Error('原文仅支持 UTF-8 编码的 .txt 或 .md 文件。');
  }
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`未找到原文文件：${absolutePath}`);
  }
  const buffer = readFileSync(absolutePath);
  if (buffer.length === 0) throw new Error(`原文文件为空：${absolutePath}`);
  let text;
  try {
    text = new TextDecoder('utf-8', {fatal: true}).decode(buffer);
  } catch {
    throw new Error(`原文必须保存为 UTF-8 编码：${absolutePath}`);
  }
  if (!text.replace(/^\uFEFF/u, '').trim()) {
    throw new Error(`原文文件没有可读取的正文：${absolutePath}`);
  }
  return {
    absolutePath,
    sourcePath: path.relative(projectRoot, absolutePath).replaceAll('\\', '/'),
    sourceSha256: createHash('sha256').update(buffer).digest('hex').toUpperCase(),
    sourceEncoding: SOURCE_ENCODING,
  };
};

const resolveProjectSource = ({sourceReference = '', title = '', projectRoot = root}) => {
  const reference = String(sourceReference || title).trim();
  if (!reference) {
    throw new Error('缺少原文文件。请使用 --source 指定项目 source 目录下的文件名。');
  }
  if (path.isAbsolute(reference)) {
    throw new Error('--source 只能填写项目 source 目录内的相对文件名。');
  }
  const sourceRoot = getSourceRoot(projectRoot);
  const baseCandidate = path.resolve(sourceRoot, reference);
  assertInsideSourceRoot(baseCandidate, projectRoot);
  const candidates = path.extname(baseCandidate)
    ? [baseCandidate]
    : [`${baseCandidate}.txt`, `${baseCandidate}.md`];
  const matches = candidates.filter(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
  if (matches.length === 0) {
    const expected = candidates.map((candidate) => path.basename(candidate)).join(' 或 ');
    throw new Error(`source 目录中未找到原文：${expected}`);
  }
  if (matches.length > 1) {
    throw new Error(`存在多个同名原文，请在 --source 中写明扩展名：${reference}`);
  }
  return inspectSourceFile(matches[0], projectRoot);
};

const readBoundBookSource = (context, sourceMapValue) => {
  const sourceMapPath = path.join(context.contentDir, 'source-map.json');
  const sourceMap = sourceMapValue ?? readJson(sourceMapPath);
  if (sourceMap.sourceMode !== SOURCE_MODE) {
    throw new Error(
      `当前书没有绑定 source 目录原文。book:auto 只接受 sourceMode=${SOURCE_MODE}。`,
    );
  }
  const sourcePath = String(sourceMap.sourcePath ?? '').trim();
  if (!sourcePath || path.isAbsolute(sourcePath)) {
    throw new Error('source-map.json 的 sourcePath 必须是项目 source 目录内的相对路径。');
  }
  const absolutePath = path.resolve(context.root, sourcePath);
  const inspected = inspectSourceFile(absolutePath, context.root);
  if (inspected.sourcePath !== sourcePath.replaceAll('\\', '/')) {
    throw new Error(`sourcePath 必须使用规范的项目相对路径：${inspected.sourcePath}`);
  }
  if (String(sourceMap.sourceEncoding ?? '').toUpperCase() !== SOURCE_ENCODING) {
    throw new Error(`sourceEncoding 必须为 ${SOURCE_ENCODING}。`);
  }
  if (inspected.sourceSha256 !== String(sourceMap.sourceSha256 ?? '').toUpperCase()) {
    throw new Error(
      `原文 SHA-256 已变化：${sourcePath}。请不要在同一本书制作中替换原文。`,
    );
  }
  return inspected;
};

export {
  ALLOWED_SOURCE_EXTENSIONS,
  SOURCE_ENCODING,
  SOURCE_MODE,
  SOURCE_STANDARD,
  getSourceRoot,
  inspectSourceFile,
  readBoundBookSource,
  resolveProjectSource,
};
