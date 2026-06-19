// Run the stock scoring rubric in isolation by extracting & evaluating the engine
// functions from public/app.js, then testing with synthetic picks.

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const appPath = path.join(__dirname, '..', 'public', 'app.js');
const src = fs.readFileSync(appPath, 'utf8');

// Extract the entire scoring engine block, starting at `const STOCK_SCORE_WEIGHTS`
// and ending at the closing brace of `function scoreAllStockPicks(...)`.
const start = src.indexOf('const STOCK_SCORE_WEIGHTS');
if (start < 0) throw new Error('STOCK_SCORE_WEIGHTS not found');

// Find the `function scoreAllStockPicks(` block and walk braces from there.
const fnStart = src.indexOf('function scoreAllStockPicks', start);
if (fnStart < 0) throw new Error('scoreAllStockPicks not found');
const openIdx = src.indexOf('{', fnStart);
let depth = 1;
let end = -1;
for (let k = openIdx + 1; k < src.length; k++) {
  if (src[k] === '{') depth++;
  else if (src[k] === '}') {
    depth--;
    if (depth === 0) { end = k + 1; break; }
  }
}
if (end < 0) throw new Error('Could not find end of scoreAllStockPicks');

const engineSrc = src.slice(start, end);

// We use a .mjs file because the project has "type": "module" in package.json.
const harnessPath = path.join(__dirname, '_scorer-harness.mjs');
fs.writeFileSync(
  harnessPath,
  engineSrc + '\nexport { scoreAllStockPicks, STOCK_SCORE_WEIGHTS, STOCK_SCORE_TOTAL_WEIGHT };\n'
);

// Use the dynamic-import pattern via Module evaluation
const harnessUrl = 'file://' + harnessPath.replace(/\\/g, '/');

(async () => {
  const { scoreAllStockPicks, STOCK_SCORE_WEIGHTS, STOCK_SCORE_TOTAL_WEIGHT } = await import(harnessUrl);

  const totalW = STOCK_SCORE_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  console.log(`Total weight: ${totalW} (declared ${STOCK_SCORE_TOTAL_WEIGHT})`);

  const picks = [
    {
      id: 'a', symbol: 'STRONG', source: 'AI', bias: 'Buy',
      setup: 'Breakout Ready',
      volume: 850000,
      rsi: 62,
      risk: 2, entry: 100, target: 115, stop: 97,
      notes: 'Volume confirm, strong relative strength, sector leader, breakout after consolidation'
    },
    {
      id: 'b', symbol: 'MID', source: 'AI', bias: 'Watch',
      setup: 'Momentum Continuation',
      volume: 75000,
      rsi: 58,
      risk: 4, entry: 200, target: 215, stop: 193,
      notes: 'Delivery increasing, neutral'
    },
    {
      id: 'c', symbol: 'WEAK', source: 'AI', bias: 'Avoid',
      setup: 'Avoid',
      volume: 8000,
      rsi: 78,
      risk: 7, entry: 50, target: 52, stop: 45,
      notes: 'Weak volume, distribution, RSI divergence, earnings miss'
    }
  ];

  const scored = scoreAllStockPicks(picks);
  console.log();
  for (const entry of scored) {
    console.log(`${entry.pick.symbol.padEnd(8)} -> ${entry.total}/100`);
    for (const item of entry.breakdown) {
      console.log(`  ${item.label.padEnd(20)} ${String(item.weight).padStart(3)}% -> ${item.score}/100 (+${item.contribution.toFixed(2)})`);
    }
    console.log();
  }

  const strong = scored.find((s) => s.pick.symbol === 'STRONG');
  const weak = scored.find((s) => s.pick.symbol === 'WEAK');
  const mid = scored.find((s) => s.pick.symbol === 'MID');

  let failed = false;
  if (!strong || !weak || !mid) { console.error('FAIL: missing test pick'); failed = true; }
  if (strong && weak && !(strong.total > weak.total)) { console.error(`FAIL STRONG(${strong.total}) not > WEAK(${weak.total})`); failed = true; }
  if (strong && mid && !(strong.total > mid.total)) { console.error(`FAIL STRONG(${strong.total}) not > MID(${mid.total})`); failed = true; }
  if (mid && weak && !(mid.total > weak.total)) { console.error(`FAIL MID(${mid.total}) not > WEAK(${weak.total})`); failed = true; }

  fs.unlinkSync(harnessPath);

  if (failed) process.exit(1);
  console.log(`PASS: STRONG ${strong.total} > MID ${mid.total} > WEAK ${weak.total}`);
})().catch((err) => {
  console.error('TEST HARNESS ERROR:', err);
  console.error('---ENGINE SRC PREVIEW---');
  console.error(engineSrc.slice(0, 2000));
  console.error('---END---');
  try { fs.unlinkSync(harnessPath); } catch (_) {}
  process.exit(2);
});
