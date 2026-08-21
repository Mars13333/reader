import {existsSync, statSync} from 'node:fs';
import path from 'node:path';
import {
  BOOK_PICKER_INTRO_STANDARD,
  SOURCE_LED_CHANNEL_STANDARD,
  assertEditorialStandards,
  assertFixedNarration,
  assertScriptApproved,
  getBookContext,
  readJson,
} from './book-context.mjs';
import {readPublishMaterials} from './publish-materials.mjs';
import {inspectStoryboardStandard} from './storyboard-standard.mjs';
import {inspectSemanticVisualPlan} from './semantic-visual-plan.mjs';

const context = getBookContext();
const {scriptState} = assertScriptApproved(context);
assertEditorialStandards(context, scriptState.script);
const narration = readJson(path.join(context.contentDir, 'narration-config.json'));
const visualPlan = readJson(path.join(context.contentDir, 'visual-plan.json'));
const cover = readJson(path.join(context.contentDir, 'cover.json'));
const layout = readJson(path.join(context.contentDir, 'video-layout.json'));
assertFixedNarration(narration);

const errors = [];
errors.push(
  ...inspectStoryboardStandard({
    book: context.book,
    visualPlan,
    publicDir: context.publicDir,
  }).errors,
);
errors.push(
  ...inspectSemanticVisualPlan({
    book: context.book,
    script: scriptState.script,
    visualPlan,
  }).errors,
);
const usesBookJacketV2 = context.book.editorialStandards?.visualStandard === 'book-jacket-v2';
const usesSourceLedStandard =
  context.book.editorialStandards?.channelStandard === SOURCE_LED_CHANNEL_STANDARD;
if (context.book.deliverables?.publishCopy) {
  const {errors: publishErrors} = readPublishMaterials(context);
  errors.push(...publishErrors);
}
const visualById = new Map((visualPlan.segments ?? []).map((segment) => [segment.id, segment]));
for (const segment of scriptState.script.segments ?? []) {
  const visual = visualById.get(segment.id);
  if (!visual) {
    errors.push(`缺少分镜配置：${segment.id}`);
    continue;
  }
  if (!Array.isArray(visual.shots) || visual.shots.length < 1) {
    errors.push(`${segment.id} 至少需要 1 个按语义选择的镜头。`);
  }
  const images = [
    visual.image,
    ...(visual.shots ?? []).map((shot) => shot.image),
  ].filter((image, index, values) => image && values.indexOf(image) === index);
  for (const image of images) {
    const imagePath = path.join(context.publicDir, image);
    if (!existsSync(imagePath) || statSync(imagePath).size < 100_000) {
      errors.push(`缺少或无效的分镜插画：${imagePath}`);
    }
  }
}
if (visualById.size !== scriptState.script.segments.length) {
  errors.push('脚本段落数与分镜段落数不一致。');
}

const coverPath = path.join(context.publicDir, cover.image ?? '');
if (!existsSync(coverPath) || statSync(coverPath).size < 1_000_000) {
  errors.push(`缺少或无效的封面插画：${coverPath}`);
}
if (usesBookJacketV2) {
  if (cover.design !== 'book-jacket-v2') errors.push('新书封面必须使用 book-jacket-v2 书籍正面版式。');
  if (cover.bookTitle !== context.book.title) errors.push('封面书名必须与 book.json 中的书名完全一致。');
  if (!cover.subtitle?.trim() || cover.subtitle.includes('待填写')) errors.push('封面推荐语尚未完成。');
  if (layout.visualTreatment?.backgroundColor !== '#000000') errors.push('新书首帧画布必须使用纯黑背景。');
  if (layout.header?.fontSize < 42 || layout.header?.fontSize > 48) errors.push('新书顶部常驻书名字号必须为 42～48px。');
  if (layout.keywordCard?.minimumVisibleSeconds < 6) errors.push('章节重点字至少展示 6 秒。');
  const expectedCovers = ['output/cover-3x4.png', 'output/cover-4x3.png'];
  if (JSON.stringify(context.book.deliverables?.covers) !== JSON.stringify(expectedCovers)) errors.push('新书只交付 3:4 和 4:3 两种封面。');
} else if (!Array.isArray(cover.headline) || cover.headline.length !== 3) {
  errors.push('旧版封面主标题必须正好三行。');
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
if (usesSourceLedStandard) {
  if (layout.header?.text !== `《${context.book.title}》`) {
    errors.push('新书常驻标题只能显示居中的书名，不得再附加“10分钟读书”等栏目标签。');
  }
  if (/(?:10\s*分钟|十分钟)读书/u.test(`${layout.header?.text ?? ''}${cover.badge ?? ''}`)) {
    errors.push('新书画面与封面不得出现“10分钟读书”。');
  }
  if (
    layout.bookPickerIntro?.enabled !== true ||
    layout.bookPickerIntro?.standard !== BOOK_PICKER_INTRO_STANDARD
  ) {
    errors.push(`新书必须启用 ${BOOK_PICKER_INTRO_STANDARD} 开场选书动画。`);
  }
  const pickerDuration = Number(layout.bookPickerIntro?.durationSeconds ?? 0);
  if (pickerDuration < 2.8 || pickerDuration > 4.8) {
    errors.push('开场选书动画必须为 2.8～4.8 秒，并与第一句口播同时开始。');
  }
  const candidateLabels = layout.bookPickerIntro?.candidateLabels ?? [];
  if (!Array.isArray(candidateLabels) || candidateLabels.length < 3) {
    errors.push('开场选书动画至少需要 3 个中文候选书名。');
  } else if (candidateLabels.some((label) => /[A-Za-z]/u.test(String(label)))) {
    errors.push('开场选书动画的候选书名不得出现英文。');
  }
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log(
  `制作前检查通过：${context.bookId}，${scriptState.script.segments.length} 段，` +
    `刘飞男声，语速 -10，分镜与封面素材齐备。`,
);
