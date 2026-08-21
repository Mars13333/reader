import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {
  assertEditorialStandards,
  assertFixedNarration,
  assertScriptApproved,
  getBookContext,
  getPronunciationOverridesSha256,
  readJson,
} from './book-context.mjs';
import {FIXED_TOPIC_TAGS, readPublishMaterials} from './publish-materials.mjs';
import {inspectStoryboardStandard} from './storyboard-standard.mjs';

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
const visualPlan = readJson(path.join(context.contentDir, 'visual-plan.json'));
assertFixedNarration(narrationConfig);
const errors = [];
errors.push(
  ...inspectStoryboardStandard({
    book: context.book,
    visualPlan,
    publicDir: context.publicDir,
  }).errors,
);
const warnings = [];
const usesBookJacketV2 = context.book.editorialStandards?.visualStandard === 'book-jacket-v2';
const coverDeliveries = context.book.deliverables?.covers ?? [
  'output/cover-9x16.png',
  'output/cover-3x4.png',
  'output/cover-4x3.png',
];
const coverDeliveryRules = new Map([
  ['output/cover-9x16.png', {layout: 'vertical9x16', composition: 'BookCover', fileName: 'cover-9x16.png'}],
  ['output/cover-3x4.png', {layout: 'portrait3x4', composition: 'BookCover3x4', fileName: 'cover-3x4.png'}],
  ['output/cover-4x3.png', {layout: 'landscape4x3', composition: 'BookCover4x3', fileName: 'cover-4x3.png'}],
]);
if (context.book.deliverables?.publishCopy) {
  const {errors: publishErrors} = readPublishMaterials(context);
  errors.push(...publishErrors);
}

if (prepared.bookId !== context.bookId) errors.push('Prepared data belongs to another book.');
if (prepared.scriptSha256 !== approval.scriptSha256) errors.push('Prepared data does not match the approved script.');
if (timeline.bookId !== context.bookId) errors.push('Narration timeline belongs to another book.');
if (timeline.scriptSha256 !== approval.scriptSha256) errors.push('Narration timeline does not match the approved script.');
if (timeline.pronunciationOverridesSha256 !== getPronunciationOverridesSha256(narrationConfig)) errors.push('Narration timeline does not match the current pronunciation overrides.');
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
const headerFontRange = usesBookJacketV2 ? [42, 48] : [32, 40];
if (videoLayout.header?.fontSize < headerFontRange[0] || videoLayout.header?.fontSize > headerFontRange[1]) errors.push(`Video header font size ${videoLayout.header?.fontSize}px is outside ${headerFontRange[0]}-${headerFontRange[1]}px.`);
if (videoLayout.keywordCard?.top < 460 || videoLayout.keywordCard?.top > 560) errors.push(`Keyword card top ${videoLayout.keywordCard?.top}px is outside the search-page safe area.`);
if (!videoSource.includes('top: keywordCardLayout.top')) errors.push('Keyword cards must use the shared lowered safe-area position.');
if (usesBookJacketV2) {
  if (videoLayout.visualTreatment?.backgroundColor !== '#000000') errors.push('Future books must use a black first-frame canvas background.');
  if (videoLayout.keywordCard?.minimumVisibleSeconds < 6 || videoLayout.keywordCard?.minimumVisibleSeconds > 9) errors.push('Keyword cards must remain readable for at least 6 seconds.');
  if (videoLayout.keywordCard?.secondsPerCharacter < 0.3 || videoLayout.keywordCard?.secondsPerCharacter > 0.5) errors.push('Keyword-card reading time must use 0.30-0.50 seconds per character.');
  if (videoLayout.header?.fontSize >= 70) errors.push('The persistent book title must remain smaller than the chapter keyword text.');
}

const coverArtPath = path.join(context.publicDir, cover.image ?? '');
if (!existsSync(coverArtPath) || statSync(coverArtPath).size < 1_000_000) errors.push('Cover artwork is missing or suspiciously small.');
if (usesBookJacketV2) {
  const expectedCovers = ['output/cover-3x4.png', 'output/cover-4x3.png'];
  if (JSON.stringify(coverDeliveries) !== JSON.stringify(expectedCovers)) errors.push('Future books must deliver only 3:4 and 4:3 covers.');
  if (cover.design !== 'book-jacket-v2') errors.push('Future covers must use the book-jacket-v2 design.');
  if (cover.bookTitle !== context.book.title) errors.push('Cover bookTitle must exactly match book.json title.');
  if (!cover.subtitle?.trim() || cover.subtitle.includes('待填写') || Array.from(cover.subtitle.trim()).length < 6 || Array.from(cover.subtitle.trim()).length > 32) errors.push('Book-jacket subtitle must be a finished 6-32 character recommendation line.');
} else if (!Array.isArray(cover.headline) || cover.headline.length !== 3) {
  errors.push('Legacy cover headline must contain exactly three lines.');
}
const legacyCoverLayoutRules = {
  vertical9x16: {name: 'vertical9x16', left: [56, 96], eyebrowTop: [140, 220], headlineTop: [230, 420], badgeTop: [650, 1200]},
  portrait3x4: {name: 'portrait3x4', left: [48, 96], eyebrowTop: [50, 120], headlineTop: [130, 260], badgeTop: [520, 850]},
  landscape4x3: {name: 'landscape4x3', left: [64, 120], eyebrowTop: [48, 120], headlineTop: [130, 280], badgeTop: [600, 900]},
};
const bookJacketLayoutRules = {
  portrait3x4: {name: 'portrait3x4', left: [56, 110], eyebrowTop: [50, 120], headlineTop: [160, 320], badgeTop: [1100, 1320]},
  landscape4x3: {name: 'landscape4x3', left: [64, 140], eyebrowTop: [48, 120], headlineTop: [140, 300], badgeTop: [800, 960]},
};
const activeLayoutRules = usesBookJacketV2 ? bookJacketLayoutRules : legacyCoverLayoutRules;
const coverLayoutRules = coverDeliveries.flatMap((deliveryPath) => {
  const normalized = deliveryPath.replaceAll('\\', '/');
  const delivery = coverDeliveryRules.get(normalized);
  if (!delivery) {
    errors.push(`Unsupported cover delivery: ${deliveryPath}.`);
    return [];
  }
  const rule = activeLayoutRules[delivery.layout];
  if (!rule) {
    errors.push(`Cover delivery ${deliveryPath} is not allowed by the active visual standard.`);
    return [];
  }
  return [rule];
});
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
const requiredCompositions = [
  'BookVideo',
  ...coverDeliveries.flatMap((deliveryPath) => {
    const delivery = coverDeliveryRules.get(deliveryPath.replaceAll('\\', '/'));
    return delivery ? [delivery.composition] : [];
  }),
];
for (const composition of requiredCompositions) {
  if (!rootSource.includes(`id="${composition}"`)) errors.push(`${composition} composition is missing.`);
}
if (!rootSource.includes('../.runtime/')) errors.push('Remotion must load the selected book through .runtime.');
const runtimePreparedPath = path.join(context.runtimeDir, 'prepared.json');
if (!existsSync(runtimePreparedPath) || readJson(runtimePreparedPath).bookId !== context.bookId) errors.push('Runtime data does not point to the active book.');

if (requireOutputs) {
  const expectedMediaOutputs = [
    ['final.mp4', 10_000_000],
    ...coverDeliveries.flatMap((deliveryPath) => {
      const delivery = coverDeliveryRules.get(deliveryPath.replaceAll('\\', '/'));
      return delivery ? [[delivery.fileName, 500_000]] : [];
    }),
  ];
  for (const [fileName, minimumSize] of expectedMediaOutputs) {
    const filePath = path.join(context.outputDir, fileName);
    if (!existsSync(filePath) || statSync(filePath).size < minimumSize) errors.push(`Missing or suspicious delivery file: ${filePath}.`);
  }
  const publishCopy = context.book.deliverables?.publishCopy;
  if (publishCopy) {
    const publishPath = path.resolve(context.bookRoot, publishCopy);
    const relative = path.relative(context.outputDir, publishPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      errors.push(`Publish copy must stay inside output: ${publishPath}.`);
    } else if (!existsSync(publishPath) || statSync(publishPath).size < 30) {
      errors.push(`Missing or suspicious delivery file: ${publishPath}.`);
    } else if (!readFileSync(publishPath, 'utf8').includes(FIXED_TOPIC_TAGS)) {
      errors.push(`Publish copy is missing fixed topic tags: ${FIXED_TOPIC_TAGS}.`);
    }
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
