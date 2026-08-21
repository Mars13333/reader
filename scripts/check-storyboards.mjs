import path from 'node:path';
import {getBookContext, readJson} from './book-context.mjs';
import {inspectStoryboardStandard} from './storyboard-standard.mjs';
import {inspectSemanticVisualPlan} from './semantic-visual-plan.mjs';

const context = getBookContext();
const visualPlan = readJson(path.join(context.contentDir, 'visual-plan.json'));
const script = readJson(path.join(context.contentDir, 'script.json'));
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
const semanticResult = inspectSemanticVisualPlan({
  book: context.book,
  script,
  visualPlan,
});
if (semanticResult.errors.length) {
  for (const error of semanticResult.errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

const dimensions = [...new Set(result.assets.map(({width, height}) => `${width}x${height}`))];
console.log(
  `PASS ${context.bookId}: ${result.assets.length} 张分镜母图均为纵向 9:16（${dimensions.join(', ')}）` +
    `${semanticResult.enabled ? `；${semanticResult.keyMomentCount} 个关键剧情/概念均已映射且无英文画面通过人工复核` : ''}。`,
);
