// Runs the script block of a github-ai workflow file against fake GitHub and Workers AI replies. Nothing leaves the machine.
// Usage: node .github/tests/github-ai.test.mjs .github/workflows/github-ai.yml
import { readFileSync } from 'node:fs';

// The script block is found by its own indentation (not a fixed 12 spaces); an empty extract fails loudly.
const yml = readFileSync(process.argv[2], 'utf8').split('\n');
const at = yml.findIndex((l) => l.trim() === 'script: |');
const first = yml.slice(at + 1).find((l) => l.trim());
const pad = first ? first.length - first.trimStart().length : 0;
const block = [];
for (const l of yml.slice(at + 1)) { if (l.trim() && l.length - l.trimStart().length < pad) break; block.push(l.slice(pad)); }
const body = block.join('\n');
if (at < 0 || !body.includes('const MODEL')) { console.log(`FAIL  no script block found in ${process.argv[2]}`); process.exit(1); }
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const run = new AsyncFunction('github', 'context', 'core', 'process', 'fetch', body);

// Backoff waits and request timeouts are recorded, so their values are tested. Both are restored at the end.
const realSetTimeout = globalThis.setTimeout; const realAbortTimeout = AbortSignal.timeout;
let delays = []; let timeouts = [];
globalThis.setTimeout = (fn, ms = 0, ...args) => { delays.push(ms); return realSetTimeout(fn, 0, ...args); };
AbortSignal.timeout = (ms) => { timeouts.push(ms); return realAbortTimeout.call(AbortSignal, ms); };

// Same shape as fetch's Response and the Cloudflare API envelope (success, errors, messages, result).
const reply = (status, obj, headers = {}) => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)),
});
const stalled = () => ({ status: 200, ok: true, headers: { get: () => null }, text: async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); } });
const ok = (result) => reply(200, { success: true, errors: [], messages: [], result });
const chat = (content, finish = 'stop') => ok({ choices: [{ message: { content }, finish_reason: finish }], usage: { completion_tokens: 10 } });

// A pull request touching three files: app.js (read in full), ci.yml (new, read in full), lib/big.js (too big to read in full).
const FILES = {
  'app.js': 'const a = 1;\nconst token = process.env.TOKEN;\nconsole.log(`token is ${token}`);\nconst n = a - 1;\nreturn n;\nfunction helper() { return 42; }\n',
  'ci.yml': 'steps:\n- run: npm test\n',
  'lib/big.js': null, // served as oversized
};
const DIFF = [
  'diff --git a/app.js b/app.js', 'index 1..2 100644', '--- a/app.js', '+++ b/app.js', '@@ -1,3 +1,5 @@',
  ' const a = 1;', '-const token = env.TOKEN;', '+const token = process.env.TOKEN;', '+console.log(`token is ${token}`);', '+const n = a - 1;', '+return n;',
  'diff --git a/ci.yml b/ci.yml', '--- /dev/null', '+++ b/ci.yml', '@@ -0,0 +1,2 @@', '+steps:', '+- run: npm test',
  'diff --git a/lib/big.js b/lib/big.js', '--- a/lib/big.js', '+++ b/lib/big.js', '@@ -10,1 +10,2 @@', ' const keep = 1;', '+const big = loadEverything();', ''].join('\n');
const LOG = 'console.log(`token is ${token}`);';
const DASH = 'const n = a ' + String.fromCharCode(0x2011) + ' 1;'; // non-breaking hyphen, as models sometimes copy a minus
const F = (severity, quote, issue = 'p', file = 'app.js') => ({ severity, file, line: 3, quote, issue, fix: 'f' });
const review = (...findings) => chat(JSON.stringify({ findings }));
const MARK = '<!-- github-ai-review -->';
const BOT = { login: 'github-actions[bot]', type: 'Bot' };

function harness(fetchSeq, { event = 'pull_request', env, comments = [], diff = DIFF, merged = false, files = ['app.js', 'ci.yml', 'lib/big.js'] } = {}) {
  const posted = []; const edited = []; const calls = []; const logs = []; const labels = [];
  const github = {
    paginate: async (fn, args) => (await fn(args)).data,
    rest: {
      pulls: {
        get: async (a) => (a.mediaType ? { data: diff } : { data: { merged } }),
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
        listComments: async (a) => ({ data: comments.filter((c) => (c.issue ?? 1) === a.issue_number) }),
        createComment: async (a) => posted.push(a),
        updateComment: async (a) => edited.push(a),
        listLabelsForRepo: async () => ({ data: [{ name: 'bug' }] }),
        addLabels: async (a) => labels.push(...a.labels),
      } } };
  const context = { eventName: event, repo: { owner: 'o', repo: 'r' }, serverUrl: 'https://github.com', runId: 7, payload: {
    pull_request: { number: 1, title: 't', body: 'b', draft: false, head: { sha: 'abcdef1234567' } },
    issue: { number: 2, title: 't', body: 'b' } } };
  const core = { info: (m) => logs.push(String(m)) };
  const fakeFetch = async (url, opts) => {
    calls.push({ url, body: typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body, signal: opts.signal });
    if (!fetchSeq.length) throw new Error('test case ran out of fake replies');
    const next = fetchSeq.shift(); if (next instanceof Error) throw next; return next;
  };
  const proc = { env: env ?? { CF_AI_TOKEN: 'x', CF_ACCOUNT_ID: 'y' } };
  return { go: () => run(github, context, core, proc, fakeFetch), posted, edited, calls, logs, labels };
}

const pr = (h) => (h.posted.length === 1 && h.posted[0].issue_number === 1 ? h.posted[0].body : '');
const shown = (b, issue) => b.includes(`\`: ${issue}\n`);
const bad = (status, msg) => reply(status, { success: false, errors: [{ code: 1, message: msg }] });
const cases = [
  // reply shapes
  { name: 'chat shape, no findings: one-line all clear', seq: [review()], check: (h) => pr(h).includes('No material findings.') },
  { name: 'response string shape is read', seq: [ok({ response: '{"findings":[]}' })], check: (h) => pr(h).includes('No material findings.') },
  { name: 'output array: reasoning never posted', seq: [ok({ output: [{ type: 'reasoning', content: [{ text: 'THINK' }] }, { type: 'message', content: [{ type: 'output_text', text: '{"findings":[]}' }] }] })], check: (h) => pr(h).includes('No material') && !pr(h).includes('THINK') },
  // what the model is given
  { name: 'full files sent with line numbers', seq: [review()], check: (h) => h.calls[0].body.messages[1].content.includes('=== app.js ===\n1| const a = 1;') },
  { name: 'oversized and removed files are not read in full', seq: [review()], opts: { files: ['app.js', 'lib/big.js', { filename: 'gone.txt', status: 'removed' }] }, check: (h) => pr(h).includes('Not read in full: lib/big.js') && !h.calls[0].body.messages[1].content.includes('=== gone.txt') },
  { name: 'long diff: model is told it was cut', seq: [review()], opts: { diff: DIFF + 'x'.repeat(50000) }, check: (h) => h.calls[0].body.messages[1].content.includes('first 40000 of') },
  // proof: only BLOCKER and SHOULD points whose quote is in the named file reach the comment
  { name: 'BLOCKER quoting an added line is shown with its quote', seq: [review(F('BLOCKER', LOG, 'prints the token'))], check: (h) => pr(h).includes('1. **BLOCKER** `app.js:3`: prints the token\n   `` console.log(`token is ${token}`); ``\n   Fix: f') },
  { name: 'quote outside the hunk, in the full file, is kept', seq: [review(F('SHOULD', 'function helper() { return 42; }', 'outside'))], check: (h) => shown(pr(h), 'outside') },
  { name: 'quote with + marker, extra spaces, unicode dash matches', seq: [review(F('SHOULD', '+const  token = process.env.TOKEN;', 'm1'), F('SHOULD', DASH, 'm2'))], check: (h) => shown(pr(h), 'm1') && shown(pr(h), 'm2') },
  { name: 'multi-line quote whose 2nd line starts with - matches', seq: [review(F('SHOULD', 'steps:\n- run: npm test', 'yaml', 'ci.yml'))], check: (h) => shown(pr(h), 'yaml') },
  { name: 'short exact line matches', seq: [review(F('SHOULD', 'return n;', 'short'))], check: (h) => shown(pr(h), 'short') },
  { name: 'critical, high, blocker count as BLOCKER; medium as SHOULD', seq: [review(F('Critical ', LOG, 'c1'), F('high', LOG, 'c2'), F('medium', LOG, 'c3'))], check: (h) => pr(h).includes('**BLOCKER** `app.js:3`: c1') && pr(h).includes('**BLOCKER** `app.js:3`: c2') && pr(h).includes('**SHOULD** `app.js:3`: c3') },
  { name: 'NITs are hidden and counted', seq: [review(F('NIT', LOG, 'nit'))], check: (h) => !pr(h).includes(': nit') && pr(h).includes('No material findings.') && pr(h).includes('hidden: 1 NIT') },
  { name: 'unknown severity counts as NIT', seq: [review(F('toString', LOG, 'weird'))], check: (h) => !pr(h).includes('weird') && pr(h).includes('hidden: 1 NIT') },
  { name: 'invented quote is hidden and counted', seq: [review(F('BLOCKER', 'eval(req.query.code)', 'made up'))], check: (h) => !pr(h).includes('made up') && pr(h).includes('1 whose quote is not in the code') },
  { name: 'generic short quote proves nothing', seq: [review(F('BLOCKER', 'return', 'sql injection'))], check: (h) => !pr(h).includes('sql injection') },
  { name: 'real quote but wrong file is hidden', seq: [review(F('BLOCKER', LOG, 'wrong file', 'src/auth/never-touched.ts'))], check: (h) => !pr(h).includes('wrong file') },
  { name: 'quote from a removed line is hidden', seq: [review(F('BLOCKER', 'const token = env.TOKEN;', 'removed'))], check: (h) => !pr(h).includes('removed') },
  { name: 'quote of a diff header is hidden', seq: [review(F('BLOCKER', 'diff --git a/app.js b/app.js', 'hdr'))], check: (h) => !pr(h).includes(': hdr') },
  { name: 'file not read in full: only its added lines count', seq: [review(F('SHOULD', 'const big = loadEverything();', 'added', 'lib/big.js'), F('SHOULD', 'const keep = 1;', 'context', 'lib/big.js'))], check: (h) => shown(pr(h), 'added') && !pr(h).includes(': context') },
  { name: 'file named with a/ or ./ prefix still matches', seq: [review(F('BLOCKER', LOG, 'pfx1', 'b/app.js'), F('BLOCKER', LOG, 'pfx2', './app.js'))], check: (h) => shown(pr(h), 'pfx1') && shown(pr(h), 'pfx2') },
  { name: 'BLOCKER before SHOULD, 10 shown, the rest counted', seq: [review(...Array.from({ length: 12 }, (_, i) => F('SHOULD', LOG, `m${i}`)), F('BLOCKER', LOG, 'B'))], check: (h) => { const b = pr(h); return b.includes('\n1. **BLOCKER**') && b.includes('\n10. **SHOULD**') && !b.includes('\n11. ') && b.includes('3 over the limit of 10'); } },
  { name: 'model text cannot @mention, embed images or HTML', seq: [review(F('BLOCKER', LOG, '@octocat see ![x](https://e.vil/p.png) <img src=x>'))], check: (h) => { const b = pr(h); return b.includes('BLOCKER') && !/@octocat/.test(b) && !b.includes('![') && !b.includes('<img'); } },
  { name: 'no free-text summary reaches the comment', seq: [chat(JSON.stringify({ summary: 'UNCHECKED CLAIM', findings: [] }))], check: (h) => pr(h) && !pr(h).includes('UNCHECKED CLAIM') },
  { name: 'reply that is not JSON fails, nothing posted, reply logged', seq: [chat('Looks fine to me.')], errRe: /review: the reply was not the expected JSON/, after: (h) => h.logs.some((l) => l.includes('Looks fine to me.')) },
  { name: 'JSON without a findings list fails, nothing posted', seq: [chat('{"summary":"ok"}')], errRe: /no findings list/ },
  // one comment per pull request, edited in place
  { name: 'own earlier review comment is edited, not reposted', seq: [review()], opts: { comments: [{ id: 55, user: BOT, body: `old\n${MARK}` }] }, check: (h) => h.posted.length === 0 && h.edited.length === 1 && h.edited[0].comment_id === 55 && h.edited[0].body.includes('No material') },
  { name: 'comment from the earlier marker is edited too', seq: [review()], opts: { comments: [{ id: 58, user: BOT, body: '<!-- cloudflare-ai-review -->\nold' }] }, check: (h) => h.posted.length === 0 && h.edited[0]?.comment_id === 58 },
  { name: 'a person\'s comment holding the marker is never edited', seq: [review()], opts: { comments: [{ id: 56, user: { login: 'someone', type: 'User' }, body: MARK }] }, check: (h) => pr(h) && h.edited.length === 0 },
  { name: 'another bot\'s comment holding the marker is never edited', seq: [review()], opts: { comments: [{ id: 57, user: { login: 'other[bot]', type: 'Bot' }, body: MARK }] }, check: (h) => pr(h) && h.edited.length === 0 },
  { name: 'header names model and commit, marker present', seq: [review()], check: (h) => pr(h).startsWith(`**Cloudflare AI review** (gpt-oss-120b) for abcdef1\n${MARK}`) },
  { name: 'merged before the review finished is flagged', seq: [review()], opts: { merged: true }, check: (h) => pr(h).includes('merged before the review finished') },
  // failures stop before anything is posted
  { name: 'empty answer fails', seq: [chat('   ')], errRe: /no text/ },
  { name: 'cut off at max_tokens fails', seq: [chat('{"findings":[', 'length')], errRe: /cut off/ },
  { name: 'responses incomplete fails', seq: [ok({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'message', content: [{ text: 'half' }] }] })], errRe: /cut off/ },
  { name: 'success with no result fails clearly', seq: [reply(200, { success: true, errors: [] })], errRe: /no result/ },
  // retries, waits and timeouts
  { name: 'network error: one retry after 5 s', seq: [new TypeError('fetch failed'), review()], check: (h) => pr(h) && delays.join() === '5000' },
  { name: 'network error twice fails clearly', seq: [new TypeError('fetch failed'), new TypeError('fetch failed')], errRe: /request failed.*fetch failed/ },
  { name: 'timeout while reading the body is retried', seq: [stalled(), review()], check: (h) => pr(h) && h.calls.length === 2 && delays.join() === '5000' },
  { name: 'body timeout twice fails clearly', seq: [stalled(), stalled()], errRe: /request failed.*timeout/ },
  { name: 'every request carries a 240 s timeout', seq: [review()], check: (h) => h.calls[0].signal instanceof AbortSignal && timeouts.join() === '240000' },
  { name: '429 waits the Retry-After seconds', seq: [reply(429, { success: false, errors: [{ message: 'rate' }] }, { 'retry-after': '2' }), review()], check: (h) => pr(h) && delays.join() === '2000' },
  { name: 'Retry-After capped at 30 s', seq: [reply(429, { success: false, errors: [] }, { 'retry-after': '120' }), review()], check: () => delays.join() === '30000' },
  { name: 'negative Retry-After waits 1 s', seq: [reply(503, { success: false, errors: [] }, { 'retry-after': '-7' }), review()], check: () => delays.join() === '1000' },
  { name: 'missing or date Retry-After waits 5 s', seq: [reply(502, '<html>x</html>', { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' }), review()], check: () => delays.join() === '5000' },
  { name: '502 HTML twice shows the body', seq: [reply(502, '<html>Bad gateway</html>'), reply(502, '<html>Bad gateway</html>')], errRe: /HTTP 502.*not JSON.*<html>Bad gateway/ },
  { name: '400 not retried', seq: [bad(400, 'bad input'), review()], errRe: /HTTP 400.*bad input/ },
  { name: 'max_tokens 16384 is sent (8192 was cut off live on a 28k-token prompt)', seq: [review()], check: (h) => h.calls[0].body.max_tokens === 16384 },
  // secrets
  { name: 'missing secrets fail clearly', seq: [review()], env: {}, errRe: /CF_AI_TOKEN or CF_ACCOUNT_ID is not set/ },
  { name: 'one secret missing fails clearly', seq: [review()], env: { CF_AI_TOKEN: 'x' }, errRe: /CF_AI_TOKEN or CF_ACCOUNT_ID is not set/ },
  // issue triage
  { name: 'issue triage labels only from the list, on the issue', event: 'issues', seq: [chat('{"labels":["bug","nope"],"summary":"s","next_step":"n","copilot_ready":true}')], check: (h) => h.posted[0].issue_number === 2 && h.posted[0].body.includes('Ready for Copilot') && h.labels.join() === 'bug' },
  { name: 'issue triage that is not JSON fails, nothing posted', event: 'issues', seq: [chat('Sorry, I cannot help with that.')], errRe: /triage: the reply was not the expected JSON/ },
];

let fail = 0;
for (const c of cases) {
  delays = []; timeouts = [];
  const h = harness([...c.seq], { event: c.event, env: c.env, ...c.opts });
  let err = null; try { await h.go(); } catch (e) { err = e; }
  let pass = false;
  try {
    pass = c.errRe
      ? Boolean(err && c.errRe.test(err.message) && h.posted.length === 0 && h.edited.length === 0 && (!c.after || c.after(h)))
      : !err && Boolean(c.check(h));
  } catch (e) { err = err ?? e; }
  if (!pass) fail++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${c.name}${err ? `  [${err.message.slice(0, 120)}]` : ''}`);
}
globalThis.setTimeout = realSetTimeout; AbortSignal.timeout = realAbortTimeout;
console.log(`\n${cases.length - fail}/${cases.length} passed`);
process.exitCode = fail ? 1 : 0;
