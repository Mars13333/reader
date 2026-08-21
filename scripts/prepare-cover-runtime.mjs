import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {
  FIXED_VOICE,
  assertScriptApproved,
  getBookContext,
  readJson,
} from './book-context.mjs';

const context = getBookContext();
const {approval, scriptState} = assertScriptApproved(context);
const script = scriptState.script;
const runtimePrepared = {
  bookId: context.bookId,
  scriptSha256: approval.scriptSha256,
  title: script.title,
  author: script.author,
  angle: script.angle,
  deliveryMode: 'audio-master',
  fps: script.fps,
  width: script.width,
  height: script.height,
  totalFrames: 1,
  totalDurationSeconds: 1 / script.fps,
  audioFile: '',
  voice: {
    engine: FIXED_VOICE.engine,
    name: FIXED_VOICE.voiceName,
    speaker: FIXED_VOICE.speaker,
    speechRate: FIXED_VOICE.speechRate,
  },
  segments: [],
  shots: [],
};

mkdirSync(context.runtimeDir, {recursive: true});
writeFileSync(
  path.join(context.runtimeDir, 'prepared.json'),
  `${JSON.stringify(runtimePrepared, null, 2)}\n`,
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

console.log(`封面运行时已准备：${context.bookId}`);
