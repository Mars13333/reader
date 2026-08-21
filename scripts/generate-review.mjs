import {existsSync} from 'node:fs';
import path from 'node:path';
import {
  assertEditorialStandards,
  getBookContext,
  getScriptState,
  readJson,
  writeJson,
} from './book-context.mjs';
import {writeFileSync} from 'node:fs';

const context = getBookContext();
const {script, hash} = getScriptState(context);
assertEditorialStandards(context, script);
if (!Array.isArray(script.segments) || script.segments.length === 0) {
  throw new Error('script.json 尚无口播段落。请先让 Codex 完成脚本草稿。');
}
if (script.segments.some((segment) => !segment.narration?.trim())) {
  throw new Error('script.json 中存在空口播段落，请补充后再生成审稿文件。');
}

const countCharacters = (text) => text.replace(/\s/gu, '').length;
const totalCharacters = script.segments.reduce(
  (total, segment) => total + countCharacters(segment.narration ?? ''),
  0,
);
const targetSeconds = Number(script.targetDurationSeconds ?? 600);
const usesRetentionStandard = Boolean(context.book.editorialStandards?.retentionStandard);
const markdown = [
  `# ${script.title}`,
  '',
  '> 当前文件是 Codex 自审后的内部归档。尚未生成分镜、插画、配音或视频。',
  '',
  `- 书籍：${context.book.title}`,
  `- 作者：${script.author || context.book.author}`,
  `- 目标观众：${context.book.audience}`,
  `- 解读角度：${script.angle || '待补充'}`,
  `- 口播段落：${script.segments.length} 段`,
  `- 口播字符：${totalCharacters} 个（不含空白）`,
  `- 目标时长：${(targetSeconds / 60).toFixed(1)} 分钟`,
  `- 固定配音：刘飞男声，语速 -10`,
  `- 脚本 SHA-256：${hash}`,
  '',
  '## Codex 自审重点',
  '',
  '- 已逐项核对专名、读音、别名和易错写法。',
  '- 已复核前两段留存，没有独立免责声明消耗开场。',
  ...(usesRetentionStandard
    ? ['- 已确认前 2 秒直接落钩、前 20 秒首次兑现，并为每段记录“兑现内容＋下一悬念”。']
    : []),
  '- 已逐句按口播朗读，清除病句、生造口语、歧义和重复。',
  '- 已核对来源，事实、小说情节与评论判断各归其位。',
  '- 已确认观点来自本书，没有照搬上一册结构或用剧情复述代替评论。',
  '',
  ...script.segments.flatMap((segment, index) => [
    `## ${index + 1}. ${segment.section}｜${segment.kicker}`,
    '',
    `预计占比：${Math.round((countCharacters(segment.narration) / totalCharacters) * 100)}%`,
    '',
    segment.narration,
    '',
    `出处：${(segment.sourceRefs ?? []).map((reference) => `${reference.label}（${reference.lines}）`).join('；') || '待补充'}`,
    '',
  ]),
  '## 后续授权',
  '',
  '- Codex 自审通过后只向用户交接：“审核通过，继续下一步就行。”',
  context.book.editorialStandards?.visualStandard === 'book-jacket-v2'
    ? '- 用户回复“脚本已批准，开始生成分镜、原创插画和两种发布封面”后，Codex 才运行 `npm run book:approve`。'
    : '- 用户回复“脚本已批准，开始生成分镜、原创插画和三种封面”后，Codex 才运行 `npm run book:approve`。',
  '- 用户主动提出修改时，回到脚本自审并重新生成本归档。',
].join('\n');

const reviewPath = path.join(context.generatedDir, 'script-review.md');
writeFileSync(reviewPath, `${markdown}\n`, 'utf8');
writeJson(path.join(context.generatedDir, 'review-manifest.json'), {
  bookId: context.bookId,
  scriptSha256: hash,
  generatedAt: new Date().toISOString(),
  segments: script.segments.length,
  narrationCharacters: totalCharacters,
});

const book = readJson(context.bookConfigPath);
book.status = 'review';
book.updatedAt = new Date().toISOString();
writeJson(context.bookConfigPath, book);

console.log(`自审归档：${reviewPath}`);
console.log(`脚本哈希：${hash}`);
if (existsSync(context.approvalPath)) {
  console.log('提示：已有批准记录；如脚本哈希已变化，必须重新批准。');
}
