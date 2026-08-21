import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAutoPrompt,
  buildCodexArgs,
  parseAutoArgs,
} from './book-auto.mjs';

test('parses a new-book auto command', () => {
  const options = parseAutoArgs([
    '--title',
    '活着',
    '--author',
    '余华',
    '--audience=泛读书用户',
    '--model',
    'gpt-test',
  ]);
  assert.equal(options.title, '活着');
  assert.equal(options.author, '余华');
  assert.equal(options.audience, '泛读书用户');
  assert.equal(options.model, 'gpt-test');
  assert.equal(options.sandbox, 'workspace-write');
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
