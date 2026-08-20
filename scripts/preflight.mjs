import {existsSync, statSync} from 'node:fs';
import path from 'node:path';
import {
  assertEditorialStandards,
  assertFixedNarration,
  assertScriptApproved,
  getBookContext,
  readJson,
} from './book-context.mjs';

const context = getBookContext();
const {scriptState} = assertScriptApproved(context);
assertEditorialStandards(context, scriptState.script);
const narration = readJson(path.join(context.contentDir, 'narration-config.json'));
const visualPlan = readJson(path.join(context.contentDir, 'visual-plan.json'));
const cover = readJson(path.join(context.contentDir, 'cover.json'));
const layout = readJson(path.join(context.contentDir, 'video-layout.json'));
assertFixedNarration(narration);

const errors = [];
const visualById = new Map((visualPlan.segments ?? []).map((segment) => [segment.id, segment]));
for (const segment of scriptState.script.segments ?? []) {
  const visual = visualById.get(segment.id);
  if (!visual) {
    errors.push(`缺少分镜配置：${segment.id}`);
    continue;
  }
  if (!Array.isArray(visual.shots) || visual.shots.length < 3) {
    errors.push(`${segment.id} 至少需要 3 个镜头。`);
  }
  const imagePath = path.join(context.publicDir, visual.image ?? '');
  if (!existsSync(imagePath) || statSync(imagePath).size < 100_000) {
    errors.push(`缺少或无效的分镜插画：${imagePath}`);
  }
}
if (visualById.size !== scriptState.script.segments.length) {
  errors.push('脚本段落数与分镜段落数不一致。');
}

const coverPath = path.join(context.publicDir, cover.image ?? '');
if (!existsSync(coverPath) || statSync(coverPath).size < 1_000_000) {
  errors.push(`缺少或无效的封面插画：${coverPath}`);
}
if (!Array.isArray(cover.headline) || cover.headline.length !== 3) {
  errors.push('封面主标题必须正好三行。');
}
if (layout.showProgressBar !== false) errors.push('视频不得生成自制播放进度条。');
if (layout.header?.top < 270 || layout.header?.top > 330) {
  errors.push('顶部常驻标题必须下移到搜索框安全区以下（270～330px）。');
}
if (layout.header?.sideMargin < 96 || layout.header?.sideMargin > 160) {
  errors.push('顶部常驻标题必须使用 96～160px 的左右对称安全边距。');
}
if (layout.keywordCard?.top < 460 || layout.keywordCard?.top > 560) {
  errors.push('章节重点大字必须下移到搜索框安全区以下（460～560px）。');
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log(
  `制作前检查通过：${context.bookId}，${scriptState.script.segments.length} 段，` +
    `刘飞男声，语速 -10，分镜与封面素材齐备。`,
);
