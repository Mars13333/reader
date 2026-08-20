// API contract adapted from ByteDance agentkit-samples/byted-text-to-speech
// (Apache-2.0): https://github.com/bytedance/agentkit-samples
import {existsSync, readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const loadLocalEnv = () => {
  const values = {};
  for (const name of ['.env.local', '.env']) {
    const envPath = path.join(root, name);
    if (!existsSync(envPath)) continue;
    for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    }
  }
  return values;
};

const localEnv = loadLocalEnv();
const getSetting = (name, fallback = '') =>
  process.env[name] ?? localEnv[name] ?? fallback;

const synthesize = async ({
  text,
  speaker,
  resourceId,
  outputPath,
  audioFormat = 'pcm',
  speechRate = 0,
  pitchRate = 0,
  sampleRate = 24000,
}) => {
  const apiKey = getSetting('MODEL_SPEECH_API_KEY').trim();
  if (!apiKey) {
    throw new Error(
      '缺少 MODEL_SPEECH_API_KEY。请复制 .env.example 为 .env.local，并填入火山引擎 Speech API Key。',
    );
  }
  const host = getSetting(
    'MODEL_SPEECH_API_BASE',
    'openspeech.bytedance.com',
  );
  const endpoint = `https://${host}/api/v3/tts/unidirectional/sse`;
  const audioParams = {
    format: audioFormat,
    speech_rate: speechRate,
    loudness_rate: 0,
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      'X-Api-Resource-Id': resourceId,
      'X-Api-Request-Id': randomUUID(),
    },
    body: JSON.stringify({
      user: {uid: 'ai-book-video'},
      req_params: {
        text,
        speaker,
        sample_rate: sampleRate,
        audio_params: audioParams,
        additions: JSON.stringify({
          post_process: {pitch: pitchRate},
          disable_markdown_filter: false,
          enable_latex_tn: false,
        }),
      },
    }),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${responseText.slice(0, 500)}`);
  }
  const chunks = [];
  const metadata = [];
  for (const line of responseText.split(/\r?\n/u)) {
    if (!line.startsWith('data:')) continue;
    let event;
    try {
      event = JSON.parse(line.slice(5).trim());
    } catch {
      continue;
    }
    const code = event.code ?? 0;
    if (code !== 0 && code !== 20000000) {
      throw new Error(`API ${code}: ${event.message ?? 'unknown error'}`);
    }
    if (event.data) chunks.push(Buffer.from(event.data, 'base64'));
    const {data: _audioData, ...eventMetadata} = event;
    metadata.push(eventMetadata);
  }
  if (!chunks.length) throw new Error('API没有返回音频数据。');
  mkdirSync(path.dirname(outputPath), {recursive: true});
  writeFileSync(outputPath, Buffer.concat(chunks));
  return {outputPath, metadata};
};

export {synthesize};
