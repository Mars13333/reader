import {spawn, spawnSync} from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  getBookContext,
  readActiveBookId,
  root,
  setActiveBook,
  writeJson,
} from './book-context.mjs';
import {
  BookAutoProgress,
  classifyNetworkEvent,
} from './book-auto-progress.mjs';

const DEFAULT_SANDBOX = 'workspace-write';
const VALID_SANDBOXES = new Set([
  'read-only',
  'workspace-write',
  'danger-full-access',
]);

const getOption = (name, args) => {
  const prefix = `${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const parseAutoArgs = (args = process.argv.slice(2)) => {
  const options = {
    title: getOption('--title', args),
    author: getOption('--author', args),
    audience: getOption('--audience', args),
    bookId: getOption('--book', args),
    model: getOption('--model', args) ?? process.env.AI_MEDIA_CODEX_MODEL ?? '',
    sandbox: getOption('--sandbox', args) ?? DEFAULT_SANDBOX,
    resume: args.includes('--resume'),
    check: args.includes('--check'),
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
  };
  if (!VALID_SANDBOXES.has(options.sandbox)) {
    throw new Error(
      `--sandbox 仅支持：${[...VALID_SANDBOXES].join(', ')}`,
    );
  }
  if (options.resume && (options.title || options.author || options.audience)) {
    throw new Error('--resume 不能与 --title、--author 或 --audience 同时使用。');
  }
  if (Boolean(options.title) !== Boolean(options.author)) {
    throw new Error('--title 和 --author 必须同时提供。');
  }
  if (options.bookId && options.title) {
    throw new Error('--book 不能与 --title 或 --author 同时使用。');
  }
  return options;
};

const resolveCodexInvocation = () => {
  const override = process.env.CODEX_CLI_PATH;
  if (override && existsSync(override)) {
    return path.extname(override).toLowerCase() === '.js'
      ? {executable: process.execPath, prefixArgs: [override], display: override}
      : {executable: override, prefixArgs: [], display: override};
  }
  if (process.platform === 'win32') {
    const npmCli = path.join(
      path.dirname(process.execPath),
      'node_modules',
      '@openai',
      'codex',
      'bin',
      'codex.js',
    );
    if (existsSync(npmCli)) {
      return {executable: process.execPath, prefixArgs: [npmCli], display: npmCli};
    }
  }
  return {executable: 'codex', prefixArgs: [], display: 'codex'};
};

const runCaptured = (invocation, args) =>
  spawnSync(invocation.executable, [...invocation.prefixArgs, ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });

const findImagegenSkill = () => {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const candidates = [
    path.join(codexHome, 'skills', '.system', 'imagegen', 'SKILL.md'),
    path.join(os.homedir(), '.agents', 'skills', 'imagegen', 'SKILL.md'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? '';
};

const checkAutomationEnvironment = () => {
  const invocation = resolveCodexInvocation();
  const version = runCaptured(invocation, ['--version']);
  if (version.error || version.status !== 0) {
    throw new Error('未找到可用的 Codex CLI。请先安装或升级 Codex CLI。');
  }
  const login = runCaptured(invocation, ['login', 'status']);
  if (login.status !== 0) {
    throw new Error('Codex CLI 尚未登录。请先运行 codex login。');
  }
  const repoSkill = path.join(
    root,
    '.agents',
    'skills',
    'ai-media-book-video',
    'SKILL.md',
  );
  if (!existsSync(repoSkill)) {
    throw new Error(`缺少仓库级 Skill：${repoSkill}`);
  }
  const imagegenSkill = findImagegenSkill();
  if (!imagegenSkill) {
    throw new Error(
      '未发现 imagegen Skill，无法保证自动生成原创插画。请先安装或恢复 Codex 内置 imagegen Skill。',
    );
  }
  return {
    codexInvocation: invocation,
    version: version.stdout.trim(),
    login: (login.stdout || login.stderr).trim(),
    repoSkill,
    imagegenSkill,
  };
};

const runInherited = (command, args, env = process.env) => {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const createBook = (options) => {
  const args = ['scripts/book-manager.mjs', 'new'];
  if (options.title) args.push('--title', options.title);
  if (options.author) args.push('--author', options.author);
  if (options.audience) args.push('--audience', options.audience);
  runInherited(process.execPath, args);
  return getBookContext(readActiveBookId());
};

const resolveBook = (options) => {
  if (options.bookId) setActiveBook(options.bookId);
  return getBookContext(options.bookId);
};

const buildAutoPrompt = ({bookId, resume = false}) => `
Use $ai-media-book-video to ${resume ? 'resume and finish' : 'produce'} the current book project \`${bookId}\` in end-to-end auto mode.

The user invoked \`npm run book:auto\`. That invocation is explicit authorization for this book's project-local research, content edits, script approval, built-in image generation, configured TTS calls, Remotion rendering, and delivery verification. It is not authorization to publish externally, alter another book, replace configured services, or bypass source and quality requirements.

Do not call \`npm run book:auto\` recursively. Follow the repository Skill, \`AGENTS.md\`, \`docs/workflow.md\`, and \`docs/acceptance.md\`. Continue from existing valid artifacts when resuming. Use authoritative public sources first, complete the script/source/publish files and semantic self-review, pass the existing quality and approval gates, create the visual plan and original storyboard/cover images with $imagegen, then call the existing lower-level production commands until every delivery file declared by the current book passes verification. For books configured with \`portrait-2x2-9x16-v1\`, every storyboard sheet must be a portrait 9:16 PNG containing a 2x2 grid of four portrait 9:16 panels; run \`npm run book:storyboards-check\` after saving the images and before TTS or rendering.

If reliable sources are insufficient, a required tool/auth/quota is unavailable, or a quality failure remains after three focused repair passes, stop without fabricating or weakening a gate. Leave all valid artifacts in place and report the exact resumable blocker. End the final message with exactly one marker: \`BOOK_AUTO_RESULT: completed\` or \`BOOK_AUTO_RESULT: blocked\`.
`.trim();

const buildCodexArgs = ({bookId, model, sandbox, sessionId = ''}) => {
  const resume = Boolean(sessionId);
  const prompt = buildAutoPrompt({bookId, resume});
  const args = [
    '--search',
    '--ask-for-approval',
    'never',
    '--sandbox',
    sandbox,
    '--cd',
    root,
    'exec',
    '--json',
  ];
  if (model) args.push('--model', model);
  if (resume) args.push('resume', sessionId, prompt);
  else args.push(prompt);
  return args;
};

const statePaths = (context) => {
  const directory = path.join(context.runtimeDir, 'book-auto');
  return {
    directory,
    state: path.join(directory, `${context.bookId}.json`),
    log: path.join(directory, `${context.bookId}.jsonl`),
    stderr: path.join(directory, `${context.bookId}-stderr.log`),
    verification: path.join(directory, `${context.bookId}-verification.log`),
    lastMessage: path.join(directory, `${context.bookId}-last-message.txt`),
  };
};

const readState = async (filePath) => {
  if (!existsSync(filePath)) return null;
  const {readFile} = await import('node:fs/promises');
  return JSON.parse(await readFile(filePath, 'utf8'));
};

const extractSessionId = (event) =>
  event.thread_id ?? event.threadId ?? event.session_id ?? event.sessionId ?? '';

const summarizeEvent = (event) => {
  if (event.type === 'error') return `Codex error: ${event.message ?? 'unknown error'}`;
  if (event.type === 'turn.failed') {
    return `Codex turn failed: ${event.message ?? event.error?.message ?? 'unknown error'}`;
  }
  if (event.type !== 'item.completed') return '';
  const item = event.item ?? {};
  if (item.type === 'agent_message') return item.text ?? '';
  if (item.type === 'command_execution') {
    return item.command ? `Codex command: ${item.command}` : '';
  }
  if (item.type === 'mcp_tool_call') {
    return item.tool ? `Codex tool: ${item.tool}` : '';
  }
  if (item.type === 'error') return item.message ? `Codex error: ${item.message}` : '';
  return '';
};

const runCodex = async ({environment, context, options, previousState, reporter}) => {
  const paths = statePaths(context);
  mkdirSync(paths.directory, {recursive: true});
  const startedAt =
    (options.resume ? previousState?.startedAt : '') || new Date().toISOString();
  const state = {
    bookId: context.bookId,
    status: 'running',
    sessionId: options.resume ? previousState?.sessionId ?? '' : '',
    model: options.model || 'codex-default',
    sandbox: options.sandbox,
    startedAt,
    updatedAt: new Date().toISOString(),
    logPath: paths.log,
    stderrPath: paths.stderr,
    verificationLogPath: paths.verification,
    lastMessagePath: paths.lastMessage,
  };
  writeJson(paths.state, state);
  reporter.onSnapshot = (snapshot) => {
    state.progress = {
      phaseIndex: snapshot.phaseIndex,
      phaseTotal: snapshot.phaseTotal,
      phaseName: snapshot.phaseName,
      detail: snapshot.detail,
      networkStatus: snapshot.networkStatus,
      networkDetail: snapshot.networkDetail,
      assets: snapshot.assets,
      lastActivityAt: snapshot.lastActivityAt,
      heartbeatAt: snapshot.heartbeatAt,
    };
    state.updatedAt = snapshot.heartbeatAt;
    writeJson(paths.state, state);
  };

  const args = buildCodexArgs({
    bookId: context.bookId,
    model: options.model,
    sandbox: options.sandbox,
    sessionId: options.resume ? state.sessionId : '',
  });
  const log = createWriteStream(paths.log, {flags: options.resume ? 'a' : 'w'});
  const stderrLog = createWriteStream(paths.stderr, {
    flags: options.resume ? 'a' : 'w',
  });
  const child = spawn(
    environment.codexInvocation.executable,
    [...environment.codexInvocation.prefixArgs, ...args],
    {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    },
  );
  let buffer = '';
  let stderrBuffer = '';
  let lastMessage = '';
  let lastError = '';

  const handleLine = (line) => {
    if (!line.trim()) return;
    log.write(`${line}\n`);
    try {
      const event = JSON.parse(line);
      reporter.handleEvent(event);
      const sessionId = extractSessionId(event);
      if (sessionId && !state.sessionId) {
        state.sessionId = sessionId;
        state.updatedAt = new Date().toISOString();
        writeJson(paths.state, state);
      }
      if (
        !classifyNetworkEvent(event) &&
        (event.type === 'error' || event.type === 'turn.failed')
      ) {
        lastError =
          event.message ?? event.error?.message ?? String(event.error ?? 'Codex 运行失败');
      }
      const summary = summarizeEvent(event);
      if (summary) {
        if (event.item?.type === 'agent_message') lastMessage = summary;
        if (options.verbose) console.log(summary);
      }
    } catch {
      if (options.verbose) console.log(line);
    }
  };

  const handleStderrLine = (line) => {
    if (!line.trim()) return;
    const isNetworkStatus = reporter.handleStderrLine(line);
    const isPromptNoise = /starship::print|dumb terminal/iu.test(line);
    if (
      !isNetworkStatus &&
      !isPromptNoise &&
      /(?:error|failed|fatal|exception)/iu.test(line)
    ) {
      lastError = line.trim();
    }
    if (options.verbose) process.stderr.write(`${line}\n`);
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? '';
    for (const line of lines) handleLine(line);
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderrLog.write(chunk);
    stderrBuffer += chunk;
    const lines = stderrBuffer.split(/\r?\n/u);
    stderrBuffer = lines.pop() ?? '';
    for (const line of lines) handleStderrLine(line);
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
  if (buffer) handleLine(buffer);
  if (stderrBuffer) handleStderrLine(stderrBuffer);
  await Promise.all([
    new Promise((resolve) => log.end(resolve)),
    new Promise((resolve) => stderrLog.end(resolve)),
  ]);
  writeFileSync(paths.lastMessage, `${lastMessage}\n`, 'utf8');
  return {exitCode, state, paths, lastMessage, lastError};
};

const verifyDelivery = (context, verbose = false, outputPath = '') => {
  const result = spawnSync(process.execPath, ['scripts/check.mjs', '--outputs'], {
    cwd: root,
    env: {...process.env, AI_MEDIA_BOOK_ID: context.bookId},
    encoding: 'utf8',
    windowsHide: true,
  });
  if (verbose && result.stdout) process.stdout.write(result.stdout);
  if (verbose && result.stderr) process.stderr.write(result.stderr);
  const capturedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
  if (outputPath) writeFileSync(outputPath, capturedOutput, 'utf8');
  const lines = `${result.stderr ?? ''}\n${result.stdout ?? ''}`
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const detail =
    [...lines].reverse().find((line) => /^(?:ERROR|FAIL|WARN):?/iu.test(line)) ??
    lines.at(-1) ??
    '';
  return {ok: result.status === 0, detail};
};

const printEnvironment = (environment) => {
  console.log(`Codex CLI：${environment.version}`);
  console.log(`Codex 入口：${environment.codexInvocation.display}`);
  console.log(`登录状态：${environment.login}`);
  console.log(`自动编排 Skill：${environment.repoSkill}`);
  console.log(`图片生成 Skill：${environment.imagegenSkill}`);
};

const extractKeyMessage = (message) =>
  String(message ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(
      (line) =>
        line &&
        !line.startsWith('#') &&
        !line.startsWith('-') &&
        !/^BOOK_AUTO_RESULT:/u.test(line),
    ) ?? '';

const main = async () => {
  const options = parseAutoArgs();
  const environment = checkAutomationEnvironment();
  if (options.check || options.verbose) printEnvironment(environment);
  if (options.check) return;

  if (options.dryRun) {
    const bookId = options.bookId || '<book-created-by-book:new>';
    console.log(`DRY RUN：不会创建书籍，也不会启动 Codex。`);
    console.log(buildAutoPrompt({bookId, resume: options.resume}));
    console.log(
      JSON.stringify(
        buildCodexArgs({
          bookId,
          model: options.model,
          sandbox: options.sandbox,
          sessionId: options.resume ? '<saved-session-id>' : '',
        }),
        null,
        2,
      ),
    );
    return;
  }

  const context = options.resume || options.bookId ? resolveBook(options) : createBook(options);
  const paths = statePaths(context);
  const previousState = await readState(paths.state);
  if (options.resume && !previousState?.sessionId) {
    throw new Error(
      `没有可恢复的 Codex 会话：${paths.state}。请去掉 --resume，为当前书启动新的自动会话。`,
    );
  }

  const reporter = new BookAutoProgress({
    context,
    verbose: options.verbose,
  });
  reporter.start();
  reporter.setPhase(
    2,
    options.resume ? '正在检查已有产物并从中断处继续' : '正在启动公开资料研究',
  );
  let result;
  try {
    result = await runCodex({
      environment,
      context,
      options,
      previousState,
      reporter,
    });
  } catch (error) {
    reporter.finish(false, 'Codex 自动会话异常退出');
    throw error;
  }
  const agentCompleted = /BOOK_AUTO_RESULT:\s*completed/u.test(result.lastMessage);
  reporter.setPhase(8, '正在执行最终交付验收');
  const verification =
    result.exitCode === 0 && agentCompleted
      ? verifyDelivery(context, options.verbose, result.paths.verification)
      : {ok: false, detail: ''};
  const delivered = result.exitCode === 0 && agentCompleted && verification.ok;
  result.state.status = delivered ? 'completed' : result.exitCode === 0 ? 'blocked' : 'failed';
  result.state.updatedAt = new Date().toISOString();
  result.state.exitCode = result.exitCode;
  result.state.lastMessage = result.lastMessage;
  writeJson(result.paths.state, result.state);

  if (!delivered) {
    const reason =
      verification.detail ||
      result.lastError ||
      extractKeyMessage(result.lastMessage) ||
      '自动制作未完成，请查看详细日志。';
    reporter.finish(false, reason);
    console.error(`详细日志：${result.paths.log}`);
    console.error(`错误日志：${result.paths.stderr}`);
    if (result.state.sessionId) {
      console.error(`修复阻塞后继续：npm run book:auto -- --resume --book "${context.bookId}"`);
    }
    process.exit(result.exitCode || 1);
  }
  reporter.finish(true, '全部交付文件已通过验收');
  console.log(`交付目录：${context.outputDir}`);
  console.log(`详细日志：${result.paths.log}`);
};

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}

export {
  buildAutoPrompt,
  buildCodexArgs,
  checkAutomationEnvironment,
  parseAutoArgs,
};
