import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAutoPrompt,
  buildCodexArgs,
  parseAutoArgs,
} from './book-auto.mjs';
import {
  BookAutoProgress,
  classifyNetworkEvent,
  formatProgressLine,
  inferProgressUpdate,
} from './book-auto-progress.mjs';

test('parses a new-book auto command', () => {
  const options = parseAutoArgs([
    '--title',
    '活着',
    '--author',
    '余华',
    '--audience=泛读书用户',
    '--model',
    'gpt-test',
    '--verbose',
  ]);
  assert.equal(options.title, '活着');
  assert.equal(options.author, '余华');
  assert.equal(options.audience, '泛读书用户');
  assert.equal(options.model, 'gpt-test');
  assert.equal(options.sandbox, 'workspace-write');
  assert.equal(options.verbose, true);
});

test('rejects partial or conflicting book selectors', () => {
  assert.throws(() => parseAutoArgs(['--title', '活着']), /必须同时提供/u);
  assert.throws(
    () => parseAutoArgs(['--book', 'book-003-test', '--title', '活着', '--author', '余华']),
    /不能与/u,
  );
  assert.throws(
    () => parseAutoArgs(['--resume', '--title', '活着', '--author', '余华']),
    /--resume/u,
  );
});

test('auto prompt grants only the scoped end-to-end authorization', () => {
  const prompt = buildAutoPrompt({bookId: 'book-003-test'});
  assert.match(prompt, /\$ai-media-book-video/u);
  assert.match(prompt, /explicit authorization/u);
  assert.match(prompt, /not authorization to publish externally/u);
  assert.match(prompt, /Do not call `npm run book:auto` recursively/u);
  assert.match(prompt, /every delivery file declared by the current book/u);
  assert.match(prompt, /portrait-2x2-9x16-v1/u);
  assert.match(prompt, /book:storyboards-check/u);
  assert.match(prompt, /BOOK_AUTO_RESULT: completed/u);
});

test('builds a resumable non-interactive Codex command', () => {
  const args = buildCodexArgs({
    bookId: 'book-003-test',
    model: 'gpt-test',
    sandbox: 'workspace-write',
    sessionId: '00000000-0000-0000-0000-000000000001',
  });
  assert.deepEqual(args.slice(0, 7), [
    '--search',
    '--ask-for-approval',
    'never',
    '--sandbox',
    'workspace-write',
    '--cd',
    process.cwd(),
  ]);
  assert.ok(args.includes('resume'));
  assert.ok(args.includes('--json'));
  assert.ok(args.includes('gpt-test'));
});

test('classifies Codex reconnect, network wait, and transport fallback events', () => {
  assert.deepEqual(
    classifyNetworkEvent({
      type: 'error',
      message:
        'Reconnecting... 3/5 (stream disconnected before completion: websocket closed by server before response.completed)',
    }),
    {
      status: 'reconnecting',
      detail: '网络重连 3/5',
      attempt: 3,
      maximumAttempts: 5,
    },
  );
  assert.deepEqual(
    classifyNetworkEvent({
      type: 'error',
      message: 'Reconnecting... waiting for network (Connection failed: error sending request)',
    }),
    {
      status: 'waiting',
      detail: '等待网络恢复',
    },
  );
  assert.deepEqual(
    classifyNetworkEvent({
      type: 'item.completed',
      item: {
        type: 'error',
        message:
          'Falling back from WebSockets to HTTPS transport. stream disconnected before completion',
      },
    }),
    {
      status: 'fallback',
      detail: 'WebSocket 异常，正在切换 HTTPS',
    },
  );
});

test('maps JSONL activity to stable production phases', () => {
  assert.deepEqual(
    inferProgressUpdate({type: 'item.started', item: {type: 'web_search'}}),
    {phaseIndex: 2, detail: '正在检索正规公开资料'},
  );
  assert.deepEqual(
    inferProgressUpdate({
      type: 'item.started',
      item: {type: 'command_execution', command: 'npm run book:storyboards-check'},
    }),
    {phaseIndex: 5, detail: '正在检查分镜母图比例'},
  );
  assert.deepEqual(
    inferProgressUpdate({
      type: 'item.started',
      item: {type: 'command_execution', command: 'npm run book:quality'},
    }),
    {phaseIndex: 3, detail: '正在执行质量门与 SHA-256 审批'},
  );
  assert.deepEqual(
    inferProgressUpdate({
      type: 'item.completed',
      item: {
        type: 'file_change',
        changes: {path: 'E:/repo/books/book-004/content/visual-plan.json'},
      },
    }),
    {phaseIndex: 4, detail: '正在编排分镜、封面与发音配置'},
  );
  assert.deepEqual(
    inferProgressUpdate({
      type: 'item.started',
      item: {
        type: 'command_execution',
        command:
          'Copy-Item C:/Users/user/.codex/generated_images/a.png books/book-004/public/assets/storyboards/01.png',
      },
    }),
    {phaseIndex: 5, detail: '正在保存并检查原创插画'},
  );
  assert.deepEqual(
    inferProgressUpdate({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        text: 'Rendering is actively progressing (about 2,160 of 17,607 frames).',
      },
    }),
    {phaseIndex: 7, detail: '视频渲染 2,160/17,607 帧（12%）'},
  );
  assert.deepEqual(
    inferProgressUpdate({
      type: 'item.started',
      item: {
        type: 'command_execution',
        command: 'npm run book:check -- --outputs',
      },
    }),
    {phaseIndex: 8, detail: '正在核验最终视频、封面和发布文案'},
  );
});

test('renders concise progress and exposes reconnect then recovery status', () => {
  let now = Date.parse('2026-08-21T10:00:00.000Z');
  const writes = [];
  const output = {
    isTTY: false,
    write(value) {
      writes.push(value);
    },
  };
  const reporter = new BookAutoProgress({
    context: {contentDir: 'Z:/missing/content', publicDir: 'Z:/missing/public'},
    output,
    now: () => now,
    heartbeatMs: 60_000,
  });
  reporter.start();
  reporter.setPhase(5, '正在生成并检查原创插画');
  reporter.handleEvent({
    type: 'error',
    message: 'Reconnecting... 2/5 (stream disconnected before completion)',
  });
  assert.match(writes.at(-1), /网络重连 2\/5/u);
  assert.match(writes.at(-1), /可切换网络节点/u);

  now += 2_000;
  reporter.handleEvent({
    type: 'item.started',
    item: {type: 'command_execution', command: 'npm run book:status'},
  });
  assert.match(writes.at(-1), /网络已恢复/u);
  reporter.finish(true, '全部交付文件已通过验收');
  assert.match(writes.at(-1), /8\/8 交付验收/u);
});

test('formats one compact line with stage, elapsed time, and activity heartbeat', () => {
  const line = formatProgressLine({
    phaseIndex: 6,
    phaseTotal: 8,
    phaseName: '素材预检、配音与时间轴',
    detail: '正在生成配音 10/18 段',
    networkStatus: 'online',
    networkDetail: '',
    elapsedMs: 1_234_000,
    idleMs: 8_000,
    finalStatus: '',
  });
  assert.match(line, /6\/8/u);
  assert.match(line, /正在生成配音 10\/18 段/u);
  assert.match(line, /已用时 20:34/u);
  assert.match(line, /最近活动 8 秒前/u);
  assert.doesNotMatch(line, /Codex command|starship/iu);
});
