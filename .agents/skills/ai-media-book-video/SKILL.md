---
name: ai-media-book-video
description: Create or resume an ai_media book-to-video project from a bound local original through script gates, original images, TTS, Remotion rendering, covers, publish copy, and delivery verification. Use for book:auto runs and staged book production in this repository; do not use for web research or external publishing.
---

# AI media book video

Produce the active book with the repository's existing npm commands and content contracts. Read `docs/workflow.md` and `docs/acceptance.md` before changing book content; inspect only the active book unless the user names another one.

## Choose the mode

- End-to-end auto: the prompt states that the user invoked `npm run book:auto`. Treat that as authorization for reading the bound project-local original, project-local edits, built-in image generation, configured TTS, rendering, and verification for that book. It does not authorize web research. Do not ask for the former manual approval phrase.
- Staged work: obey the boundary stated by the user. Script-only work may edit only `content/script.json`, `content/source-map.json`, and `content/publish.json`; do not generate cost-bearing assets until authorized.
- Resume: preserve valid files and hashes, inspect the current failure, and continue from the earliest failed gate instead of regenerating everything.

Never call `npm run book:auto` from inside this skill. It is the outer orchestrator.

## Required workflow

1. Confirm the active book with `npm run book:status`. Read its `book.json` and current content before editing.
2. Read only the UTF-8 `.txt` or `.md` bound in `content/source-map.json`. Verify that its path remains under the repository `source/` directory and that its SHA-256 matches. Do not search the web or use reviews, summaries, interviews, or model memory as evidence for the book. If the file is missing, changed, incomplete, unreadable, or not the named book, stop before drafting.
3. Complete `script.json`, `source-map.json`, and `publish.json` for viewers who have not read the original. For every genre, fill at least one `contentFlow` loop in this order: reality question → concrete scene → source-backed core case or plot → explanation → return to present-day reality → limitations. Adjacent phases may share a segment. In `retentionPlan.segmentBeats`, write a concise `sourceAnchor` for each segment that introduces a new source scene/case, use an empty string for pure analysis, and classify `contentLayers` as source, analogy, commentary, or bridge. At least 60% of segments must be anchored, with no more than two unanchored segments in a row. Keep the scripted introduction to 30–45 seconds, enter the first concrete scene within 45 seconds of scripted content, and naturally distinguish original content, modern analogy, and channel judgment. Do not write the engine-owned “大家好，今天我们讲《书名》。” lead into `script.json`. End the final segment with exactly “这里是陈拾叁，陪你一起读书破万卷。” Apply every semantic self-review in the repository docs.
4. Run `npm run book:quality` and repair failures. Run `npm run book:review`; in authorized auto mode, follow with `npm run book:approve` and `npm run book:approval-check` without another user pause.
5. After approval, complete `visual-plan.json`, `cover.json`, and pronunciation overrides. Select illustrations from semantic key moments rather than a fixed interval or fixed count: map every key source scene/plot, core concept, modern analogy, and limitation in `keyMoments`; give each segment 1–4 shots with relative `weight`. For `book-jacket-v2`, set `cover.bookTitle` to the exact `book.json.title`, remove every “10分钟读书” label, write a finished 6-32 character recommendation line, and generate unlettered original book-jacket artwork with clear type space. The persistent video title contains only the centered exact book title. New projects use the 6.8–8.8 second vertical `book-picker-v2`; it derives the fixed spoken lead and exact title from `book.json`, uses the generated cover art and code typesetting, and hands off to the scripted hook only after the lead. Existing `book-picker-v1` projects remain unchanged. An original-edition cover screenshot is neither required nor allowed. For `portrait-2x2-9x16-v1`, every storyboard prompt and selected asset must use one portrait 9:16 PNG sheet containing a 2x2 grid of four portrait 9:16 panels. Use `$imagegen` for original assets. Generated art must contain no English, letters, numbers, logos, watermarks, Chinese, or pseudo-text. Move selected assets under the active book's `public/assets`, visually inspect semantic coverage and absence of English/pseudo-text, update `assetReview` truthfully, then run `npm run book:storyboards-check` before TTS or rendering.
6. Run `npm run lint`, then `npm run book:produce`. Repair project-local failures without weakening a quality or approval gate. Reuse valid audio and images when hashes still match.
7. Verify `final.mp4`, every cover declared in `book.json.deliverables.covers`, and `publish-copy.txt`. New `book-jacket-v2` books declare only 3:4 and 4:3 covers; never recreate a 9:16 cover for them. Do not claim completion until the production command exits successfully and output verification passes.

## Stop conditions

After three focused repair passes on the same quality failure, or when the bound source, authentication, quota, TTS, image generation, or rendering is unavailable, stop with the exact blocker and retain resumable artifacts. Never search the web for replacement book content or publish to Douyin or another external platform.
