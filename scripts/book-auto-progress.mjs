import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const AUTO_PHASES = [
  '环境检查与项目初始化',
  '公开资料研究与脚本',
  '质量检查与脚本审批',
  '分镜与封面规划',
  '原创插画生成',
  '素材预检、配音与时间轴',
  '视频与封面渲染',
  '交付验收',
];

const normalizeText = (value) => String(value ?? '').replace(/\s+/gu, ' ').trim();

const getEventMessage = (event) => {
  if (event?.type === 'error') return normalizeText(event.message ?? event.error?.message);
  if (event?.type === 'turn.failed') {
    return normalizeText(event.message ?? event.error?.message ?? event.error);
  }
  if (event?.item?.type === 'error') {
    return normalizeText(event.item.message ?? event.item.text);
  }
  return '';
};

const classifyNetworkMessage = (message) => {
  const normalized = normalizeText(message);
  if (!normalized) return null;

  const attempt = normalized.match(/reconnecting\.\.\.\s*(\d+)\s*\/\s*(\d+)/iu);
  if (attempt) {
    return {
      status: 'reconnecting',
      detail: `网络重连 ${attempt[1]}/${attempt[2]}`,
      attempt: Number(attempt[1]),
      maximumAttempts: Number(attempt[2]),
    };
  }
  if (/reconnecting\.\.\.\s*waiting for network/iu.test(normalized)) {
    return {
      status: 'waiting',
      detail: '等待网络恢复',
    };
  }
  if (/falling back from websockets? to https transport/iu.test(normalized)) {
    return {
      status: 'fallback',
      detail: 'WebSocket 异常，正在切换 HTTPS',
    };
  }
  if (
    /(?:reconnect|connection failed|stream disconnected|websocket closed|network is unreachable|timed? out|socket hang up|econnreset|econnrefused|enotfound)/iu.test(
      normalized,
    )
  ) {
    return {
      status: 'reconnecting',
      detail: '网络异常，正在尝试恢复',
    };
  }
  return null;
};

const classifyNetworkEvent = (event) =>
  classifyNetworkMessage(getEventMessage(event));

const getFileChangePaths = (item) => {
  const changes = Array.isArray(item?.changes) ? item.changes : [item?.changes];
  return changes
    .map((change) => normalizeText(change?.path))
    .filter(Boolean)
    .map((filePath) => filePath.replaceAll('\\', '/').toLowerCase());
};

const parseRenderDetail = (text) => {
  const pair = text.match(/([\d,]+)\s*(?:of|\/)\s*([\d,]+)\s*frames?/iu);
  if (pair) {
    const current = Number(pair[1].replaceAll(',', ''));
    const total = Number(pair[2].replaceAll(',', ''));
    if (current > 0 && total > 0) {
      return `视频渲染 ${current.toLocaleString('en-US')}/${total.toLocaleString('en-US')} 帧（${Math.min(100, Math.round((current / total) * 100))}%）`;
    }
  }
  const single = text.match(/(?:reached|about|roughly|at)\s*(?:about\s*)?([\d,]+)\s*frames?/iu);
  if (single) return `视频渲染已完成约 ${single[1]} 帧`;
  return '正在渲染视频与两种封面';
};

const inferProgressUpdate = (event) => {
  const item = event?.item ?? {};
  const itemType = item.type ?? '';
  const text = normalizeText(item.text ?? item.message);

  if (itemType === 'web_search') {
    return {phaseIndex: 2, detail: '正在检索正规公开资料'};
  }

  if (itemType === 'file_change') {
    const paths = getFileChangePaths(item);
    if (
      paths.some((filePath) =>
        /\/(?:visual-plan|cover|narration-config|video-layout)\.json$/u.test(filePath),
      )
    ) {
      return {phaseIndex: 4, detail: '正在编排分镜、封面与发音配置'};
    }
    if (paths.some((filePath) => /\/(?:script|source-map|publish)\.json$/u.test(filePath))) {
      return {phaseIndex: 2, detail: '正在撰写并复审脚本'};
    }
  }

  if (itemType === 'mcp_tool_call') {
    const tool = normalizeText(item.tool ?? item.name).toLowerCase();
    if (tool.includes('image')) {
      return {phaseIndex: 5, detail: '正在生成并检查原创插画'};
    }
  }

  if (itemType === 'command_execution') {
    const command = normalizeText(item.command).toLowerCase();
    const completed = event.type === 'item.completed';
    const succeeded = completed && item.exit_code === 0;
    if (
      /book:check\b[^\n]*--outputs|ffprobe|ffmpeg[^\n]*-frames:v\s+1|get-filehash/iu.test(
        command,
      )
    ) {
      return {phaseIndex: 8, detail: '正在核验最终视频、封面和发布文案'};
    }
    if (/book:covers|book:render|render-book\.mjs|render:video/iu.test(command)) {
      return {phaseIndex: 7, detail: '正在渲染视频与两种封面'};
    }
    if (/book:produce/iu.test(command)) {
      return succeeded
        ? {phaseIndex: 8, detail: '生产流程已通过，正在做最终交付验收'}
        : {phaseIndex: 6, detail: '正在执行素材预检、配音与生产流程'};
    }
    if (/book:voice|book:preflight|book:prepare/iu.test(command)) {
      return {phaseIndex: 6, detail: '正在执行素材预检、配音与时间轴生成'};
    }
    if (/book:storyboards-check/iu.test(command)) {
      return {phaseIndex: 5, detail: '正在检查分镜母图比例'};
    }
    if (/generated_images|public[\\/]assets[\\/](?:storyboards|cover)/iu.test(command)) {
      return {phaseIndex: 5, detail: '正在保存并检查原创插画'};
    }
    if (/book:quality|book:review|book:approve|book:approval-check/iu.test(command)) {
      return {phaseIndex: 3, detail: '正在执行质量门与 SHA-256 审批'};
    }
  }

  if (itemType === 'agent_message') {
    if (/delivery files verified|independent delivery qa|最终.*(?:核验|验收)|媒体流.*通过/iu.test(text)) {
      return {phaseIndex: 8, detail: '正在核验最终视频、封面和发布文案'};
    }
    if (/rendering (?:is|has|reached|progress)|render progress|moved into rendering|frames?.*(?:remaining|complete)/iu.test(text)) {
      return {phaseIndex: 7, detail: parseRenderDetail(text)};
    }
    const tts = text.match(/tts segment\s*(\d+)\s*(?:of|\/)\s*(\d+)/iu);
    if (tts) {
      return {phaseIndex: 6, detail: `正在生成配音 ${tts[1]}/${tts[2]} 段`};
    }
    if (/\btts\b|\bwav\b|narration timeline|audio-master|配音|时间轴/iu.test(text)) {
      return {phaseIndex: 6, detail: '正在生成或校验配音与时间轴'};
    }
    if (
      /storyboards?\s*\d|image service|images? (?:are|is) still render|original asset generation|visual batch|cover artwork remains|all \d+ storyboard/iu.test(
        text,
      )
    ) {
      return {phaseIndex: 5, detail: '正在生成并检查原创插画'};
    }
    if (/approval-check passed|approval hash|script is now archived|sha-256 approved/iu.test(text)) {
      return {phaseIndex: 3, detail: '脚本已通过质量检查，正在锁定审批哈希'};
    }
    if (/public evidence is sufficient|source-backed script|正在.*脚本|drafting/iu.test(text)) {
      return {phaseIndex: 2, detail: '正在整理证据并撰写脚本'};
    }
  }

  return null;
};

const getAssetProgress = (context) => {
  try {
    const visualPlan = JSON.parse(
      readFileSync(path.join(context.contentDir, 'visual-plan.json'), 'utf8'),
    );
    const cover = JSON.parse(
      readFileSync(path.join(context.contentDir, 'cover.json'), 'utf8'),
    );
    const relativePaths = new Set(
      (visualPlan.segments ?? [])
        .map((segment) => normalizeText(segment.image))
        .filter(Boolean),
    );
    if (normalizeText(cover.image)) relativePaths.add(cover.image);
    const paths = [...relativePaths];
    return {
      completed: paths.filter((relativePath) =>
        existsSync(path.join(context.publicDir, relativePath)),
      ).length,
      total: paths.length,
    };
  } catch {
    return {completed: 0, total: 0};
  }
};

const formatDuration = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatIdle = (milliseconds) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 5) return '刚刚';
  if (seconds < 60) return `${seconds} 秒前`;
  return `${Math.floor(seconds / 60)} 分钟前`;
};

const formatProgressLine = (snapshot) => {
  const total = snapshot.phaseTotal;
  const width = 16;
  const completed = Math.max(0, Math.min(width, Math.round((snapshot.phaseIndex / total) * width)));
  const bar = `${'█'.repeat(completed)}${'░'.repeat(width - completed)}`;
  const icon = snapshot.finalStatus === 'completed' ? '✓' : snapshot.finalStatus === 'failed' ? '✗' : '›';
  const parts = [
    `${icon} [${bar}] ${snapshot.phaseIndex}/${total} ${snapshot.phaseName}`,
  ];
  if (snapshot.detail && snapshot.detail !== snapshot.phaseName) parts.push(snapshot.detail);
  if (snapshot.networkStatus === 'recovered') {
    parts.push('网络已恢复，继续执行');
  } else if (snapshot.networkStatus !== 'online') {
    parts.push(`${snapshot.networkDetail}；可切换网络节点`);
  }
  parts.push(`已用时 ${formatDuration(snapshot.elapsedMs)}`);
  parts.push(`最近活动 ${formatIdle(snapshot.idleMs)}`);
  return parts.join('｜');
};

class BookAutoProgress {
  constructor({
    context,
    output = process.stdout,
    verbose = false,
    heartbeatMs = 15_000,
    now = () => Date.now(),
    onSnapshot = () => {},
  }) {
    this.context = context;
    this.output = output;
    this.verbose = verbose;
    this.heartbeatMs = heartbeatMs;
    this.now = now;
    this.onSnapshot = onSnapshot;
    this.dynamic = Boolean(output.isTTY && !verbose);
    this.startedAt = now();
    this.lastActivityAt = this.startedAt;
    this.phaseIndex = 1;
    this.detail = AUTO_PHASES[0];
    this.networkStatus = 'online';
    this.networkDetail = '';
    this.networkRecoveredUntil = 0;
    this.finalStatus = '';
    this.timer = null;
    this.lastPrintedSignature = '';
  }

  start() {
    this.render(true);
    this.timer = setInterval(() => this.render(), this.heartbeatMs);
    this.timer.unref?.();
  }

  setPhase(phaseIndex, detail = '') {
    const previousPhase = this.phaseIndex;
    const previousDetail = this.detail;
    const nextPhase = Math.max(1, Math.min(AUTO_PHASES.length, phaseIndex));
    if (nextPhase < this.phaseIndex) {
      this.detail = `返工：${AUTO_PHASES[nextPhase - 1]}`;
    } else {
      this.phaseIndex = nextPhase;
      this.detail = detail || AUTO_PHASES[nextPhase - 1];
    }
    this.lastActivityAt = this.now();
    this.render(previousPhase !== this.phaseIndex || previousDetail !== this.detail);
  }

  handleEvent(event) {
    const network = classifyNetworkEvent(event);
    if (network) {
      const changed =
        this.networkStatus !== network.status || this.networkDetail !== network.detail;
      this.networkStatus = network.status;
      this.networkDetail = network.detail;
      this.networkRecoveredUntil = 0;
      this.lastActivityAt = this.now();
      this.render(changed);
      return;
    }

    const isActivity = Boolean(event?.type);
    if (isActivity) {
      this.lastActivityAt = this.now();
      if (!['online', 'recovered'].includes(this.networkStatus)) {
        this.networkStatus = 'recovered';
        this.networkDetail = '网络已恢复';
        this.networkRecoveredUntil = this.now() + 10_000;
      }
    }
    const update = inferProgressUpdate(event);
    if (update) this.setPhase(update.phaseIndex, update.detail);
    else this.render(false);
  }

  handleStderrLine(line) {
    const network = classifyNetworkMessage(line);
    if (!network) return false;
    const changed =
      this.networkStatus !== network.status || this.networkDetail !== network.detail;
    this.networkStatus = network.status;
    this.networkDetail = network.detail;
    this.networkRecoveredUntil = 0;
    this.lastActivityAt = this.now();
    this.render(changed);
    return true;
  }

  snapshot() {
    const currentTime = this.now();
    if (
      this.networkStatus === 'recovered' &&
      this.networkRecoveredUntil > 0 &&
      currentTime >= this.networkRecoveredUntil
    ) {
      this.networkStatus = 'online';
      this.networkDetail = '';
      this.networkRecoveredUntil = 0;
    }
    const assets = getAssetProgress(this.context);
    let detail = this.detail;
    if (this.phaseIndex === 5 && assets.total > 0) {
      detail = `原创插画 ${assets.completed}/${assets.total}`;
    }
    return {
      phaseIndex: this.phaseIndex,
      phaseTotal: AUTO_PHASES.length,
      phaseName: AUTO_PHASES[this.phaseIndex - 1],
      detail,
      networkStatus: this.networkStatus,
      networkDetail: this.networkDetail,
      elapsedMs: currentTime - this.startedAt,
      idleMs: currentTime - this.lastActivityAt,
      lastActivityAt: new Date(this.lastActivityAt).toISOString(),
      heartbeatAt: new Date(currentTime).toISOString(),
      assets,
      finalStatus: this.finalStatus,
    };
  }

  render(force = false) {
    const snapshot = this.snapshot();
    this.onSnapshot(snapshot);
    const line = formatProgressLine(snapshot);
    const signatureNetworkStatus =
      !this.dynamic && snapshot.networkStatus === 'recovered'
        ? 'online'
        : snapshot.networkStatus;
    const signature = [
      snapshot.phaseIndex,
      snapshot.detail,
      signatureNetworkStatus,
      signatureNetworkStatus === 'online' ? '' : snapshot.networkDetail,
      snapshot.finalStatus,
    ].join('|');
    if (!this.dynamic && !force && signature === this.lastPrintedSignature) return;
    this.lastPrintedSignature = signature;
    if (this.dynamic) {
      readline.clearLine(this.output, 0);
      readline.cursorTo(this.output, 0);
      this.output.write(line);
    } else {
      this.output.write(`${line}\n`);
      if (snapshot.networkStatus === 'recovered') {
        this.networkStatus = 'online';
        this.networkDetail = '';
        this.networkRecoveredUntil = 0;
      }
    }
  }

  finish(success, detail) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (success) this.phaseIndex = AUTO_PHASES.length;
    this.detail = detail;
    this.finalStatus = success ? 'completed' : 'failed';
    this.networkStatus = 'online';
    this.networkDetail = '';
    this.lastActivityAt = this.now();
    this.render(true);
    if (this.dynamic) this.output.write('\n');
  }
}

export {
  AUTO_PHASES,
  BookAutoProgress,
  classifyNetworkEvent,
  classifyNetworkMessage,
  formatProgressLine,
  inferProgressUpdate,
};
