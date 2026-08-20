import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {
  assertEditorialStandards,
  assertFixedNarration,
  assertScriptApproved,
  getBookContext,
  readJson,
} from './book-context.mjs';

const context = getBookContext();
const {approval} = assertScriptApproved(context);
const approvedScript = readJson(path.join(context.contentDir, 'script.json'));
assertEditorialStandards(context, approvedScript);
const requireOutputs = process.argv.includes('--outputs');
const preparedPath = path.join(context.generatedDir, 'prepared.json');
const timelinePath = path.join(context.generatedDir, 'narration-timeline.json');
if (!existsSync(preparedPath)) throw new Error('请先运行 npm run book:prepare。');
if (!existsSync(timelinePath)) throw new Error('请先运行 npm run book:voice。');

const prepared = readJson(preparedPath);
const timeline = readJson(timelinePath);
const cover = readJson(path.join(context.contentDir, 'cover.json'));
const videoLayout = readJson(path.join(context.contentDir, 'video-layout.json'));
const narrationConfig = readJson(path.join(context.contentDir, 'narration-config.json'));
assertFixedNarration(narrationConfig);
const errors = [];
const warnings = [];

if (prepared.bookId !== context.bookId) errors.push('Prepared data belongs to another book.');
if (prepared.scriptSha256 !== approval.scriptSha256) errors.push('Prepared data does not match the approved script.');
if (timeline.bookId !== context.bookId) errors.push('Narration timeline belongs to another book.');
if (timeline.scriptSha256 !== approval.scriptSha256) errors.push('Narration timeline does not match the approved script.');
if (prepared.width !== 1080 || prepared.height !== 1920) errors.push(`Expected 1080x1920, got ${prepared.width}x${prepared.height}.`);
if (prepared.fps !== 30) errors.push(`Expected 30 FPS, got ${prepared.fps}.`);
if (prepared.totalDurationSeconds < 570 || prepared.totalDurationSeconds > 630) errors.push(`Runtime ${(prepared.totalDurationSeconds / 60).toFixed(2)} minutes is outside 9:30-10:30.`);
if (prepared.deliveryMode !== 'audio-master') errors.push(`Unexpected delivery mode: ${prepared.deliveryMode}.`);
if (prepared.voice?.speaker !== 'zh_male_liufei_uranus_bigtts' || prepared.voice?.speechRate !== -10) errors.push('Prepared video must use Liu Fei voice at fixed speech rate -10.');
if (timeline.speaker !== 'zh_male_liufei_uranus_bigtts' || timeline.speechRate !== -10) errors.push('Narration timeline must use Liu Fei voice at fixed speech rate -10.');
if (prepared.segments.length < 10) warnings.push('Fewer than 10 editorial segments.');
if (!Array.isArray(prepared.shots) || prepared.shots.length < 45) errors.push(`Expected at least 45 visual shots, got ${prepared.shots?.length ?? 0}.`);

for (const segment of prepared.segments) {
  if (!segment.sourceRefs?.length) errors.push(`Missing source reference for ${segment.id}.`);
  if (!segment.narration?.trim()) errors.push(`Missing narration for ${segment.id}.`);
  if (segment.narrationEndFrame <= segment.narrationStartFrame) errors.push(`Invalid narration timing for ${segment.id}.`);
}

let expectedShotStart = 0;
const visualKeys = new Set();
for (const shot of prepared.shots ?? []) {
  const imagePath = path.join(context.publicDir, shot.image);
  const seconds = shot.durationInFrames / prepared.fps;
  if (!existsSync(imagePath) || statSync(imagePath).size < 100_000) errors.push(`Missing or suspicious storyboard for ${shot.id}.`);
  if (seconds < 7.5 || seconds > 15) errors.push(`Shot ${shot.id} lasts ${seconds.toFixed(2)}s; expected about 8-15s.`);
  if (shot.startFrame !== expectedShotStart) errors.push(`Shot timeline gap or overlap before ${shot.id}.`);
  expectedShotStart = shot.startFrame + shot.durationInFrames;
  if (!Number.isInteger(shot.panel) || shot.panel < 0 || shot.panel > 3) errors.push(`Invalid storyboard panel for ${shot.id}.`);
  const visualKey = `${shot.image}#${shot.panel}`;
  if (visualKeys.has(visualKey)) errors.push(`Repeated visual panel: ${visualKey}.`);
  visualKeys.add(visualKey);
}
if (expectedShotStart !== prepared.totalFrames) errors.push('Visual shot timeline does not cover the full video.');

const audioPath = path.join(context.publicDir, prepared.audioFile ?? '');
if (!existsSync(audioPath) || statSync(audioPath).size < 5_000_000) {
  errors.push('WAV narration master is missing or suspiciously small.');
} else {
  const header = readFileSync(audioPath).subarray(0, 44);
  if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
    errors.push('Narration master is not a valid WAV file.');
  } else {
    const sampleRate = header.readUInt32LE(24);
    const byteRate = header.readUInt32LE(28);
    const dataBytes = header.readUInt32LE(40);
    const wavDuration = dataBytes / byteRate;
    if (sampleRate !== 24000) errors.push(`Expected 24kHz WAV, got ${sampleRate}Hz.`);
    if (Math.abs(wavDuration - timeline.totalDurationSeconds) > 0.02) errors.push('WAV duration does not match narration timeline.');
  }
}

if (timeline.segments.length !== prepared.segments.length) errors.push('Narration and prepared segment counts differ.');
if ('cues' in timeline || 'outputMp3' in timeline) errors.push('Narration timeline still contains removed subtitle or MP3 delivery data.');
for (const obsoletePath of [
  path.join(context.contentDir, 'subtitles.srt'),
  path.join(context.generatedDir, 'subtitles.srt'),
  path.join(context.root, 'scripts', 'subtitle-format.mjs'),
]) {
  if (existsSync(obsoletePath)) errors.push(`Obsolete subtitle artifact remains: ${obsoletePath}.`);
}
if (existsSync(context.outputDir)) {
  for (const fileName of readdirSync(context.outputDir)) {
    if (/\.(srt|mp3)$/iu.test(fileName)) errors.push(`Output must not contain ${fileName}.`);
  }
}

const videoSource = readFileSync(path.join(context.root, 'src', 'BookVideo.tsx'), 'utf8');
if (videoSource.includes('本视频含 AI 生成画面')) errors.push('The video template must not add an AI content label.');
if (!videoSource.includes('<Audio')) errors.push('Narration audio is not embedded in the video.');
if (videoSource.includes('<Subtitle')) errors.push('Narration subtitles must not be burned into the video.');
if (videoLayout.showProgressBar !== false) errors.push('The video template must keep the custom progress bar disabled.');
if (videoSource.includes('progress * 100') || videoSource.includes('progress*100')) errors.push('The video template must not render a custom playback progress bar.');
if (!videoSource.includes('videoLayout.header')) errors.push('The persistent video header must use the shared safe-area layout.');
if (videoLayout.header?.top < 270 || videoLayout.header?.top > 330) errors.push(`Video header top ${videoLayout.header?.top}px is outside the search-page safe area.`);
if (videoLayout.header?.sideMargin < 96 || videoLayout.header?.sideMargin > 160) errors.push(`Video header side margin ${videoLayout.header?.sideMargin}px is outside the centered safe area.`);
if (!videoSource.includes('left: videoLayout.header.sideMargin') || !videoSource.includes('right: videoLayout.header.sideMargin') || !videoSource.includes("textAlign: 'center'")) errors.push('The persistent video header must remain horizontally centered.');
if (videoLayout.header?.fontSize < 32 || videoLayout.header?.fontSize > 40) errors.push(`Video header font size ${videoLayout.header?.fontSize}px is not thumbnail-readable.`);
if (videoLayout.keywordCard?.top < 460 || videoLayout.keywordCard?.top > 560) errors.push(`Keyword card top ${videoLayout.keywordCard?.top}px is outside the search-page safe area.`);
if (!videoSource.includes('top: videoLayout.keywordCard.top')) errors.push('Keyword cards must use the shared lowered safe-area position.');

const coverArtPath = path.join(context.publicDir, cover.image ?? '');
if (!existsSync(coverArtPath) || statSync(coverArtPath).size < 1_000_000) errors.push('Cover artwork is missing or suspiciously small.');
if (!Array.isArray(cover.headline) || cover.headline.length !== 3) errors.push('Cover headline must contain exactly three lines.');
const coverLayoutRules = [
  {name: 'vertical9x16', left: [56, 96], eyebrowTop: [140, 220], headlineTop: [230, 420], badgeTop: [650, 1200]},
  {name: 'portrait3x4', left: [48, 96], eyebrowTop: [50, 120], headlineTop: [130, 260], badgeTop: [520, 850]},
  {name: 'landscape4x3', left: [64, 120], eyebrowTop: [48, 120], headlineTop: [130, 280], badgeTop: [600, 900]},
];
for (const rule of coverLayoutRules) {
  const layout = cover.layouts?.[rule.name];
  if (!layout) {
    errors.push(`Missing ${rule.name} cover layout.`);
    continue;
  }
  for (const field of ['left', 'eyebrowTop', 'headlineTop', 'badgeTop']) {
    const [minimum, maximum] = rule[field];
    if (layout[field] < minimum || layout[field] > maximum) errors.push(`${rule.name} cover ${field} ${layout[field]}px is outside ${minimum}-${maximum}px.`);
  }
}

const rootSource = readFileSync(path.join(context.root, 'src', 'Root.tsx'), 'utf8');
for (const composition of ['BookVideo', 'BookCover', 'BookCover3x4', 'BookCover4x3']) {
  if (!rootSource.includes(`id="${composition}"`)) errors.push(`${composition} composition is missing.`);
}
if (!rootSource.includes('../.runtime/')) errors.push('Remotion must load the selected book through .runtime.');
const runtimePreparedPath = path.join(context.runtimeDir, 'prepared.json');
if (!existsSync(runtimePreparedPath) || readJson(runtimePreparedPath).bookId !== context.bookId) errors.push('Runtime data does not point to the active book.');

if (requireOutputs) {
  for (const [fileName, minimumSize] of [
    ['final.mp4', 10_000_000],
    ['cover-9x16.png', 500_000],
    ['cover-3x4.png', 500_000],
    ['cover-4x3.png', 500_000],
  ]) {
    const filePath = path.join(context.outputDir, fileName);
    if (!existsSync(filePath) || statSync(filePath).size < minimumSize) errors.push(`Missing or suspicious delivery file: ${filePath}.`);
  }
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
const shotSeconds = prepared.shots.map((shot) => shot.durationInFrames / prepared.fps);
console.log(
  `PASS ${context.bookId}: ${prepared.segments.length} segments, ${prepared.shots.length} unique shots, ` +
    `${Math.min(...shotSeconds).toFixed(2)}-${Math.max(...shotSeconds).toFixed(2)}s per shot, ` +
    `${(prepared.totalDurationSeconds / 60).toFixed(2)} minutes, Liu Fei voice at -10, ` +
    `no generated subtitles or standalone MP3${requireOutputs ? ', delivery files verified' : ''}.`,
);
