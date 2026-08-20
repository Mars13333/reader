import {existsSync, mkdirSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {createInterface} from 'node:readline/promises';
import {stdin as input, stdout as output} from 'node:process';
import {
  FIXED_VOICE,
  booksRoot,
  getBookContext,
  getCliOption,
  readActiveBookId,
  readJson,
  setActiveBook,
  writeJson,
} from './book-context.mjs';

const args = process.argv.slice(2);
const command = args[0] ?? 'status';

const cleanDirectoryTitle = (title) => {
  const cleaned = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '-')
    .replace(/\s+/gu, '-')
    .replace(/[. ]+$/gu, '')
    .slice(0, 60);
  if (!cleaned) throw new Error('书名不能生成有效目录名。');
  return cleaned;
};

const getExistingBooks = () => {
  if (!existsSync(booksRoot)) return [];
  return readdirSync(booksRoot, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && existsSync(path.join(booksRoot, entry.name, 'book.json')))
    .map((entry) => ({id: entry.name, config: readJson(path.join(booksRoot, entry.name, 'book.json'))}))
    .sort((a, b) => a.id.localeCompare(b.id, 'zh-CN'));
};

const getNewBookAnswers = async () => {
  let title = getCliOption('--title', args);
  let author = getCliOption('--author', args);
  let audience = getCliOption('--audience', args);
  if ((!title || !author) && !process.stdin.isTTY) {
    throw new Error('非交互模式必须传入 --title 和 --author。');
  }
  if (!title || !author || !audience) {
    const prompt = createInterface({input, output});
    try {
      title ||= (await prompt.question('书名：')).trim();
      author ||= (await prompt.question('作者：')).trim();
      audience ||= (await prompt.question('目标观众（可回车使用默认值）：')).trim();
    } finally {
      prompt.close();
    }
  }
  if (!title?.trim() || !author?.trim()) throw new Error('书名和作者不能为空。');
  return {
    title: title.trim(),
    author: author.trim(),
    audience: audience?.trim() || '25～40岁泛读书用户',
  };
};

const createBook = async () => {
  const answers = await getNewBookAnswers();
  const existing = getExistingBooks();
  const nextNumber =
    Math.max(0, ...existing.map(({id}) => Number(id.match(/^book-(\d+)-/u)?.[1] ?? 0))) + 1;
  const bookId = `book-${String(nextNumber).padStart(3, '0')}-${cleanDirectoryTitle(answers.title)}`;
  const bookRoot = path.join(booksRoot, bookId);
  if (existsSync(bookRoot)) throw new Error(`目录已存在：${bookRoot}`);

  for (const directory of [
    'content',
    'generated',
    'public/assets/audio',
    'public/assets/cover',
    'public/assets/storyboards',
    'output',
  ]) {
    mkdirSync(path.join(bookRoot, directory), {recursive: true});
  }

  const createdAt = new Date().toISOString();
  writeJson(path.join(bookRoot, 'book.json'), {
    id: bookId,
    title: answers.title,
    author: answers.author,
    audience: answers.audience,
    status: 'draft',
    createdAt,
    updatedAt: createdAt,
    fixedNarration: {
      speaker: FIXED_VOICE.speaker,
      voiceName: FIXED_VOICE.voiceName,
      speechRate: FIXED_VOICE.speechRate,
    },
    editorialStandards: {
      allowClosingBrandLine: false,
    },
    deliverables: {
      video: 'output/final.mp4',
      covers: [
        'output/cover-9x16.png',
        'output/cover-3x4.png',
        'output/cover-4x3.png',
      ],
      subtitles: false,
      standaloneAudio: false,
    },
  });
  writeJson(path.join(bookRoot, 'content', 'script.json'), {
    title: `《${answers.title}》：待确定的视频标题`,
    author: answers.author,
    angle: '',
    targetDurationSeconds: 600,
    fps: 30,
    width: 1080,
    height: 1920,
    segments: [],
  });
  writeJson(path.join(bookRoot, 'content', 'source-map.json'), {
    book: answers.title,
    author: answers.author,
    sourcePath: '',
    sourceSha256: '',
    sourceEncoding: '',
    chapterLines: {},
    editorialRules: [
      '成片是原创评论，不是有声书或逐章复述。',
      '不展示原书内页、连续长段文字、影视剧照或演员形象。',
    ],
  });
  writeJson(path.join(bookRoot, 'content', 'visual-plan.json'), {
    panelLayout: '2x2',
    panelOrder: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    segments: [],
  });
  writeJson(path.join(bookRoot, 'content', 'narration-config.json'), {
    ...FIXED_VOICE,
    leadInMs: 500,
    interSegmentPauseMs: 420,
    tailMs: 1400,
    silenceThreshold: 180,
    audioFile: 'assets/audio/narration.wav',
  });
  writeJson(path.join(bookRoot, 'content', 'video-layout.json'), {
    showProgressBar: false,
    header: {
      text: `《${answers.title}》· 10分钟读书`,
      top: 290,
      sideMargin: 120,
      fontSize: 34,
    },
    keywordCard: {
      top: 500,
    },
  });
  writeJson(path.join(bookRoot, 'content', 'cover.json'), {
    image: 'assets/cover/cover-art.png',
    eyebrow: `${answers.author}《${answers.title}》`,
    headline: ['待填写', '封面主标题', '第三行'],
    badge: '10分钟读书',
    layouts: {
      vertical9x16: {left: 72, eyebrowTop: 150, headlineTop: 260, badgeTop: 730, artObjectPosition: 'center center'},
      portrait3x4: {left: 64, eyebrowTop: 70, headlineTop: 160, badgeTop: 610, artObjectPosition: 'center 50%'},
      landscape4x3: {left: 80, eyebrowTop: 64, headlineTop: 178, badgeTop: 720, artObjectPosition: 'center 36%'},
    },
  });
  setActiveBook(bookId);
  console.log(`已创建并选中：${bookId}`);
  console.log(`目录：${bookRoot}`);
  console.log('下一步：让 Codex 完成 content/script.json，然后运行 npm run book:review。');
};

const listBooks = () => {
  const books = getExistingBooks();
  let activeId = '';
  try {
    activeId = readActiveBookId();
  } catch {
    // It is valid to list books before choosing one.
  }
  if (!books.length) {
    console.log('尚未创建书籍项目。');
    return;
  }
  for (const {id, config} of books) {
    console.log(`${id === activeId ? '*' : ' '} ${id}  [${config.status ?? 'unknown'}]`);
  }
};

const useBook = () => {
  const bookId = args[1] ?? getCliOption('--book', args);
  if (!bookId) throw new Error('用法：npm run book:use -- <book-id>');
  console.log(`当前书籍：${setActiveBook(bookId)}`);
};

const showStatus = () => {
  const context = getBookContext(args[1]);
  console.log(`当前书籍：${context.bookId}`);
  console.log(`书名：${context.book.title}`);
  console.log(`作者：${context.book.author}`);
  console.log(`状态：${context.book.status}`);
  console.log(`目录：${context.bookRoot}`);
  console.log(`固定配音：${FIXED_VOICE.voiceName} / ${FIXED_VOICE.speaker} / 语速 ${FIXED_VOICE.speechRate}`);
};

if (command === 'new') await createBook();
else if (command === 'list') listBooks();
else if (command === 'use') useBook();
else if (command === 'status') showStatus();
else throw new Error(`未知命令：${command}`);
