import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {
  assertFixedNarration,
  assertScriptApproved,
  getBookContext,
  getPronunciationOverridesSha256,
  readJson,
} from './book-context.mjs';

const context = getBookContext();
const {approval} = assertScriptApproved(context);
const scriptPath = path.join(context.contentDir, 'script.json');
const visualPlanPath = path.join(context.contentDir, 'visual-plan.json');
const timelinePath = path.join(context.generatedDir, 'narration-timeline.json');
const preparedPath = path.join(context.generatedDir, 'prepared.json');
const markdownPath = path.join(context.generatedDir, 'script.md');
const storyboardPath = path.join(context.generatedDir, 'storyboard.md');

const script = JSON.parse(readFileSync(scriptPath, 'utf8'));
const visualPlan = JSON.parse(readFileSync(visualPlanPath, 'utf8'));
const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
const narrationConfig = readJson(path.join(context.contentDir, 'narration-config.json'));
assertFixedNarration(narrationConfig);
const visualsBySegment = new Map(
  visualPlan.segments.map((segment) => [segment.id, segment]),
);
const audioBySegment = new Map(
  timeline.segments.map((segment) => [segment.id, segment]),
);

if (timeline.speaker !== 'zh_male_liufei_uranus_bigtts') {
  throw new Error('Narration timeline does not use the approved Liu Fei voice.');
}
if (timeline.speechRate !== -10) {
  throw new Error('Narration timeline must use the fixed speech rate -10.');
}
if (timeline.scriptSha256 !== approval.scriptSha256) {
  throw new Error('Narration timeline does not match the approved script.');
}
if (
  timeline.pronunciationOverridesSha256 !==
  getPronunciationOverridesSha256(narrationConfig)
) {
  throw new Error(
    'Narration timeline does not match the current pronunciation overrides. Run npm run book:voice first.',
  );
}
if (timeline.segments.length !== script.segments.length) {
  throw new Error('Narration timeline and editorial script have different segment counts.');
}

const fps = script.fps;
const totalFrames = Math.ceil(timeline.totalDurationSeconds * fps);
const preparedSegments = [];
const preparedShots = [];

const formatClock = (frame) => {
  const seconds = frame / fps;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(1).padStart(4, '0')}`;
};

for (let segmentIndex = 0; segmentIndex < script.segments.length; segmentIndex += 1) {
  const segment = script.segments[segmentIndex];
  const visual = visualsBySegment.get(segment.id);
  const audio = audioBySegment.get(segment.id);
  if (!visual) throw new Error(`Missing visual plan for ${segment.id}.`);
  if (!audio) throw new Error(`Missing narration timing for ${segment.id}.`);
  if (!Array.isArray(visual.shots) || visual.shots.length < 3) {
    throw new Error(`${segment.id} needs at least three planned shots.`);
  }
  const timelineSegment = timeline.segments[segmentIndex];
  if (timelineSegment.id !== segment.id) {
    throw new Error(`Narration order mismatch at ${segment.id}.`);
  }
  const visualStartFrame =
    segmentIndex === 0 ? 0 : Math.round(audio.startSeconds * fps);
  const visualEndFrame =
    segmentIndex === script.segments.length - 1
      ? totalFrames
      : Math.round(timeline.segments[segmentIndex + 1].startSeconds * fps);
  const durationInFrames = visualEndFrame - visualStartFrame;
  const narrationStartFrame = Math.round(audio.startSeconds * fps);
  const narrationEndFrame = Math.round(audio.endSeconds * fps);

  preparedSegments.push({
    ...segment,
    narrationDurationSeconds: audio.durationSeconds,
    narrationStartFrame,
    narrationEndFrame,
    startFrame: visualStartFrame,
    durationInFrames,
  });

  let allocatedFrames = 0;
  for (let shotIndex = 0; shotIndex < visual.shots.length; shotIndex += 1) {
    const plannedShot = visual.shots[shotIndex];
    const isLastShot = shotIndex === visual.shots.length - 1;
    const shotFrames = isLastShot
      ? durationInFrames - allocatedFrames
      : Math.floor(durationInFrames / visual.shots.length);
    preparedShots.push({
      id: `${segment.id}-${String(shotIndex + 1).padStart(2, '0')}`,
      segmentId: segment.id,
      section: segment.section,
      kicker: segment.kicker,
      image: visual.image,
      panel: plannedShot.panel,
      label: plannedShot.label,
      isSegmentStart: shotIndex === 0,
      startFrame: visualStartFrame + allocatedFrames,
      durationInFrames: shotFrames,
    });
    allocatedFrames += shotFrames;
  }
}

const prepared = {
  bookId: context.bookId,
  scriptSha256: approval.scriptSha256,
  title: script.title,
  author: script.author,
  angle: script.angle,
  deliveryMode: 'audio-master',
  fps,
  width: script.width,
  height: script.height,
  totalFrames,
  totalDurationSeconds: totalFrames / fps,
  audioFile: timeline.audioFile,
  voice: {
    engine: timeline.engine,
    name: timeline.voiceName,
    speaker: timeline.speaker,
    speechRate: timeline.speechRate,
  },
  segments: preparedSegments,
  shots: preparedShots,
};

writeFileSync(preparedPath, `${JSON.stringify(prepared, null, 2)}\n`, 'utf8');

const markdown = [
  `# ${script.title}`,
  '',
  `- 原著：${script.author}`,
  `- 解读角度：${script.angle}`,
  `- 交付方式：刘飞男声有声成片；字幕在剪映中识别最终音频生成`,
  `- 实际时长：${(prepared.totalDurationSeconds / 60).toFixed(2)} 分钟`,
  `- 画面镜头：${preparedShots.length} 个`,
  `- 配音：${timeline.voiceName}，语速 ${timeline.speechRate}`,
  '- 字幕：不在 Codex 工程生成，也不烧录进视频；发布前由剪映识别最终音频',
  '',
  ...preparedSegments.flatMap((segment) => [
    `## ${segment.section}：${segment.kicker}`,
    '',
    segment.narration,
    '',
    `证据位置：${segment.sourceRefs.map((reference) => `${reference.label}（原文行 ${reference.lines}）`).join('；')}`,
    '',
  ]),
].join('\n');
writeFileSync(markdownPath, `${markdown}\n`, 'utf8');

const storyboard = [
  `# ${script.title}｜镜头表`,
  '',
  `共 ${preparedShots.length} 个镜头；画面最长停留 ${(Math.max(...preparedShots.map((shot) => shot.durationInFrames)) / fps).toFixed(2)} 秒。`,
  '',
  '| 时间 | 时长 | 章节 | 画面 |',
  '| --- | ---: | --- | --- |',
  ...preparedShots.map(
    (shot) =>
      `| ${formatClock(shot.startFrame)} | ${(shot.durationInFrames / fps).toFixed(2)}s | ${shot.section} | ${shot.label} |`,
  ),
].join('\n');
writeFileSync(storyboardPath, `${storyboard}\n`, 'utf8');

mkdirSync(context.runtimeDir, {recursive: true});
writeFileSync(
  path.join(context.runtimeDir, 'prepared.json'),
  `${JSON.stringify(prepared, null, 2)}\n`,
  'utf8',
);
for (const fileName of ['cover.json', 'video-layout.json']) {
  const value = readJson(path.join(context.contentDir, fileName));
  writeFileSync(
    path.join(context.runtimeDir, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  );
}
writeFileSync(
  path.join(context.runtimeDir, 'book.json'),
  `${JSON.stringify(context.book, null, 2)}\n`,
  'utf8',
);

console.log(`Prepared ${context.bookId}: ${preparedSegments.length} segments and ${preparedShots.length} visual shots.`);
console.log(`Audio-master runtime: ${(prepared.totalDurationSeconds / 60).toFixed(2)} minutes.`);
console.log(`Render props: ${preparedPath}`);
console.log(`Storyboard: ${storyboardPath}`);
