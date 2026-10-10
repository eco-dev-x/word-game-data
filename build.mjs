// Word Game Data: a static GitHub Pages site of open word-game data, generated from thewordfinder.io's word list.
//   node build.mjs                         → pages, data downloads and printable PDFs in this folder
//   BASE_URL=https://<user>.github.io/word-game-data node build.mjs   → also canonical tags, sitemap.xml, robots.txt
// Reads ../site/src/data (ENABLE-based list, public domain) and uses the site's puppeteer-core + Chrome for the PDFs.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SITE = 'https://thewordfinder.io';
const AUTHOR = /author:\s*\{\s*name:\s*'([^']+)'/.exec(readFileSync('../site/src/config/site.ts', 'utf8'))[1]; // one source: site.author
const BASE = process.env.BASE_URL?.replace(/\/$/, '') ?? '';
const REPO = process.env.REPO_URL ?? ''; // e.g. https://github.com/<user>/word-game-data
const DATA = '../site/src/data';
const puppeteer = createRequire(import.meta.url)('../site/node_modules/puppeteer-core');

// ── Data ──────────────────────────────────────────────────────────────────────────────────────────────────
const rows = readFileSync(`${DATA}/words.txt`, 'utf8').split('\n').map((l) => l.split('\t')).filter(([w]) => w);
const clean = rows.filter(([, , f]) => !f).map(([w, b]) => ({ w, b: +b })); // drop words flagged offensive
const split5 = (s) => s.match(/.{5}/g);
const wordle = JSON.parse(readFileSync(`${DATA}/wordle.json`, 'utf8'));
const answers = split5(wordle.answers), allowed = [...new Set([...answers, ...split5(wordle.guesses)])]; // the guess list already contains the answers
const PTS = Object.fromEntries('aeilnorstu:1 dg:2 bcmp:3 fhvwy:4 k:5 jx:8 qz:10'.split(' ').flatMap((g) => { const [ls, v] = g.split(':'); return [...ls].map((l) => [l, +v]); }));
const score = (w) => [...w].reduce((s, c) => s + PTS[c], 0);

// Wordle feedback as a base-3 number (2 = green, 1 = yellow), two passes so repeated letters are scored like the game.
function pattern(guess, answer) {
  const res = [0, 0, 0, 0, 0], left = {};
  for (let i = 0; i < 5; i++) if (guess[i] === answer[i]) res[i] = 2; else left[answer[i]] = (left[answer[i]] ?? 0) + 1;
  for (let i = 0; i < 5; i++) if (res[i] === 0 && left[guess[i]] > 0) { res[i] = 1; left[guess[i]]--; }
  return res.reduce((n, v) => n * 3 + v, 0);
}
// For an opener: expected answers left (Σ size² / N), the largest group, and the share of answers left with ≤ 10 candidates.
function rate(guess) {
  const groups = new Map();
  for (const a of answers) { const p = pattern(guess, a); groups.set(p, (groups.get(p) ?? 0) + 1); }
  let sq = 0, worst = 0, small = 0;
  for (const n of groups.values()) { sq += n * n; worst = Math.max(worst, n); if (n <= 10) small += n; }
  return { word: guess, avg: sq / answers.length, worst, small: small / answers.length, isAnswer: answers.includes(guess) };
}
console.log(`rating ${allowed.length} openers against ${answers.length} answers…`);
const ranked = allowed.map(rate).sort((a, b) => a.avg - b.avg || a.word.localeCompare(b.word));
const byWord = new Map(ranked.map((r) => [r.word, r]));
// Self-check against the published blog table (thewordfinder.io/blog/best-wordle-starting-words/).
for (const [w, avg] of [['raise', 37.8], ['crane', 48.3], ['adieu', 80.8]]) if (Math.abs(byWord.get(w).avg - avg) > 0.05) throw new Error(`${w}: ${byWord.get(w).avg} ≠ ${avg}`);

const freq = [...'abcdefghijklmnopqrstuvwxyz'].map((l) => ({ l, pos: [0, 1, 2, 3, 4].map((i) => answers.filter((a) => a[i] === l).length), any: answers.filter((a) => a.includes(l)).length }));
const five = clean.filter(({ w }) => w.length === 5).map(({ w }) => w);
const two = clean.filter(({ w }) => w.length === 2).map(({ w }) => w);
const qNoU = clean.filter(({ w }) => /q(?!u)/.test(w)).map(({ w }) => w);
const listen = clean.filter(({ w }) => [...w].sort().join('') === 'eilnst').map(({ w }) => w); // real anagrams of LISTEN in our list
const fmt = (n, d = 1) => n.toFixed(d), pct = (x) => `${(x * 100).toFixed(1)}%`;

// ── Downloads ─────────────────────────────────────────────────────────────────────────────────────────────
mkdirSync('data', { recursive: true });
const csv = (head, list) => [head.join(','), ...list.map((r) => r.join(','))].join('\n') + '\n';
writeFileSync('data/wordle-openers-ranked.csv', csv(['rank', 'word', 'avg_answers_left', 'worst_case', 'share_left_with_10_or_fewer', 'is_possible_answer'],
  ranked.map((r, i) => [i + 1, r.word, fmt(r.avg, 2), r.worst, fmt(r.small, 4), r.isAnswer ? 1 : 0])));
writeFileSync('data/wordle-letter-frequency.csv', csv(['letter', 'pos1', 'pos2', 'pos3', 'pos4', 'pos5', 'answers_containing'], freq.map((f) => [f.l, ...f.pos, f.any])));
writeFileSync('data/five-letter-words.txt', five.join('\n') + '\n');
writeFileSync('data/five-letter-words.csv', csv(['word', 'scrabble_points'], five.map((w) => [w, score(w)])));
writeFileSync('data/two-letter-words.txt', two.join('\n') + '\n');
writeFileSync('data/q-without-u.txt', qNoU.join('\n') + '\n');
writeFileSync('data/answers.txt', answers.join('\n') + '\n'); // loaded by /wordle-solver/
writeFileSync('data/words.txt', clean.map(({ w }) => w).join('\n') + '\n'); // loaded by /word-unscrambler/

// ── Page template ─────────────────────────────────────────────────────────────────────────────────────────
const NAV = [['./', 'Home'], ['wordle-solver/', 'Wordle solver'], ['wordle-word-finder/', 'Wordle word finder'], ['how-to-solve-wordle/', 'Wordle tips'], ['best-second-word-wordle/', 'Second words'], ['word-unscrambler/', 'Unscrambler'], ['wordle-starting-words/', 'Wordle openers'], ['wordle-letter-frequency/', 'Letter frequency'], ['five-letter-words/', '5-letter words'],
  ['two-letter-scrabble-words/', '2-letter words'], ['q-without-u/', 'Q without U'], ['anagram-algorithm/', 'Anagram code'], ['about/', 'About']];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
function page(slug, { title, description, body }) {
  const depth = slug ? '../' : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">${BASE ? `<link rel="canonical" href="${BASE}/${slug}">` : ''}
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="website">
<meta name="color-scheme" content="light"><style>
:root{color-scheme:light;--p:#6d28d9;--t:#171717;--m:#525252;--b:#e5e5e5}*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--t);font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{border-bottom:1px solid var(--b)}header div,main,footer{max-width:820px;margin:auto;padding:0 16px}
header div{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;min-height:56px}header b a{color:var(--t);font-size:18px}
nav a{color:var(--m);font-size:14px;text-decoration:none;margin-right:12px}nav a:hover{color:var(--p)}
main{padding-top:24px;padding-bottom:48px}a{color:var(--p)}h1{font-size:2rem;line-height:1.2;letter-spacing:-.02em;margin:.4em 0}
.lead{font-size:1.15rem;color:var(--m)}table{border-collapse:collapse;width:100%;margin:12px 0;font-size:15px}th,td{border-bottom:1px solid var(--b);padding:7px 10px;text-align:left}
th{background:#f5f3ff}code,pre{font:14px/1.5 ui-monospace,Consolas,monospace}pre{background:#f5f3ff;padding:14px;border-radius:8px;overflow-x:auto}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chips span{padding:3px 9px;border-radius:6px;background:#f5f3ff;color:#4c1d95;font:600 15px ui-monospace,Consolas,monospace}
.dl{display:inline-block;margin:4px 8px 4px 0;padding:8px 14px;border-radius:8px;background:var(--p);color:#fff;text-decoration:none;font-weight:600}
.box{border:1px solid var(--b);border-radius:10px;padding:14px 18px;margin:18px 0;background:#faf8ff}.wrap{overflow-x:auto}
footer{border-top:1px solid var(--b);padding:20px 16px;color:var(--m);font-size:14px}
</style></head><body><header><div><b><a href="${depth}./" style="text-decoration:none">Word Game Data</a></b>
<nav>${NAV.map(([h, l]) => `<a href="${depth}${h}">${l}</a>`).join('')}</nav></div></header>
<main>${body}</main><footer>Open data by <a href="${SITE}/">thewordfinder.io</a>, a free word finder and word-game site. Word lists from ENABLE (public domain); code under the MIT licence.${REPO ? ` <a href="${REPO}">Source on GitHub</a>.` : ''}</footer></body></html>`;
}
const write = (slug, p) => { mkdirSync(slug || '.', { recursive: true }); writeFileSync(`${slug || '.'}/index.html`, page(slug, p)); };
const table = (head, list) => `<div class="wrap"><table><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${list.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table></div>`;
const top20 = ranked.slice(0, 20), topAnswers = ranked.filter((r) => r.isAnswer).slice(0, 10);
const famous = ['raise', 'irate', 'arise', 'stare', 'crate', 'trace', 'slate', 'crane', 'least', 'adieu', 'audio'].map((w) => byWord.get(w));

// ── Pages ─────────────────────────────────────────────────────────────────────────────────────────────────
write('', { title: 'Word Game Data: Open Word Lists for Wordle & Scrabble',
  description: 'Free, open word-game data: every Wordle opener ranked, Wordle letter frequency by position, 5-letter word lists, two-letter Scrabble words and Q without U, as CSV and text.',
  body: `<h1>Word Game Data</h1><p class="lead">Open, downloadable data for Wordle, Scrabble and other word games: rankings, frequencies and word lists you can check, reuse and build on.</p>
<ul><li><a href="wordle-solver/">Wordle solver and helper</a>: enter your guesses and colours, see every answer that still fits.</li>
<li><a href="wordle-word-finder/">Wordle word finder</a>: find 5-letter words from your greens, yellows and greys.</li>
<li><a href="how-to-solve-wordle/">How to solve Wordle</a>: 7 tips backed by data.</li>
<li><a href="best-second-word-wordle/">Best second word in Wordle</a> after RAISE or CRANE.</li>
<li><a href="word-unscrambler/">Word unscrambler</a>: unscramble any letters, blanks allowed.</li>
<li><a href="wordle-starting-words/">Every Wordle opener ranked</a>: ${allowed.length.toLocaleString('en-US')} allowed guesses scored against ${answers.length.toLocaleString('en-US')} answers.</li>
<li><a href="wordle-letter-frequency/">Wordle letter frequency by position</a>: which letters sit where in the answer list.</li>
<li><a href="five-letter-words/">5-letter words</a>: ${five.length.toLocaleString('en-US')} words as text and CSV with Scrabble points.</li>
<li><a href="two-letter-scrabble-words/">Two-letter Scrabble words</a>: all ${two.length}, with a printable cheat sheet.</li>
<li><a href="q-without-u/">Q without U</a>: all ${qNoU.length} words, printable.</li>
<li><a href="anagram-algorithm/">How to build an anagram solver</a>: the sorted-key method with JavaScript and Python code.</li></ul>
<div class="box">The data comes from the word list behind <a href="${SITE}/">thewordfinder.io</a>, built on ENABLE (public domain) with offensive words removed. Use it freely; a link back is appreciated.</div>` });

write('wordle-starting-words/', { title: 'Best Wordle Starting Words, Ranked: Open Data',
  description: `Every allowed Wordle opener ranked by how many answers are left after one guess, tested against ${answers.length.toLocaleString('en-US')} answers. Full CSV and reproducible method.`,
  body: `<h1>Every Wordle starting word, ranked</h1><p class="lead">We scored all ${allowed.length.toLocaleString('en-US')} allowed guesses against ${answers.length.toLocaleString('en-US')} everyday answers. For each opener: how many answers are still possible after seeing its colours, averaged over every answer. Lower is better.</p>
<a class="dl" href="../data/wordle-openers-ranked.csv" download>Download the full ranking (CSV)</a>
<h2>The 20 best openers</h2>${table(['#', 'Opener', 'Answers left (avg)', 'Worst case', '≤10 left'], top20.map((r, i) => [i + 1, r.word.toUpperCase(), fmt(r.avg), r.worst, pct(r.small)]))}
<p>Some strong openers are allowed guesses that can never be the answer: ${ranked.slice(0, 15).filter((r) => !r.isAnswer).map((r) => r.word.toUpperCase()).join(', ')}. If you'd like a chance of winning on turn one, these are the best openers that can also be the answer:</p>
${table(['Opener', 'Answers left (avg)', 'Worst case'], topAnswers.map((r) => [r.word.toUpperCase(), fmt(r.avg), r.worst]))}
<h2>The popular openers</h2>${table(['Opener', 'Answers left (avg)', 'Worst case', '≤10 left'], famous.map((r) => [r.word.toUpperCase(), fmt(r.avg), r.worst, pct(r.small)]))}
<p>Vowel-heavy openers like ADIEU and AUDIO feel productive but leave far more answers: consonants and their positions do most of the narrowing. A readable write-up with second-guess advice and a worked example is on thewordfinder.io: <a href="${SITE}/blog/best-wordle-starting-words/">best Wordle starting words, measured</a>.</p>
<h2>Method</h2><p>For an opener <i>g</i>, group the ${answers.length.toLocaleString('en-US')} answers by the colour pattern <i>g</i> would show against each. If a group has <i>n</i> answers, every answer in it leaves <i>n</i> candidates, so the average is Σn² / N. "Worst case" is the largest group; "≤10 left" is the share of answers whose group has 10 or fewer. Colours follow the game's rule for repeated letters (greens first, then yellows from the letters left).</p>
<pre>function pattern(guess, answer) {
  const res = [0, 0, 0, 0, 0], left = {};
  for (let i = 0; i &lt; 5; i++)
    if (guess[i] === answer[i]) res[i] = 2;          // green
    else left[answer[i]] = (left[answer[i]] ?? 0) + 1;
  for (let i = 0; i &lt; 5; i++)
    if (res[i] === 0 &amp;&amp; left[guess[i]] &gt; 0) { res[i] = 1; left[guess[i]]--; } // yellow
  return res.join('');
}</pre>` });

const maxCell = Math.max(...freq.flatMap((f) => f.pos));
const cell = (n) => `<td style="background:rgba(109,40,217,${(n / maxCell * 0.55).toFixed(2)});text-align:center">${n}</td>`; // dark text on ≤55% tint: AA in every cell
const topPos = [0, 1, 2, 3, 4].map((i) => [...freq].sort((a, b) => b.pos[i] - a.pos[i]).slice(0, 3).map((f) => f.l.toUpperCase()).join(', '));
write('wordle-letter-frequency/', { title: 'Wordle Letter Frequency by Position (Data + Chart)',
  description: `How often each letter appears in each of the five positions of the ${answers.length.toLocaleString('en-US')} Wordle answers, as a heatmap and CSV. Free open data.`,
  body: `<h1>Wordle letter frequency by position</h1><p class="lead">Counts of each letter in each position across ${answers.length.toLocaleString('en-US')} Wordle answers. Darker means more common.</p>
<a class="dl" href="../data/wordle-letter-frequency.csv" download>Download (CSV)</a>
<div class="box">Most common letters by position: ${topPos.map((t, i) => `<b>${i + 1}</b>: ${t}`).join(' · ')}</div>
<div class="wrap"><table><tr><th>Letter</th><th>1st</th><th>2nd</th><th>3rd</th><th>4th</th><th>5th</th><th>Answers with it</th></tr>
${freq.map((f) => `<tr><td><b>${f.l.toUpperCase()}</b></td>${f.pos.map(cell).join('')}<td>${f.any}</td></tr>`).join('')}</table></div>
<p>Why it matters: a good guess tests common letters in the positions they usually take. To apply it to a live game, enter your greens and yellows in a <a href="${SITE}/wordle-solver/">Wordle solver</a> and pick from the words that still fit.</p>` });

const byFirst = [...'abcdefghijklmnopqrstuvwxyz'].map((l) => [l.toUpperCase(), five.filter((w) => w[0] === l).length]);
write('five-letter-words/', { title: '5 Letter Words List: Free Plain-Text Download',
  description: `All ${five.length.toLocaleString('en-US')} five-letter words from the ENABLE word list as plain text and CSV with Scrabble points. Free download for Wordle, Scrabble and coding.`,
  body: `<h1>5-letter words: free download</h1><p class="lead">All ${five.length.toLocaleString('en-US')} five-letter words in our list, one per line, plus a CSV with Scrabble points.</p>
<a class="dl" href="../data/five-letter-words.txt" download>five-letter-words.txt</a><a class="dl" href="../data/five-letter-words.csv" download>five-letter-words.csv</a>
<h2>How many start with each letter</h2>${table(['First letter', 'Words'], byFirst)}
<p>Browsing rather than downloading? thewordfinder.io lists <a href="${SITE}/5-letter-words/">5-letter words</a> with the most common ones first.</p>` });

const hi = two.filter((w) => score(w) >= 5).sort((a, b) => score(b) - score(a));
const twoBody = `<div class="chips">${two.map((w) => `<span>${w.toUpperCase()}</span>`).join('')}</div>`;
write('two-letter-scrabble-words/', { title: 'Two Letter Scrabble Words: Printable Cheat Sheet',
  description: `All ${two.length} two-letter words in the ENABLE list, the high scorers marked, as a one-page printable PDF and plain text. Free Scrabble cheat sheet.`,
  body: `<h1>Two-letter Scrabble words</h1><p class="lead">All ${two.length} two-letter words in our ENABLE-based list. They let you play alongside another word and dump awkward tiles.</p>
<a class="dl" href="../data/two-letter-words.pdf" download>Printable cheat sheet (PDF)</a><a class="dl" href="../data/two-letter-words.txt" download>Plain text</a>
<h2>The high scorers (5+ points)</h2>${table(['Word', 'Points'], hi.map((w) => [w.toUpperCase(), score(w)]))}
<h2>All ${two.length}</h2>${twoBody}
<p>ENABLE differs slightly from the official tournament lists (NWL, Collins), so check a disputed word against your game's dictionary. Tactics for using them, grouped by the tile you're stuck with: <a href="${SITE}/blog/two-letter-scrabble-words/">two-letter Scrabble words and how to use them</a>.</p>` });

const qBody = `<div class="chips">${qNoU.map((w) => `<span>${w.toUpperCase()}</span>`).join('')}</div>`;
write('q-without-u/', { title: 'Q Words Without U: Printable List for Scrabble',
  description: `All ${qNoU.length} words in the ENABLE list that have a Q not followed by a U, from QI and QAT to TRANQ, as a printable PDF and plain text.`,
  body: `<h1>Q words without U</h1><p class="lead">Stuck with a Q and no U? These ${qNoU.length} words have a Q that isn't followed by a U.</p>
<a class="dl" href="../data/q-without-u.pdf" download>Printable list (PDF)</a><a class="dl" href="../data/q-without-u.txt" download>Plain text</a>
${qBody}<p>The two worth memorising first are QI and QAT. More context and the most useful ones: <a href="${SITE}/q-without-u/">Q without U on thewordfinder.io</a>.</p>` });

write('anagram-algorithm/', { title: 'How to Build an Anagram Solver: Sorted-Key Code',
  description: 'Build a fast anagram solver: sort each word\'s letters into a key and look anagrams up in a map. Explanation with JavaScript and Python code and the maths on brute force.',
  body: `<h1>How to build an anagram solver</h1><p class="lead">The trick: sort a word's letters and every anagram gets the same key. LISTEN, SILENT and TINSEL all become <code>eilnst</code>. Build a map from key to words once, and each lookup is instant.</p>
<h2>Why not try every arrangement?</h2><p>A 10-letter word has 10! = 3,628,800 arrangements, and most of them aren't words. Sorting the letters costs a few microseconds and turns the search into one dictionary lookup.</p>
<h2>JavaScript</h2><pre>const key = (w) => [...w.toLowerCase()].sort().join('');
const index = new Map();
for (const w of words) {                      // words: your word list
  const k = key(w);
  index.set(k, [...(index.get(k) ?? []), w]);
}
const anagrams = (w) => index.get(key(w)) ?? [];
anagrams('listen');  // ${JSON.stringify(listen).replace(/"/g, "'").replace(/,/g, ', ')}</pre>
<h2>Python</h2><pre>from collections import defaultdict
index = defaultdict(list)
for w in words:
    index[''.join(sorted(w))].append(w)
anagrams = lambda w: index[''.join(sorted(w.lower()))]</pre>
<h2>Shorter words and blanks</h2><p>To find every word that <i>fits inside</i> a rack (not just exact anagrams), compare letter counts instead: a word fits if it needs no letter more often than the rack has it, and each shortfall can be covered by a blank tile. That's how a rack word finder works; you can try one at <a href="${SITE}/anagram-solver/">thewordfinder.io's anagram solver</a>.</p>
<p>A word list to start with: <a href="../five-letter-words/">5-letter words</a>, or ENABLE itself (public domain).</p>` });


// ── Tool pages (Search Console queries: "wordle solver/helper", "unscramble letters") ────────────────────────
// Client-only JS kept as plain strings (no backticks or dollar-braces inside) so it can live in this file's templates.
const SOLVER_JS = `
var A = null, rows = [];
function pat(g, a) { var r = [0,0,0,0,0], left = {}, i;
  for (i = 0; i < 5; i++) if (g[i] === a[i]) r[i] = 2; else left[a[i]] = (left[a[i]] || 0) + 1;
  for (i = 0; i < 5; i++) if (r[i] === 0 && left[g[i]] > 0) { r[i] = 1; left[g[i]]--; }
  return r.join(''); }
function draw() {
  var box = document.getElementById('rows'); box.innerHTML = '';
  rows.forEach(function (row, ri) { var d = document.createElement('div'); d.className = 'row';
    for (var i = 0; i < 5; i++) (function (i) { var b = document.createElement('button'); b.type = 'button'; b.className = 't s' + row.s[i];
      b.textContent = row.w[i].toUpperCase(); b.setAttribute('aria-label', row.w[i] + ': ' + ['grey', 'yellow', 'green'][row.s[i]] + ', tap to change');
      b.onclick = function () { row.s[i] = (row.s[i] + 1) % 3; draw(); }; d.appendChild(b); })(i);
    var x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = 'Remove'; x.onclick = function () { rows.splice(ri, 1); draw(); }; d.appendChild(x);
    box.appendChild(d); });
  solve(); }
function solve() {
  var out = document.getElementById('out'); if (!A || !rows.length) return;
  var c = A.filter(function (a) { return rows.every(function (r) { return pat(r.w, a) === r.s.join(''); }); });
  var best = '';
  if (c.length > 2 && c.length <= 400) {
    var scored = c.map(function (g) { var n = {}; c.forEach(function (a) { var p = pat(g, a); n[p] = (n[p] || 0) + 1; });
      var s = 0; for (var k in n) s += n[k] * n[k]; return [g, s / c.length]; }).sort(function (x, y) { return x[1] - y[1]; }).slice(0, 5);
    best = '<p><b>Best next guesses</b> (fewest answers left on average): ' + scored.map(function (s) { return s[0].toUpperCase() + ' (' + s[1].toFixed(1) + ')'; }).join(', ') + '</p>'; }
  out.innerHTML = '<p><b>' + c.length + '</b> possible answer' + (c.length === 1 ? '' : 's') + '</p>' + best +
    '<div class="chips">' + c.slice(0, 300).map(function (w) { return '<span>' + w.toUpperCase() + '</span>'; }).join('') + '</div>' + (c.length > 300 ? '<p>…and ' + (c.length - 300) + ' more.</p>' : ''); }
document.getElementById('add').onsubmit = function (e) { e.preventDefault(); var i = document.getElementById('g'), w = i.value.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length !== 5) { i.setCustomValidity('Enter a five-letter word'); i.reportValidity(); return; } i.setCustomValidity('');
  rows.push({ w: w, s: [0,0,0,0,0] }); i.value = ''; draw(); };
document.getElementById('g').oninput = function () { this.setCustomValidity(''); };
fetch('../data/answers.txt').then(function (r) { return r.text(); }).then(function (t) { A = t.trim().split('\\n'); solve(); });
`;
const UNSCRAMBLE_JS = `
var W = null;
function counts(s) { var c = {}; for (var i = 0; i < s.length; i++) c[s[i]] = (c[s[i]] || 0) + 1; return c; }
function fits(w, have, blanks) { var need = counts(w), short = 0; for (var k in need) if (need[k] > (have[k] || 0)) short += need[k] - (have[k] || 0); return short <= blanks; }
function run() {
  var raw = document.getElementById('l').value.toLowerCase().replace(/[^a-z?]/g, '').slice(0, 15), out = document.getElementById('res');
  if (!raw) { out.innerHTML = ''; return; } if (!W) { out.textContent = 'Loading the word list…'; return; }
  var blanks = (raw.match(/[?]/g) || []).length, letters = raw.replace(/[?]/g, ''), have = counts(letters);
  var hit = W.filter(function (w) { return w.length >= 2 && w.length <= raw.length && fits(w, have, blanks); });
  var by = {}; hit.forEach(function (w) { (by[w.length] = by[w.length] || []).push(w); });
  out.innerHTML = '<p><b>' + hit.length + '</b> words from ' + raw.toUpperCase() + '</p>' + Object.keys(by).sort(function (a, b) { return b - a; }).map(function (n) {
    return '<h3>' + n + '-letter words (' + by[n].length + ')</h3><div class="chips">' + by[n].slice(0, 200).map(function (w) { return '<span>' + w.toUpperCase() + '</span>'; }).join('') + '</div>'; }).join(''); }
document.getElementById('u').onsubmit = function (e) { e.preventDefault(); run(); };
fetch('../data/words.txt').then(function (r) { return r.text(); }).then(function (t) { W = t.trim().split('\\n'); run(); });
`;
const TOOL_CSS = `<style>.row{display:flex;gap:6px;align-items:center;margin:6px 0}.t{width:48px;height:48px;border:0;border-radius:6px;font:700 22px system-ui;color:#fff;cursor:pointer}
.s0{background:#6b6b6b}.s1{background:#a16207}.s2{background:#15803d}.x{margin-left:8px;border:1px solid var(--b);background:#fff;border-radius:6px;padding:6px 10px;cursor:pointer}
form.tool{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}form.tool input{flex:1;min-width:200px;height:44px;font-size:18px;padding:0 12px;border:1px solid #d4d4d4;border-radius:8px;text-transform:uppercase}
form.tool button{height:44px;padding:0 18px;border:0;border-radius:8px;background:var(--p);color:#fff;font-weight:600;cursor:pointer}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}</style>`;

write('wordle-solver/', { title: 'Wordle Solver & Helper (Free, Open Source)',
  description: 'Free Wordle solver and helper: type your guesses, tap the tiles to match your colours, and see every answer that still fits plus the best next guess. Open source.',
  body: `${TOOL_CSS}<h1>Wordle solver and helper</h1><p class="lead">Type a guess you played, then tap each tile until it matches your colours (grey, yellow, green). The list shows every answer that still fits, and the best next guesses.</p>
<form class="tool" id="add"><label for="g" class="sr">Your guess</label><input id="g" maxlength="5" autocomplete="off" placeholder="Your guess, e.g. RAISE"><button>Add guess</button></form>
<div id="rows"></div><div id="out" aria-live="polite"><p>Add a guess to start. Not sure what to open with? RAISE is the best common opener in <a href="../wordle-starting-words/">our ranking</a>.</p></div>
<h2>How it works</h2><p>Every one of the ${answers.length.toLocaleString('en-US')} answers is checked against your guesses using the game's colour rules (greens first, then yellows from the letters left). "Best next guess" picks the remaining answer that, on average, leaves the fewest possibilities. Everything runs in your browser; the code is in this page.</p>
<p>Want hints for today's puzzle instead? See <a href="${SITE}/wordle-answer/">today's Wordle hint</a> on thewordfinder.io, or the full <a href="${SITE}/wordle-solver/">Wordle solver</a> there.</p>
<script>${SOLVER_JS}</script>` });

write('word-unscrambler/', { title: 'Word Unscrambler: Unscramble Letters (Open Source)',
  description: `Free word unscrambler: type scrambled letters (use ? for a blank) and get every word you can make, grouped by length. Runs in your browser on a ${clean.length.toLocaleString('en-US')}-word list.`,
  body: `${TOOL_CSS}<h1>Word unscrambler</h1><p class="lead">Type up to 15 scrambled letters (use ? for a blank tile) to see every word they make, longest first.</p>
<form class="tool" id="u"><label for="l" class="sr">Letters</label><input id="l" maxlength="15" autocomplete="off" placeholder="Letters, e.g. TLSINE"><button>Unscramble</button></form>
<div id="res" aria-live="polite"></div>
<h2>How it works</h2><p>A word fits if it needs no letter more often than you have it; each shortfall uses up a blank. It checks all ${clean.length.toLocaleString('en-US')} words in the ENABLE-based list in your browser. The method is explained in <a href="../anagram-algorithm/">how to build an anagram solver</a>.</p>
<p>For Scrabble and Words With Friends points, filters (starts with, ends with) and definitions, use the full <a href="${SITE}/word-unscrambler/">word unscrambler on thewordfinder.io</a>.</p>
<script>${UNSCRAMBLE_JS}</script>` });

// ── Wordle keyword pages (Search Console: "wordle word finder", "find a word wordle", "wordle best words", "wordle solving") ──
// Best fixed second word after an opener: group answers by (opener colours, second-word colours); expected answers left = Σn²/N.
function second(opener) {
  const first = new Map(answers.map((a) => [a, pattern(opener, a)]));
  return allowed.filter((g) => g !== opener).map((g) => {
    const n = new Map();
    for (const a of answers) { const k = first.get(a) * 243 + pattern(g, a); n.set(k, (n.get(k) ?? 0) + 1); }
    let sq = 0, solved = 0; for (const v of n.values()) { sq += v * v; if (v === 1) solved++; }
    return { word: g, avg: sq / answers.length, solved: solved / answers.length };
  }).sort((x, y) => x.avg - y.avg || x.word.localeCompare(y.word));
}
console.log('best second words after RAISE and CRANE…');
const afterRaise = second('raise'), afterCrane = second('crane');
const sec = (list, w) => list.find((r) => r.word === w);
// Self-check against the blog: RAISE then COUNT or DONUT leaves 4.1 answers on average.
for (const w of ['count', 'donut']) if (Math.abs(sec(afterRaise, w).avg - 4.1) > 0.05) throw new Error(`raise→${w}: ${sec(afterRaise, w).avg} ≠ 4.1`);
writeFileSync('data/allowed.txt', allowed.join('\n') + '\n'); // loaded by /wordle-word-finder/

const FINDER_JS = `
var ALL = null, ANS = null;
function run() {
  var out = document.getElementById('wf'); if (!ALL) { out.textContent = 'Loading words…'; return; }
  var pat = document.getElementById('p').value.toLowerCase().replace(/[^a-z?]/g, '');
  var inc = document.getElementById('i').value.toLowerCase().replace(/[^a-z]/g, ''), exc = document.getElementById('x').value.toLowerCase().replace(/[^a-z]/g, '');
  var only = document.getElementById('o').checked;
  while (pat.length < 5) pat += '?';
  var hit = (only ? ANS : ALL).filter(function (w) {
    for (var i = 0; i < 5; i++) if (pat[i] !== '?' && w[i] !== pat[i]) return false;
    for (var j = 0; j < inc.length; j++) if (w.indexOf(inc[j]) < 0) return false;
    for (var k = 0; k < exc.length; k++) if (w.indexOf(exc[k]) >= 0 && pat.indexOf(exc[k]) < 0 && inc.indexOf(exc[k]) < 0) return false;
    return true; });
  out.innerHTML = '<p><b>' + hit.length + '</b> word' + (hit.length === 1 ? '' : 's') + '</p><div class="chips">' + hit.slice(0, 400).map(function (w) { return '<span>' + w.toUpperCase() + '</span>'; }).join('') + '</div>' + (hit.length > 400 ? '<p>…and ' + (hit.length - 400) + ' more. Add letters to narrow it down.</p>' : ''); }
document.getElementById('f').onsubmit = function (e) { e.preventDefault(); run(); };
['p', 'i', 'x', 'o'].forEach(function (id) { document.getElementById(id).oninput = run; });
Promise.all(['../data/allowed.txt', '../data/answers.txt'].map(function (u) { return fetch(u).then(function (r) { return r.text(); }); })).then(function (t) {
  ALL = t[0].trim().split('\\n'); ANS = t[1].trim().split('\\n'); run(); });
`;
const FINDER_CSS = `<style>form.f{display:grid;gap:10px;grid-template-columns:1fr 1fr 1fr;margin:14px 0}form.f label{font-size:14px;color:var(--m);display:grid;gap:4px}
form.f input[type=text]{height:44px;font-size:18px;padding:0 12px;border:1px solid #d4d4d4;border-radius:8px;text-transform:uppercase;letter-spacing:.1em}
form.f .ck{grid-column:1/-1;display:flex;gap:8px;align-items:center}@media(max-width:600px){form.f{grid-template-columns:1fr}}</style>`;

write('wordle-word-finder/', { title: 'Wordle Word Finder: Find 5-Letter Words by Pattern',
  description: `Find a word for Wordle: enter the green letters in place, the yellow letters you know and the grey letters to skip, and see every matching 5-letter word. Free.`,
  body: `${FINDER_CSS}<h1>Wordle word finder</h1><p class="lead">Put your green letters in their places (use ? for unknown), list the yellow letters the word must contain and the grey letters to leave out.</p>
<form class="f" id="f"><label>Pattern (greens)<input type="text" id="p" maxlength="5" placeholder="?A??E" autocomplete="off"></label>
<label>Must contain (yellows)<input type="text" id="i" maxlength="10" placeholder="R" autocomplete="off"></label>
<label>Leave out (greys)<input type="text" id="x" maxlength="26" placeholder="STOU" autocomplete="off"></label>
<label class="ck"><input type="checkbox" id="o" checked> Only common answer words (${answers.length.toLocaleString('en-US')}); untick for all ${allowed.length.toLocaleString('en-US')} allowed guesses</label></form>
<div id="wf" aria-live="polite"></div>
<h2>Tips</h2><ul><li>Yellow letters are in the word but not in that spot. For a stricter filter that also uses yellow positions and repeated letters, use the <a href="../wordle-solver/">Wordle solver</a>, which works from your actual guesses and colours.</li>
<li>Many words left? Pick a guess that tests new common letters rather than one that can't be the answer. The <a href="../best-second-word-wordle/">best second words</a> page shows which.</li></ul>
<p>Prefer a hint for today's puzzle? <a href="${SITE}/wordle-answer/">Today's Wordle hint</a> on thewordfinder.io gives the first letter and vowel count before the answer.</p>
<script>${FINDER_JS}</script>` });

const secTable = (list) => table(['#', 'Second word', 'Answers left (avg)', 'Solved by turn 3'], list.slice(0, 15).map((r, i) => [i + 1, r.word.toUpperCase(), fmt(r.avg), pct(r.solved)]));
write('best-second-word-wordle/', { title: 'Best Second Word in Wordle After RAISE or CRANE',
  description: `The best fixed second guess in Wordle after RAISE or CRANE, ranked from ${allowed.length.toLocaleString('en-US')} words against ${answers.length.toLocaleString('en-US')} answers. Play the pair and about 4 answers are left.`,
  body: `<h1>Best second word in Wordle</h1><p class="lead">If you'd rather not think on turn two, play a fixed second word, whatever colours your opener shows. These pairs leave the fewest answers on average.</p>
<div class="box">After <b>RAISE</b>, the best second word is <b>${afterRaise[0].word.toUpperCase()}</b>: about ${fmt(afterRaise[0].avg)} answers left, and ${pct(afterRaise[0].solved)} of games pinned down to exactly one answer. After <b>CRANE</b>, it's <b>${afterCrane[0].word.toUpperCase()}</b> (${fmt(afterCrane[0].avg)} left).</div>
<h2>After RAISE</h2>${secTable(afterRaise)}<h2>After CRANE</h2>${secTable(afterCrane)}
<p>"Solved by turn 3" is the share of answers the pair narrows to a single word, so your third guess wins. A fixed pair only works in normal mode: hard mode makes you reuse letters your opener revealed.</p>
<p>Which opener first? See <a href="../wordle-starting-words/">every Wordle starting word ranked</a>, or the readable write-up <a href="${SITE}/blog/best-wordle-starting-words/">best Wordle starting words, measured</a> on thewordfinder.io.</p>` });

const vowelsTop = freq.filter((f) => 'aeiou'.includes(f.l)).sort((a, b) => b.any - a.any).map((f) => f.l.toUpperCase());
const lastE = freq.find((f) => f.l === 'e').pos[4], firstS = freq.find((f) => f.l === 's').pos[0];
write('how-to-solve-wordle/', { title: 'How to Solve Wordle: 7 Tips Backed by Data',
  description: `How to solve Wordle in fewer guesses: the best opener, the best second word, where letters usually sit and how to use yellows, all measured on ${answers.length.toLocaleString('en-US')} answers.`,
  body: `<h1>How to solve Wordle: 7 tips backed by data</h1><p class="lead">Every tip below comes from scoring guesses against ${answers.length.toLocaleString('en-US')} everyday five-letter answers, not from gut feeling.</p>
<h2>1. Open with RAISE</h2><p>RAISE leaves ${fmt(byWord.get('raise').avg)} answers on average, the best of all ${allowed.length.toLocaleString('en-US')} allowed guesses. CRANE leaves ${fmt(byWord.get('crane').avg)}; ADIEU leaves ${fmt(byWord.get('adieu').avg)}. <a href="../wordle-starting-words/">Full ranking</a>.</p>
<h2>2. Don't chase vowels</h2><p>Vowel-heavy openers feel productive but narrow the answer least. Consonants and their positions do the work: ${vowelsTop.slice(0, 3).join(', ')} are the most common vowels, but one or two vowels per guess is enough.</p>
<h2>3. Use a fixed second word</h2><p>RAISE then ${afterRaise[0].word.toUpperCase()} leaves about ${fmt(afterRaise[0].avg)} answers whatever RAISE shows. <a href="../best-second-word-wordle/">Best second words</a>.</p>
<h2>4. Think about position</h2><p>E ends ${lastE} of the answers and S starts ${firstS}. Test letters where they usually sit. <a href="../wordle-letter-frequency/">Letter frequency by position</a>.</p>
<h2>5. Move yellows</h2><p>A yellow letter is in the word but not there. Put it somewhere new on your next guess, so it can turn green or rule out another spot.</p>
<h2>6. Watch for repeated letters</h2><p>Words like SPEED or SKILL trip people up. If few answers fit, consider a double letter before burning a guess on a new one.</p>
<h2>7. Narrow it down, then guess</h2><p>When several words fit (the _IGHT trap: FIGHT, LIGHT, MIGHT, NIGHT…), play a word that tests several of those first letters at once rather than guessing them one by one. List what's left with the <a href="../wordle-word-finder/">Wordle word finder</a> or <a href="../wordle-solver/">solver</a>.</p>
<p>Out of guesses for today? Practise with <a href="${SITE}/games/wordle-unlimited/">Wordle Unlimited</a> on thewordfinder.io.</p>` });

write('about/', { title: 'About Word Game Data, by thewordfinder.io',
  description: 'Who makes Word Game Data, where the word lists come from, how they are cleaned, the licence, and how to get in touch.',
  body: `<h1>About</h1><p>Word Game Data is made by ${AUTHOR}, who runs <a href="${SITE}/">thewordfinder.io</a>, a free word finder with daily puzzle hints and browser word games. This project publishes the underlying data openly so anyone can check it or build on it.</p>
<h2>Sources</h2><ul><li>Word lists: ENABLE (public domain), with words flagged as offensive removed.</li><li>Wordle answers and allowed guesses: the everyday-word answer pool used by thewordfinder.io's Wordle Unlimited (${answers.length.toLocaleString('en-US')} answers, ${allowed.length.toLocaleString('en-US')} allowed guesses).</li></ul>
<h2>Licence</h2><p>The word lists are public domain. Code samples are MIT-licensed. A link to this site or to thewordfinder.io is appreciated but not required.</p>
<h2>Contact</h2><p>Corrections and ideas are welcome via <a href="${SITE}/contact/">thewordfinder.io/contact</a>.</p>` });

// ── Printables, README, licence, crawl files ──────────────────────────────────────────────────────────────
const b = await puppeteer.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
const pg = await b.newPage();
for (const [file, title, chips] of [['two-letter-words', `Two-letter Scrabble words (${two.length})`, twoBody], ['q-without-u', `Q words without U (${qNoU.length})`, qBody]]) {
  await pg.setContent(`<style>body{font:15px system-ui,sans-serif;margin:0}h1{font-size:26px;color:#4c1d95}.chips{display:flex;flex-wrap:wrap;gap:6px}.chips span{padding:4px 9px;border-radius:6px;background:#f5f3ff;color:#4c1d95;font:700 16px Consolas,monospace}p{color:#666;font-size:12px;margin-top:24px}</style>
<h1>${title}</h1>${chips}<p>From the ENABLE word list. More word lists and free word games: thewordfinder.io</p>`);
  await pg.pdf({ path: `data/${file}.pdf`, format: 'A4', margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' }, printBackground: true });
}
await b.close();
writeFileSync('.nojekyll', '');
writeFileSync('LICENSE', `MIT License (code). Word lists: public domain (ENABLE).\n\nCopyright (c) 2026 ${AUTHOR}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n`);
const best = ranked[0], bestAns = topAnswers[0];
writeFileSync('README.md', `# Word Game Data

Open data for Wordle, Scrabble and other word games, published as a small website${BASE ? ` at ${BASE}/` : ''}.

Tools: a [Wordle solver and helper](wordle-solver/) and a [word unscrambler](word-unscrambler/), both client-side, no build step.

| Dataset | File |
|---|---|
| Every allowed Wordle opener (${allowed.length.toLocaleString('en-US')}) ranked against ${answers.length.toLocaleString('en-US')} answers | [data/wordle-openers-ranked.csv](data/wordle-openers-ranked.csv) |
| Wordle letter frequency by position | [data/wordle-letter-frequency.csv](data/wordle-letter-frequency.csv) |
| ${five.length.toLocaleString('en-US')} five-letter words (+ Scrabble points) | [data/five-letter-words.txt](data/five-letter-words.txt), [.csv](data/five-letter-words.csv) |
| ${two.length} two-letter words | [data/two-letter-words.txt](data/two-letter-words.txt), [printable PDF](data/two-letter-words.pdf) |
| ${qNoU.length} Q-without-U words | [data/q-without-u.txt](data/q-without-u.txt), [printable PDF](data/q-without-u.pdf) |

**Headline result:** the best opener overall is ${best.word.toUpperCase()} (${fmt(best.avg)} answers left on average); the best opener that can also be the answer is ${bestAns.word.toUpperCase()} (${fmt(bestAns.avg)}). RAISE scores ${fmt(byWord.get('raise').avg)}, CRANE ${fmt(byWord.get('crane').avg)}, ADIEU ${fmt(byWord.get('adieu').avg)}.

Method, code and charts are on the website. Word lists come from ENABLE (public domain) via [thewordfinder.io](${SITE}/), a free word finder with daily puzzle hints and browser word games.

Rebuild: \`node build.mjs\` (needs the thewordfinder.io site checkout next to this folder). Licence: code MIT, word lists public domain.
`);
if (BASE) {
  const slugs = ['', ...NAV.slice(1).map(([h]) => h)];
  writeFileSync('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${slugs.map((s) => `<url><loc>${BASE}/${s}</loc></url>`).join('')}</urlset>\n`);
  writeFileSync('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`);
}
console.log(`done: ${NAV.length} pages, best opener ${best.word} ${fmt(best.avg)}, best answer-opener ${bestAns.word} ${fmt(bestAns.avg)}${BASE ? '' : ' (no BASE_URL: canonical/sitemap skipped)'}`);
