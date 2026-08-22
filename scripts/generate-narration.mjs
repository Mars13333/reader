import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {synthesize} from './doubao-tts.mjs';
import {
  BOOK_PICKER_CONTENT_GAP_MS,
  BOOK_PICKER_INTRO_STANDARD,
  assertFixedNarration,
  assertScriptApproved,
  getBookContext,
  getBookPickerSpokenLead,
  getPronunciationOverrides,
  getPronunciationOverridesSha256,
  hashText,
  inspectBookPickerIntro,
  planBookPickerIntroTiming,
  readJson,
} from './book-context.mjs';

const context = getBookContext();
const {approval, scriptState} = assertScriptApproved(context);
const config = readJson(path.join(context.contentDir, 'narration-config.json'));
const videoLayout = readJson(path.join(context.contentDir, 'video-layout.json'));
const script = scriptState.script;
assertFixedNarration(config);
if (context.book.editorialStandards?.introStandard) {
  const pickerInspection = inspectBookPickerIntro({book: context.book, layout: videoLayout});
  if (pickerInspection.errors.length) {
    throw new Error(pickerInspection.errors.join('\n'));
  }
}
const pronunciationOverrides = getPronunciationOverrides(config);
const pronunciationOverridesSha256 =
  getPronunciationOverridesSha256(config);
const usesSpokenBookPicker =
  context.book.editorialStandards?.introStandard === BOOK_PICKER_INTRO_STANDARD &&
  videoLayout.bookPickerIntro?.enabled === true &&
  videoLayout.bookPickerIntro?.standard === BOOK_PICKER_INTRO_STANDARD;
const bookPickerIntroSpec = usesSpokenBookPicker
  ? {
      standard: BOOK_PICKER_INTRO_STANDARD,
      text: getBookPickerSpokenLead(context.book.title),
      requestedDurationSeconds: Number(videoLayout.bookPickerIntro.durationSeconds),
      contentGapMs: BOOK_PICKER_CONTENT_GAP_MS,
    }
  : null;
const bookPickerIntroSha256 = bookPickerIntroSpec
  ? hashText(JSON.stringify(bookPickerIntroSpec))
  : null;

const buildDirectory = path.join(context.generatedDir, '.narration-build');
const wavPath = path.join(context.publicDir, config.audioFile);
const timelinePath = path.join(context.generatedDir, 'narration-timeline.json');
const reportPath = path.join(context.generatedDir, 'narration.md');
const force = process.argv.includes('--force');

if (!force && existsSync(wavPath) && existsSync(timelinePath)) {
  const cachedTimeline = readJson(timelinePath);
  const cacheMatches =
    cachedTimeline.scriptSha256 === approval.scriptSha256 &&
    cachedTimeline.speaker === config.speaker &&
    cachedTimeline.speechRate === config.speechRate &&
    cachedTimeline.sampleRate === config.sampleRate &&
    cachedTimeline.pronunciationOverridesSha256 ===
      pronunciationOverridesSha256 &&
    (cachedTimeline.bookPickerIntroSha256 ?? null) === bookPickerIntroSha256;
  if (cacheMatches) {
    console.log(`已复用批准脚本对应的口播主音频：${wavPath}`);
    process.exit(0);
  }
  console.log('脚本或固定配音参数已变化，将重新生成口播。');
}

if (!Array.isArray(script.segments) || script.segments.length === 0) {
  throw new Error('content/script.json does not contain narration segments.');
}

const sampleRate = Number(config.sampleRate);
const bytesPerSample = 2;
const bytesPerSecond = sampleRate * bytesPerSample;
const millisecondsToBytes = (milliseconds) =>
  Math.round((milliseconds / 1000) * sampleRate) * bytesPerSample;
const durationSeconds = (buffer) => buffer.length / bytesPerSecond;
const makeSilence = (milliseconds) => Buffer.alloc(millisecondsToBytes(milliseconds));

const windowRms = (buffer, startByte, endByte) => {
  let sumSquares = 0;
  let count = 0;
  for (let offset = startByte; offset + 1 < endByte; offset += 2) {
    const sample = buffer.readInt16LE(offset);
    sumSquares += sample * sample;
    count += 1;
  }
  return count ? Math.sqrt(sumSquares / count) : 0;
};

const trimOuterSilence = (buffer) => {
  const windowBytes = Math.round(sampleRate * 0.01) * bytesPerSample;
  const threshold = Number(config.silenceThreshold ?? 180);
  const windows = [];
  for (let start = 0; start < buffer.length; start += windowBytes) {
    windows.push(
      windowRms(buffer, start, Math.min(start + windowBytes, buffer.length)),
    );
  }
  let firstVoiced = windows.findIndex((level) => level > threshold);
  let lastVoiced = -1;
  for (let index = windows.length - 1; index >= 0; index -= 1) {
    if (windows[index] > threshold) {
      lastVoiced = index;
      break;
    }
  }
  if (firstVoiced < 0 || lastVoiced < firstVoiced) return buffer;
  firstVoiced = Math.max(0, firstVoiced - 6);
  lastVoiced = Math.min(windows.length - 1, lastVoiced + 10);
  const startByte = firstVoiced * windowBytes;
  const endByte = Math.min(buffer.length, (lastVoiced + 1) * windowBytes);
  return buffer.subarray(startByte, endByte);
};

const createWav = (pcmBuffer) => {
  const header = Buffer.alloc(44);
  const channels = 1;
  const bitsPerSample = 16;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(bytesPerSecond, 28);
  header.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
};

const formatClock = (seconds) => {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
};

const applyPronunciationOverrides = (text) => {
  let ttsText = text;
  for (const override of pronunciationOverrides) {
    ttsText = ttsText.split(override.term).join(override.ttsText);
  }
  return ttsText;
};

for (const override of pronunciationOverrides) {
  const narrationTexts = [
    ...(bookPickerIntroSpec ? [bookPickerIntroSpec.text] : []),
    ...script.segments.map((segment) => segment.narration),
  ];
  const uses = narrationTexts.reduce(
    (count, narration) => count + narration.split(override.term).length - 1,
    0,
  );
  if (uses === 0) {
    throw new Error(
      `Pronunciation override is unused in the approved script: ${override.term}`,
    );
  }
  console.log(
    `发音覆盖：${override.term} → ${override.ttsText}（${override.pronunciation}），共 ${uses} 处；仅改变合成文本。`,
  );
}

rmSync(buildDirectory, {recursive: true, force: true});
mkdirSync(buildDirectory, {recursive: true});
mkdirSync(path.dirname(wavPath), {recursive: true});

const interSegmentPause = makeSilence(config.interSegmentPauseMs);
const tail = makeSilence(config.tailMs);
const audioParts = [];
const timelineSegments = [];
let introTimeline = null;
let cursorSeconds = 0;

try {
  if (bookPickerIntroSpec) {
    const rawPath = path.join(buildDirectory, '00-book-picker-intro.pcm');
    console.log(`TTS 开场：${bookPickerIntroSpec.text}`);
    const result = await synthesize({
      text: applyPronunciationOverrides(bookPickerIntroSpec.text),
      speaker: config.speaker,
      resourceId: config.resourceId,
      outputPath: rawPath,
      audioFormat: 'pcm',
      speechRate: config.speechRate,
      pitchRate: config.pitchRate,
      sampleRate,
    });
    const rawAudio = readFileSync(result.outputPath);
    if (rawAudio.length < sampleRate * bytesPerSample) {
      throw new Error('Suspiciously short audio for the book-picker spoken lead.');
    }
    const introAudio = trimOuterSilence(rawAudio);
    const introSpeechDuration = durationSeconds(introAudio);
    const requestedContentStart = bookPickerIntroSpec.requestedDurationSeconds;
    const minimumSpeechStart = Number(config.leadInMs) / 1000;
    const contentGapSeconds = bookPickerIntroSpec.contentGapMs / 1000;
    const plannedTiming = planBookPickerIntroTiming({
      requestedDurationSeconds: requestedContentStart,
      spokenDurationSeconds: introSpeechDuration,
      minimumLeadInSeconds: minimumSpeechStart,
      contentGapSeconds,
    });
    const plannedSpeechStart = plannedTiming.spokenStartSeconds;
    const introLeadIn = makeSilence(plannedSpeechStart * 1000);
    audioParts.push(introLeadIn);
    cursorSeconds += durationSeconds(introLeadIn);
    const spokenStartSeconds = cursorSeconds;
    audioParts.push(introAudio);
    cursorSeconds += introSpeechDuration;
    const spokenEndSeconds = cursorSeconds;
    const plannedContentStart = Math.max(
      plannedTiming.contentStartsSeconds,
      spokenEndSeconds + contentGapSeconds,
    );
    const introTail = makeSilence((plannedContentStart - spokenEndSeconds) * 1000);
    audioParts.push(introTail);
    cursorSeconds += durationSeconds(introTail);
    introTimeline = {
      standard: bookPickerIntroSpec.standard,
      text: bookPickerIntroSpec.text,
      spokenStartSeconds,
      spokenEndSeconds,
      contentStartsSeconds: cursorSeconds,
      requestedDurationSeconds: requestedContentStart,
    };
  } else {
    const leadIn = makeSilence(config.leadInMs);
    audioParts.push(leadIn);
    cursorSeconds += durationSeconds(leadIn);
  }

  for (let index = 0; index < script.segments.length; index += 1) {
    const segment = script.segments[index];
    const rawPath = path.join(
      buildDirectory,
      `${String(index + 1).padStart(2, '0')}-${segment.id}.pcm`,
    );
    console.log(`TTS ${index + 1}/${script.segments.length}: ${segment.section}`);
    const result = await synthesize({
      text: applyPronunciationOverrides(segment.narration),
      speaker: config.speaker,
      resourceId: config.resourceId,
      outputPath: rawPath,
      audioFormat: 'pcm',
      speechRate: config.speechRate,
      pitchRate: config.pitchRate,
      sampleRate,
    });
    const rawAudio = readFileSync(result.outputPath);
    if (rawAudio.length < sampleRate * bytesPerSample) {
      throw new Error(`Suspiciously short audio for ${segment.id}.`);
    }
    const audio = trimOuterSilence(rawAudio);
    const segmentDuration = durationSeconds(audio);
    const startSeconds = cursorSeconds;
    const endSeconds = startSeconds + segmentDuration;
    timelineSegments.push({
      id: segment.id,
      section: segment.section,
      startSeconds,
      endSeconds,
      durationSeconds: segmentDuration,
      pauseAfterSeconds:
        index === script.segments.length - 1
          ? config.tailMs / 1000
          : config.interSegmentPauseMs / 1000,
    });
    audioParts.push(audio);
    cursorSeconds = endSeconds;
    if (index < script.segments.length - 1) {
      audioParts.push(interSegmentPause);
      cursorSeconds += durationSeconds(interSegmentPause);
    }
  }
  audioParts.push(tail);
  cursorSeconds += durationSeconds(tail);

  const finalPcm = Buffer.concat(audioParts);
  writeFileSync(wavPath, createWav(finalPcm));

  const timeline = {
    bookId: context.bookId,
    scriptSha256: approval.scriptSha256,
    engine: config.engine,
    voiceName: config.voiceName,
    speaker: config.speaker,
    resourceId: config.resourceId,
    speechRate: config.speechRate,
    pitchRate: config.pitchRate,
    sampleRate,
    pronunciationOverrides,
    pronunciationOverridesSha256,
    bookPickerIntroSha256,
    ...(introTimeline ? {intro: introTimeline} : {}),
    audioFile: config.audioFile,
    totalDurationSeconds: finalPcm.length / bytesPerSecond,
    segments: timelineSegments,
  };
  writeFileSync(timelinePath, `${JSON.stringify(timeline, null, 2)}\n`, 'utf8');

  const report = [
    `# ${script.title}｜正式口播`,
    '',
    `- 引擎：${config.engine}`,
    `- 音色：${config.voiceName}（${config.speaker}）`,
    `- 语速：${config.speechRate}`,
    `- 实际总时长：${(timeline.totalDurationSeconds / 60).toFixed(2)} 分钟`,
    `- 段间停顿：${config.interSegmentPauseMs}ms`,
    `- 固定开场：${introTimeline ? `“${introTimeline.text}”（正文从 ${formatClock(introTimeline.contentStartsSeconds)} 开始）` : '沿用旧版，无独立开场口播'}`,
    `- 发音覆盖：${
      pronunciationOverrides.length
        ? pronunciationOverrides
            .map(
              (override) =>
                `${override.term} → ${override.ttsText}（${override.pronunciation}）`,
            )
            .join('；')
        : '无'
    }`,
    '- 时间轴：以合成 PCM 的真实采样数为主时钟；仅记录口播章节边界供画面排期使用。',
    '',
    '| 开始 | 时长 | 章节 |',
    '| ---: | ---: | --- |',
    ...timelineSegments.map(
      (segment) =>
        `| ${formatClock(segment.startSeconds)} | ${segment.durationSeconds.toFixed(2)}s | ${segment.section} |`,
    ),
  ].join('\n');
  writeFileSync(reportPath, `${report}\n`, 'utf8');

  rmSync(buildDirectory, {recursive: true, force: true});
  console.log(
    `Generated ${timelineSegments.length} narration segments for ${context.bookId}, ` +
      `${timeline.totalDurationSeconds.toFixed(3)} seconds total.`,
  );
  console.log(`WAV master: ${wavPath}`);
} catch (error) {
  console.error(`Narration generation failed: ${error.message}`);
  console.error(`Partial build files remain in ${buildDirectory}`);
  process.exitCode = 1;
}
