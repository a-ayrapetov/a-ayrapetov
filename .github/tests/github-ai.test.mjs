// Runs the script block of .github/workflows/github-ai.yml against fake GitHub and Workers AI replies.
// Usage: node .github/tests/github-ai.test.mjs .github/workflows/github-ai.yml
import { readFileSync } from 'node:fs';

const yml = readFileSync(process.argv[2], 'utf8').split('\n');
const start = yml.findIndex((l) => l.trim() === 'script: |') + 1;
const body = yml.slice(start).filter((l) => l.startsWith('            ') || l.trim() === '').map((l) => l.slice(12)).join('\n');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const run = new AsyncFunction('github', 'context', 'process', 'fetch', body);

const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn) => realSetTimeout(fn, 0); // no real backoff waits in tests

const reply = (status, obj, headers = {}) => ({
  status, ok: status < 400,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)),
  json: async () => (typeof obj === 'string' ? JSON.parse(obj) : obj),
});
const ok = (result) => reply(200, { success: true, errors: [], result });
const chat = (content, finish = 'stop') => ok({ choices: [{ message: { content }, finish_reason: finish }], usage: { completion_tokens: 10 } });
const review = (findings, summary = 'Summary line.') => chat(JSON.stringify({ summary, findings }));
const finding = (severity, quote, issue = `issue for ${quote}`) => ({ severity, file: 'tools/a.ps1', line: 3, quote, issue, fix: 'do the fix' });

const FILES = {
  'tools/a.ps1': '$path = "repos/x"\n$sha = (gh api $path).sha\ngh api -X PUT $path -f sha=$sha\nWrite-Host "VERIFY: done"\n',
  'big.bin': null, // served as oversized
};
const DIFF = 'diff --git a/tools/a.ps1 b/tools/a.ps1\n+++ b/tools/a.ps1\n@@ -3 +3 @@\n+gh api -X PUT $path -f sha=$sha\n';

function harness(fetchSeq, { event = 'pull_request', env, merged = false, existing = [], files = ['tools/a.ps1'] } = {}) {
  const comments = []; const updates = []; const calls = [];
  const github = {
    paginate: async (fn, args) => (await fn(args)).data,
    rest: {
      pulls: {
        get: async (a) => (a.mediaType ? { data: DIFF } : { data: { merged } }),
        listFiles: async () => ({ data: files.map((f) => (typeof f === 'string' ? { filename: f, status: 'modified' } : f)) }),
      },
      repos: {
        getContent: async ({ path }) => {
          if (FILES[path] === null) return { data: { encoding: 'base64', size: 999999, content: '' } };
          if (!(path in FILES)) throw new Error('404');
          return { data: { encoding: 'base64', size: FILES[path].length, content: Buffer.from(FILES[path]).toString('base64') } };
        },
      },
      issues: {
        createComment: async (a) => comments.push(a.body),
        updateComment: async (a) => updates.push(a),
        listComments: async () => ({ data: existing }),
        listLabelsForRepo: async () => ({ data: [{ name: 'bug' }] }),
        addLabels: async () => {},
      },
    },
  };
  const context = { eventName: event, repo: { owner: 'o', repo: 'r' }, payload: {
    pull_request: { number: 1, title: 't', body: 'b', draft: false, head: { sha: 'abcdef1234567' } },
    issue: { number: 2, title: 't', body: 'b' } } };
  const fakeFetch = async (url, opts) => { calls.push(JSON.parse(opts.body)); if (!fetchSeq.length) throw new Error('test case ran out of fake replies'); const next = fetchSeq.shift(); if (next instanceof Error) throw next; return next; };
  return { go: () => run(github, context, { env: env ?? { CF_AI_TOKEN: 'x', CF_ACCOUNT_ID: 'y' } }, fakeFetch), comments, updates, calls };
}

const twelve = Array.from({ length: 12 }, (_, i) => finding(i < 2 ? 'NIT' : i === 11 ? 'BLOCKER' : 'SHOULD', '$sha = (gh api $path).sha', `point ${i}`));
const cases = [
  // reply shapes and transport (carried over from v1)
  ['chat shape posts text', [chat('Looks fine.')], (h) => h.comments[0].includes('Looks fine.')],
  ['response string shape posts', [ok({ response: 'From response.' })], (h) => h.comments[0].includes('From response.')],
  ['output array skips reasoning', [ok({ output: [{ type: 'reasoning', content: [{ text: 'THINK' }] }, { type: 'message', content: [{ type: 'output_text', text: 'Real review.' }] }] })], (h) => h.comments[0].includes('Real review.') && !h.comments[0].includes('THINK')],
  ['empty answer fails', [chat('   ')], null, /no text/],
  ['cut off at max_tokens fails', [chat('half a review', 'length')], null, /cut off/],
  ['responses incomplete fails', [ok({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'message', content: [{ text: 'half' }] }] })], null, /cut off/],
  ['network error retried once', [new TypeError('fetch failed'), chat('After retry.')], (h) => h.comments[0].includes('After retry.')],
  ['network error twice fails clearly', [new TypeError('fetch failed'), new TypeError('fetch failed')], null, /request failed.*fetch failed/],
  ['429 retried once', [reply(429, { success: false, errors: [{ message: 'rate' }] }, { 'retry-after': '1' }), chat('After 429.')], (h) => h.comments[0].includes('After 429.')],
  ['502 HTML shows body', [reply(502, '<html>Bad gateway</html>'), reply(502, '<html>Bad gateway</html>')], null, /HTTP 502.*not JSON.*<html>Bad gateway/],
  ['400 not retried', [reply(400, { success: false, errors: [{ message: 'bad input' }] }), chat('should not be used')], null, /HTTP 400.*bad input/],
  ['max_tokens is sent', [chat('x')], (h) => h.calls[0].max_tokens === 8192],
  ['header names model and commit', [chat('x')], (h) => h.comments[0].startsWith('**Cloudflare AI review** (gpt-oss-120b) for abcdef1')],
  ['missing secrets fail clearly', [chat('x')], null, /CF_AI_TOKEN or CF_ACCOUNT_ID is not set/, { env: {} }],
  ['issue triage still works', [chat('{"labels":["bug","nope"],"summary":"s","next_step":"n","copilot_ready":true}')], (h) => h.comments[0].includes('Ready for Copilot'), null, { event: 'issues' }],
  // v2: full files, quote check, severity, one comment per PR
  ['full file sent with line numbers', [review([])], (h) => h.calls[0].messages[1].content.includes('=== tools/a.ps1 ===\n1| $path = "repos/x"')],
  ['quote found outside the hunk is kept', [review([finding('SHOULD', '$path = "repos/x"', 'kept point')])], (h) => h.comments[0].includes('kept point') && h.comments[0].includes('0 point(s)')],
  ['invented quote is dropped', [review([finding('BLOCKER', '$path is never defined anywhere', 'made up'), finding('NIT', 'Write-Host "VERIFY: done"', 'real nit')])], (h) => !h.comments[0].includes('made up') && h.comments[0].includes('real nit') && h.comments[0].includes('1 point(s)')],
  ['too-short quote is dropped', [review([finding('BLOCKER', '$sha', 'short quote')])], (h) => !h.comments[0].includes('short quote')],
  ['blocker first, at most 10', [review(twelve)], (h) => /1\. \*\*BLOCKER\*\*/.test(h.comments[0]) && h.comments[0].includes('10. ') && !h.comments[0].includes('11. ')],
  ['no findings says so', [review([], 'Clean change.')], (h) => h.comments[0].includes('Clean change.') && h.comments[0].includes('No material findings.')],
  ['non-JSON reply marked unverified', [chat('just prose about the code')], (h) => h.comments[0].includes('nothing below was checked') && h.comments[0].includes('just prose')],
  ['existing review comment is edited', [review([])], (h) => h.comments.length === 0 && h.updates.length === 1 && h.updates[0].comment_id === 77, null, { existing: [{ id: 5, user: { type: 'User' }, body: '<!-- github-ai-review -->' }, { id: 77, user: { type: 'Bot' }, body: 'old <!-- github-ai-review -->' }] }],
  ['merged before review is flagged', [review([])], (h) => h.comments[0].includes('merged before the review finished'), null, { merged: true }],
  ['oversized and removed files skipped', [review([])], (h) => h.comments[0].includes('Not read in full: big.bin') && !h.calls[0].messages[1].content.includes('=== gone.txt'), null, { files: ['tools/a.ps1', 'big.bin', { filename: 'gone.txt', status: 'removed' }] }],
];

let fail = 0;
for (const [name, seq, check, errRe, opts] of cases) {
  const h = harness([...seq], opts);
  let err = null; try { await h.go(); } catch (e) { err = e; }
  const pass = errRe ? (err && errRe.test(err.message) && h.comments.length === 0) : (!err && check(h));
  if (!pass) fail++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${err ? `  [${err.message.slice(0, 120)}]` : ''}`);
}
console.log(`\n${cases.length - fail}/${cases.length} passed`);
process.exit(fail ? 1 : 0);
