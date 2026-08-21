import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {getBookContext} from './book-context.mjs';
import {formatPublishCopy, readPublishMaterials} from './publish-materials.mjs';

const context = getBookContext();
const outputName = context.book.deliverables?.publishCopy;
if (!outputName) {
  console.log(`当前作品未启用发布物料交付：${context.bookId}`);
  process.exit(0);
}

const {errors, materials} = readPublishMaterials(context);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

const outputPath = path.resolve(context.bookRoot, outputName);
const relative = path.relative(context.outputDir, outputPath);
if (relative.startsWith('..') || path.isAbsolute(relative)) {
  throw new Error(`发布物料必须输出到当前作品的 output 目录：${outputPath}`);
}

mkdirSync(context.outputDir, {recursive: true});
writeFileSync(outputPath, formatPublishCopy(materials), 'utf8');
console.log(`发布物料已生成：${outputPath}`);
