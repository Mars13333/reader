---
name: ai-media-book-video
description: Create or resume an ai_media book-to-video project from source research through script gates, original images, TTS, Remotion rendering, covers, publish copy, and delivery verification. Use for book:auto runs and staged book production in this repository; do not use for external publishing.
---

# AI media book video

Produce the active book with the repository's existing npm commands and content contracts. Read `docs/workflow.md` and `docs/acceptance.md` before changing book content; inspect only the active book unless the user names another one.

## Choose the mode

- End-to-end auto: the prompt states that the user invoked `npm run book:auto`. Treat that as authorization for research, project-local edits, built-in image generation, configured TTS, rendering, and verification for that book. Do not ask for the former manual approval phrase.
- Staged work: obey the boundary stated by the user. Script-only work may edit only `content/script.json`, `content/source-map.json`, and `content/publish.json`; do not generate cost-bearing assets until authorized.
- Resume: preserve valid files and hashes, inspect the current failure, and continue from the earliest failed gate instead of regenerating everything.

Never call `npm run book:auto` from inside this skill. It is the outer orchestrator.

## Required workflow

1. Confirm the active book with `npm run book:status`. Read its `book.json` and current content before editing.
2. Use authoritative public sources first. If they cannot reliably support the requested commentary, stop and report what source is missing; never fill gaps with invented claims or an unauthorized copy of the book.
3. Complete `script.json`, `source-map.json`, and `publish.json`. Apply the hook/payoff/loop standard, terminology and pronunciation review, source boundaries, original commentary, and spoken line-by-line self-review defined in the repository docs.
4. Run `npm run book:quality` and repair failures. Run `npm run book:review`; in authorized auto mode, follow with `npm run book:approve` and `npm run book:approval-check` without another user pause.
5. After approval, complete `visual-plan.json`, `cover.json`, and any pronunciation overrides. For `book-jacket-v2`, set `cover.bookTitle` to the exact `book.json.title`, write a finished 6-32 character recommendation line, and generate unlettered original book-jacket artwork with clear type space; Remotion must typeset the Chinese title. For `portrait-2x2-9x16-v1`, every storyboard prompt and selected asset must use one portrait 9:16 PNG sheet containing a 2x2 grid of four portrait 9:16 panels in top-left, top-right, bottom-left, bottom-right order. Never accept a square sheet. Use `$imagegen` built-in mode to create each original storyboard sheet and cover artwork. Move every selected project asset into the exact path referenced under the active book's `public/assets`; do not leave it only under the Codex generated-images directory. Run `npm run book:storyboards-check` immediately after the storyboard assets are saved; repair or regenerate any rejected sheet before TTS or rendering.
6. Run `npm run lint`, then `npm run book:produce`. Repair project-local failures without weakening a quality or approval gate. Reuse valid audio and images when hashes still match.
7. Verify `final.mp4`, every cover declared in `book.json.deliverables.covers`, and `publish-copy.txt`. New `book-jacket-v2` books declare only 3:4 and 4:3 covers; never recreate a 9:16 cover for them. Do not claim completion until the production command exits successfully and output verification passes.

## Stop conditions

After three focused repair passes on the same quality failure, or when source access, authentication, quota, TTS, image generation, or rendering is unavailable, stop with the exact blocker and retain resumable artifacts. Never publish to Douyin or another external platform.
