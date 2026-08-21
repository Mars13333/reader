import path from 'node:path';
import {getBookContext, readJson} from './book-context.mjs';
import {inspectStoryboardStandard} from './storyboard-standard.mjs';

const context = getBookContext();
const visualPlan = readJson(path.join(context.contentDir, 'visual-plan.json'));
const result = inspectStoryboardStandard({
  book: context.book,
  visualPlan,
  publicDir: context.publicDir,
});

if (!result.enabled) {
  console.log(`SKIP ${context.bookId}: 旧书未启用纵向分镜母图标准。`);
  process.exit(0);
}
if (result.errors.length) {
  for (const error of result.errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

const dimensions = [...new Set(result.assets.map(({width, height}) => `${width}x${height}`))];
console.log(
  `PASS ${context.bookId}: ${result.assets.length} 张分镜母图均为纵向 9:16（${dimensions.join(', ')}）。`,
);
