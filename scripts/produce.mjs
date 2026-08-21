import {spawnSync} from 'node:child_process';
import {
  assertScriptApproved,
  getBookContext,
  readJson,
  writeJson,
} from './book-context.mjs';

const context = getBookContext();
assertScriptApproved(context);
const node = process.execPath;
const run = (script, args = []) => {
  const result = spawnSync(node, [script, ...args], {
    cwd: context.root,
    stdio: 'inherit',
    env: {...process.env, AI_MEDIA_BOOK_ID: context.bookId},
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

console.log(`开始制作：${context.bookId}`);
run('scripts/preflight.mjs');
run('scripts/generate-narration.mjs', process.argv.includes('--force-voice') ? ['--force'] : []);
run('scripts/prepare.mjs');
run('scripts/check.mjs');
run('scripts/render-book.mjs', ['all']);
run('scripts/generate-publish-copy.mjs');
run('scripts/check.mjs', ['--outputs']);

const book = readJson(context.bookConfigPath);
book.status = 'completed';
book.updatedAt = new Date().toISOString();
book.completedAt = new Date().toISOString();
writeJson(context.bookConfigPath, book);
console.log(`制作完成：${context.outputDir}`);
