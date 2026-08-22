# Repository Instructions

This repository produces original Chinese book-commentary videos. Start by reading `README.md`, `docs/workflow.md`, and `docs/acceptance.md`, then inspect the active book with `npm run book:status`.

## Invariants

- Preserve the existing npm/Remotion/TTS production engine and make narrow changes around it.
- Work only on the active book unless another book is explicitly named.
- New `book:auto` projects use only the user-provided UTF-8 `.txt` or `.md` under the repository `source/` directory. Do not search the web or use reviews, summaries, interviews, or model memory as book-content evidence.
- Verify the bound source path and SHA-256 before scripting and on resume. If the file is missing, changed, incomplete, unreadable, or not the named book, stop before generating content.
- Default to viewers who have not read the original. For every genre, use the source-led chain: reality question → concrete scene → source-backed core case or plot → explanation → return to present-day reality → limitations. Fiction still needs characters, actions, conflicts, reversals, consequences, and ending. Do not replace source coverage with abstract commentary or long copyrighted passages.
- Keep the introduction within 30–45 seconds and enter the first concrete scene by 45 seconds. Naturally distinguish source content, modern analogy, and channel judgment without turning them into rigid labeled blocks.
- Do not generate storyboards, images, TTS, or video during a script-only stage.
- Running `npm run book:auto` is explicit authorization for this book's end-to-end local-source reading, project-local content creation, built-in image generation, configured TTS, rendering, and verification. It does not authorize web research, external publishing, or unrelated repository changes.
- Never call `npm run book:auto` recursively. Inside an auto run, use the lower-level `book:*` commands.
- Do not weaken SHA-256 approval, retention, source, asset, voice, or delivery checks to make a run pass.
- Keep visible text in standard spelling; use `pronunciationOverrides` only for TTS input.
- Preserve the fixed Liu Fei voice and speech rate unless the repository standard is explicitly changed.
- Keep formal `public` and `output` media; do not delete or overwrite another book's artifacts.
- Do not modify book-001, book-002, book-003, or book-004 while adopting a new channel standard.
- Do not retrofit the `book-jacket-v2` visual standard into book-001 or book-002. New books use a black first-frame canvas, a larger persistent book title, chapter-keyword reading time of at least six seconds, and only declared 3:4 and 4:3 cover deliveries.
- For `book-jacket-v2` covers, the exact book title must be the largest visible text. Generate unlettered original artwork and let Remotion typeset the book title, author, and short recommendation line; do not ask image generation to spell Chinese.
- New books remain vertical 9:16, remove the global “10分钟读书” label from persistent titles and covers, and keep the exact book title centered. End narration with exactly “这里是陈拾叁，陪你一起读书破万卷。”
- Plan images from key source scenes, plots, concepts, analogies, and limitations, not from a fixed interval or fixed count. Every key moment needs a mapped illustration. Generated images must contain no English, letters, numbers, logos, watermarks, Chinese, or pseudo-text; code typesets required Chinese.
- Enable the 6.8–8.8 second vertical `book-picker-v2` intro for new books. The engine speaks exactly “大家好，今天我们讲《书名》。” before the scripted hook, using the real title from `book.json`; never duplicate that sentence in `script.json`. The picker uses original unlettered cover art and code-typeset titles; do not request an original-edition cover screenshot. Existing `book-picker-v1` projects remain unchanged.

## Verification

For workflow or code changes, run `npm run lint`, `npm run test:book-auto`, and the narrowest relevant no-cost checks. Do not trigger image generation, TTS, or a full render merely to test orchestration code.
