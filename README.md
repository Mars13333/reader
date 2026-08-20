# AI 读书视频工程

这是一个“共享生成引擎＋每本书独立工程”的抖音书单视频项目。Codex 负责脚本、分镜、原创插画、有声视频和三种封面；剪映负责根据最终音频一键识别字幕。

## 固定标准

- 正式口播固定使用火山引擎豆包语音合成 2.0 的刘飞男声 `zh_male_liufei_uranus_bigtts`。
- 语速固定为 `-10`，书籍配置不得覆盖。
- 1080×1920、30 FPS，目标时长 9 分 30 秒～10 分 30 秒。
- 画面约每 8～15 秒切换，不抖动，不逐字跳动。
- 不生成 SRT、不烧录口播字幕、不交付独立 MP3。
- 不生成自制播放进度条，不生成视频内 AI 提示标签。
- 顶部常驻书名使用左右对称安全边距、横向居中并下移到搜索框遮挡区以下；章节重点大字也整体下移。
- 从 `book-002` 开始，结尾口播禁止使用“这里是十分钟读懂一本书”这类固定栏目口号。
- 每本书交付 1 个有声 MP4 和 9:16、3:4、4:3 三种封面。

## 目录结构

```text
ai_media/
├─ active-book.json              # 当前选中的书
├─ books/
│  └─ book-001-长安的荔枝/
│     ├─ book.json               # 书籍元数据与制作状态
│     ├─ approval.json           # 已批准脚本的 SHA-256
│     ├─ content/                # 人工/Codex 编辑的输入
│     ├─ generated/              # 时间轴、审稿文件、镜头表等生成数据
│     ├─ public/assets/          # 本书音频、封面插画和分镜插画
│     └─ output/                 # 本书正式交付文件
├─ scripts/                      # 多书管理、审批、配音与渲染脚本
├─ src/                          # 所有书共用的 Remotion 模板
├─ .runtime/                     # 当前书的临时运行时数据
└─ docs/                         # 全局工作流与验收规范
```

## 标准工作流

### 1. 创建一本新书

```powershell
npm run book:new
```

脚本会询问书名、作者和目标观众，自动创建下一个编号，例如 `book-002-活着`，并将它设为当前书籍。

也可以非交互创建：

```powershell
npm run book:new -- --title "活着" --author "余华" --audience "25～40岁泛读书用户"
```

### 2. Codex 只完成脚本草稿

Codex 读取原书资料，只填写当前书的 `content/script.json` 和来源映射。此阶段禁止生成分镜、插画、配音和视频。

生成便于人工阅读的审稿文件：

```powershell
npm run book:review
```

审稿文件位于当前书的 `generated/script-review.md`，包含完整口播、章节、字符数、目标时长、出处和脚本 SHA-256。

### 3. 人工修改或批准

如果内容不满意，告诉 Codex 修改 `content/script.json`，然后重新运行：

```powershell
npm run book:review
```

确认内容后执行：

```powershell
npm run book:approve
```

`approval.json` 会锁定已审脚本的 SHA-256。批准后修改任何一个字符，后续制作都会拒绝执行，必须重新审稿、重新批准。

### 4. 批准后制作分镜和插画

只有批准完成后，Codex 才能编写 `content/visual-plan.json`、生成分镜插画和三种封面所需的封面插画。

### 5. 一条命令生成正式交付

```powershell
npm run book:produce
```

命令严格依次执行：

1. 验证脚本批准哈希。
2. 验证刘飞男声和语速 `-10`。
3. 验证分镜与封面素材完整。
4. 生成或复用与批准脚本匹配的 WAV 主音频。
5. 按真实音频生成画面时间轴。
6. 执行工程验收。
7. 渲染有声视频和三种封面。
8. 验证四个正式交付文件。

正式输出固定为：

```text
output/final.mp4
output/cover-9x16.png
output/cover-3x4.png
output/cover-4x3.png
```

### 6. 剪映和抖音

将 `final.mp4` 导入剪映，一键识别字幕并调整字幕样式。导出后，在抖音网页版分别上传 3:4 竖封面和 4:3 横封面；9:16 封面作为母版和手机端备用。

## 书籍管理命令

```powershell
npm run book:list
npm run book:status
npm run book:use -- "book-001-长安的荔枝"
```

- `book:list`：列出全部书籍，`*` 表示当前书。
- `book:status`：显示当前书、状态、目录和固定配音。
- `book:use`：切换当前书，不移动或覆盖任何文件。

## 分步制作命令

```powershell
npm run book:approval-check
npm run book:voice
npm run book:prepare
npm run book:check
npm run book:covers
npm run book:render
npm run book:studio
```

正常情况下优先使用 `book:produce`。脚本发生变化并重新批准后，`book:voice` 会发现哈希不一致并自动重新生成口播；画面修改但脚本未变时会直接复用原音频。

`book:preflight` 是 `book:produce` 内部自动执行的诊断命令，日常流程不需要手动运行；仅在排查素材缺失时单独使用。

## 当前第一本书

《长安的荔枝》已迁移到 [books/book-001-长安的荔枝](E:/code/ai_media/books/book-001-长安的荔枝)。正式交付在该目录的 `output` 中，原始成片和封面只迁移、未重新编码。

## Git 与媒体文件

- 每本书的 `public` 必须纳入版本管理，包括分镜插画、封面插画和内部 WAV 主音频。
- 每本书 `output` 中的 `final.mp4` 和三种正式封面必须纳入版本管理，作为可发布的最终档案。
- 视频、音频和位图通过 Git LFS 追踪，避免大二进制文件直接写入普通 Git 历史。
- `output/preview.mp4`、`.runtime`、临时配音片段、依赖、日志和本机密钥继续忽略。
- 当前目录尚未初始化 Git；首次建库后应先确认 `git lfs install` 正常，再执行首次提交。

## 内容与版权边界

- 用户提供的原文只用于本地分析，不复制到正式交付。
- 成片属于评论性二次创作，不是有声书或逐章复述。
- 不使用原书封面、书页截图、影视剧照或演员形象。
- 小说情节、史实和解读判断必须明确区分。
