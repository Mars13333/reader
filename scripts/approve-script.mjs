import {existsSync} from 'node:fs';
import path from 'node:path';
import {
  assertEditorialStandards,
  assertScriptApproved,
  getBookContext,
  getScriptState,
  readJson,
  writeJson,
} from './book-context.mjs';

const context = getBookContext();
const checkOnly = process.argv.includes('--check');

if (checkOnly) {
  const {approval} = assertScriptApproved(context);
  console.log(`脚本已批准：${approval.scriptSha256}`);
  process.exit(0);
}

const manifestPath = path.join(context.generatedDir, 'review-manifest.json');
if (!existsSync(manifestPath)) {
  throw new Error('尚未生成审稿文件。请先运行 npm run book:review。');
}
const manifest = readJson(manifestPath);
const {script, hash} = getScriptState(context);
assertEditorialStandards(context, script);
if (manifest.scriptSha256 !== hash) {
  throw new Error('脚本在审稿文件生成后又发生变化。请重新运行 npm run book:review。');
}

const previousVersion = existsSync(context.approvalPath)
  ? Number(readJson(context.approvalPath).version ?? 0)
  : 0;
const approval = {
  bookId: context.bookId,
  status: 'approved',
  version: previousVersion + 1,
  scriptSha256: hash,
  approvedAt: new Date().toISOString(),
  segments: script.segments.length,
  fixedNarration: {
    speaker: 'zh_male_liufei_uranus_bigtts',
    speechRate: -10,
  },
};
writeJson(context.approvalPath, approval);

const book = readJson(context.bookConfigPath);
book.status = 'approved';
book.updatedAt = new Date().toISOString();
writeJson(context.bookConfigPath, book);

console.log(`脚本批准完成：v${approval.version}`);
console.log(`脚本哈希：${approval.scriptSha256}`);
console.log('现在才可以设计分镜、生成插画并运行 npm run book:produce。');
