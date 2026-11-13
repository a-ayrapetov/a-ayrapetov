// Runs the script block of .github/workflows/github-ai.yml against fake Workers AI replies.
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

function harness(fetchSeq, event = 'pull_request') {
  const comments = []; const calls = [];
  const github = { rest: {
    pulls: { get: async () => ({ data: 'diff --git a/x b/x\n+line' }) },
    issues: {
      createComment: async (a) => comments.push(a.body),
      listLabelsForRepo: async () => ({ data: [{ name: 'bug' }] }),
      addLabels: async () => {},
    } } };
  const context = { eventName: event, repo: { owner: 'o', repo: 'r' }, payload: {
    pull_request: { number: 1, title: 't', body: 'b', draft: false },
    issue: { number: 2, title: 't', body: 'b' } } };
  const fakeFetch = async (url, opts) => { calls.push(JSON.parse(opts.body)); const next = fetchSeq.shift(); if (next instanceof Error) throw next; return next; };
  const env = { env: { CF_AI_TOKEN: 'x', CF_ACCOUNT_ID: 'y' } };
  return { go: () => run(github, context, env, fakeFetch), comments, calls };
}

const cases = [
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
  ['header names model', [chat('x')], (h) => h.comments[0].startsWith('**Cloudflare AI review** (gpt-oss-120b)')],
  ['issue triage still works', [chat('{"labels":["bug","nope"],"summary":"s","next_step":"n","copilot_ready":true}')], (h) => h.comments[0].includes('Ready for Copilot'), null, 'issues'],
];

let fail = 0;
for (const [name, seq, check, errRe, event] of cases) {
  const h = harness([...seq], event);
  let err = null; try { await h.go(); } catch (e) { err = e; }
  const pass = errRe ? (err && errRe.test(err.message) && h.comments.length === 0) : (!err && check(h));
  if (!pass) fail++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${err ? `  [${err.message.slice(0, 120)}]` : ''}`);
}
console.log(`\n${cases.length - fail}/${cases.length} passed`);
process.exit(fail ? 1 : 0);
