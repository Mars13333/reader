import {existsSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  assertScriptApproved,
  getBookContext,
} from './book-context.mjs';

const context = getBookContext();
assertScriptApproved(context);
const command = process.argv[2] ?? 'all';
const remotionCli = path.join(
  context.root,
  'node_modules',
  '@remotion',
  'cli',
  'remotion-cli.js',
);
const entry = path.join(context.root, 'src', 'index.ts');
mkdirSync(context.outputDir, {recursive: true});

const run = (args) => {
  const result = spawnSync(process.execPath, [remotionCli, ...args, '--public-dir', context.publicDir], {
    cwd: context.root,
    stdio: 'inherit',
    env: {...process.env, AI_MEDIA_BOOK_ID: context.bookId},
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const renderVideo = () =>
  run([
    'render', entry, 'BookVideo', path.join(context.outputDir, 'final.mp4'),
    '--codec=h264', '--crf=23', '--pixel-format=yuv420p', '--audio-codec=aac',
  ]);

const coverTargets = new Map([
  ['output/cover-9x16.png', {composition: 'BookCover', fileName: 'cover-9x16.png'}],
  ['output/cover-3x4.png', {composition: 'BookCover3x4', fileName: 'cover-3x4.png'}],
  ['output/cover-4x3.png', {composition: 'BookCover4x3', fileName: 'cover-4x3.png'}],
]);

const renderCovers = () => {
  const declaredCovers = context.book.deliverables?.covers ?? [...coverTargets.keys()];
  for (const deliveryPath of declaredCovers) {
    const target = coverTargets.get(deliveryPath.replaceAll('\\', '/'));
    if (!target) throw new Error(`不支持的封面交付路径：${deliveryPath}`);
    run([
      'still',
      entry,
      target.composition,
      path.join(context.outputDir, target.fileName),
      '--image-format=png',
    ]);
  }
};

if (!existsSync(path.join(context.runtimeDir, 'prepared.json'))) {
  throw new Error('缺少运行时数据。请先运行 npm run book:prepare。');
}

if (command === 'video') renderVideo();
else if (command === 'covers') renderCovers();
else if (command === 'all') {
  renderVideo();
  renderCovers();
} else if (command === 'preview') {
  run([
    'render', entry, 'BookVideo', path.join(context.outputDir, 'preview.mp4'),
    '--frames=0-899', '--codec=h264', '--crf=22', '--pixel-format=yuv420p', '--audio-codec=aac',
  ]);
} else if (command === 'studio') {
  run(['studio', entry]);
} else if (command === 'compositions') {
  run(['compositions', entry]);
} else {
  throw new Error(`未知渲染命令：${command}`);
}
