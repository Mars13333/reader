# Repository Instructions

This repository produces original Chinese book-commentary videos. Start by reading `README.md`, `docs/workflow.md`, and `docs/acceptance.md`, then inspect the active book with `npm run book:status`.

## Invariants

- Preserve the existing npm/Remotion/TTS production engine and make narrow changes around it.
- Work only on the active book unless another book is explicitly named.
- Treat public research as evidence, not full-book access. Do not invent claims, reproduce long copyrighted passages, or imply chapter-complete coverage without lawful source material.
- Do not generate storyboards, images, TTS, or video during a script-only stage.
- Running `npm run book:auto` is explicit authorization for this book's end-to-end research, project-local content creation, built-in image generation, configured TTS, rendering, and verification. It does not authorize external publishing or unrelated repository changes.
- Never call `npm run book:auto` recursively. Inside an auto run, use the lower-level `book:*` commands.
- Do not weaken SHA-256 approval, retention, source, asset, voice, or delivery checks to make a run pass.
- Keep visible text in standard spelling; use `pronunciationOverrides` only for TTS input.
- Preserve the fixed Liu Fei voice and speech rate unless the repository standard is explicitly changed.
- Keep formal `public` and `output` media; do not delete or overwrite another book's artifacts.
- Do not retrofit the `book-jacket-v2` visual standard into book-001 or book-002. New books use a black first-frame canvas, a larger persistent book title, chapter-keyword reading time of at least six seconds, and only declared 3:4 and 4:3 cover deliveries.
- For `book-jacket-v2` covers, the exact book title must be the largest visible text. Generate unlettered original artwork and let Remotion typeset the book title, author, and short recommendation line; do not ask image generation to spell Chinese.

## Verification

For workflow or code changes, run `npm run lint`, `npm run test:book-auto`, and the narrowest relevant no-cost checks. Do not trigger image generation, TTS, or a full render merely to test orchestration code.
