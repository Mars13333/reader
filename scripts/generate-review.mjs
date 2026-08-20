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
const markdown = [
  `# ${script.title}`,
  '',
  '> 当前文件仅用于脚本审批。尚未生成分镜、插画、配音或视频。',
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
  '## 审批重点',
  '',
  '- 开头是否足够抓人。',
  '- 是否存在过多剧情复述。',
  '- 解读角度是否符合这本书，而不是套用固定职场模板。',
  '- 事实、小说情节与个人评论是否区分清楚。',
  '- 结尾是否自然，互动问题是否愿意保留。',
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
  '## 审批操作',
  '',
  '- 需要修改：直接告诉 Codex 修改意见，然后重新运行 `npm run book:review`。',
  '- 内容通过：运行 `npm run book:approve`，之后才允许进入分镜、插画、配音和渲染。',
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

console.log(`审稿文件：${reviewPath}`);
console.log(`脚本哈希：${hash}`);
if (existsSync(context.approvalPath)) {
  console.log('提示：已有批准记录；如脚本哈希已变化，必须重新批准。');
}
