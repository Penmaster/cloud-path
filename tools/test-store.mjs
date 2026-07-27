/**
 * Tests for dist/store.js — streak arithmetic, backup codes, corrupt input.
 * Runs the real file against a stubbed window. No test framework.
 *
 * Usage: node tools/test-store.mjs
 */

import { readFileSync } from 'node:fs';

/* ---------- stub the browser globals store.js expects ------------------- */

const memory = new Map();
const win = {
  CURRICULUM: { lessons: new Array(80).fill(null) },
  localStorage: {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  },
};

Function('window', readFileSync(new URL('../dist/store.js', import.meta.url), 'utf8'))(win);
const Store = win.Store;

/* ---------- tiny harness ------------------------------------------------ */

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; return; }
  failures.push(`${name}\n      expected ${e}\n      actual   ${a}`);
}

function freshState() { return Store.emptyState(); }

/* ---------- date helpers ------------------------------------------------ */

check('daysBetween: same day', Store.daysBetween('2026-07-27', '2026-07-27'), 0);
check('daysBetween: next day', Store.daysBetween('2026-07-27', '2026-07-28'), 1);
check('daysBetween: month boundary', Store.daysBetween('2026-07-31', '2026-08-01'), 1);
check('daysBetween: year boundary', Store.daysBetween('2025-12-31', '2026-01-01'), 1);
check('daysBetween: leap day', Store.daysBetween('2028-02-28', '2028-02-29'), 1);
check('daysBetween: gap of 5', Store.daysBetween('2026-07-01', '2026-07-06'), 5);

/* ---------- streak: the four edge cases -------------------------------- */

{
  const s = freshState();
  Store.markActiveToday(s, '2026-07-27');
  check('first completion starts streak at 1', s.streak.current, 1);
  check('first completion sets longest', s.streak.longest, 1);
}

{
  // Same-day double completion must not double-count.
  const s = freshState();
  Store.markActiveToday(s, '2026-07-27');
  Store.markActiveToday(s, '2026-07-27');
  Store.markActiveToday(s, '2026-07-27');
  check('same-day repeats count once', s.streak.current, 1);
}

{
  // Consecutive days increment.
  const s = freshState();
  ['2026-07-25', '2026-07-26', '2026-07-27'].forEach((d) => Store.markActiveToday(s, d));
  check('three consecutive days', s.streak.current, 3);
  check('longest tracks the run', s.streak.longest, 3);
}

{
  // A one-day gap restarts the count.
  const s = freshState();
  ['2026-07-20', '2026-07-21', '2026-07-22'].forEach((d) => Store.markActiveToday(s, d));
  Store.markActiveToday(s, '2026-07-24'); // missed the 23rd
  check('one-day gap restarts at 1', s.streak.current, 1);
  check('longest is never reduced', s.streak.longest, 3);
}

{
  // A multi-day gap also restarts.
  const s = freshState();
  ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04'].forEach((d) => Store.markActiveToday(s, d));
  Store.markActiveToday(s, '2026-08-15');
  check('multi-day gap restarts at 1', s.streak.current, 1);
  check('longest survives a long gap', s.streak.longest, 4);
}

{
  // Completing after a reset behaves like a first completion.
  let s = freshState();
  ['2026-07-25', '2026-07-26'].forEach((d) => Store.markActiveToday(s, d));
  s = Store.emptyState();
  Store.markActiveToday(s, '2026-07-27');
  check('completion after reset starts at 1', s.streak.current, 1);
  check('longest is cleared by reset', s.streak.longest, 1);
}

/* ---------- displayed streak decays without a background job ----------- */

{
  const s = freshState();
  ['2026-07-25', '2026-07-26', '2026-07-27'].forEach((d) => Store.markActiveToday(s, d));
  check('shown on the active day', Store.currentStreak(s, '2026-07-27'), 3);
  check('still shown the next day', Store.currentStreak(s, '2026-07-28'), 3);
  check('broken after a missed day', Store.currentStreak(s, '2026-07-29'), 0);
  check('broken long after', Store.currentStreak(s, '2026-09-01'), 0);
  check('stored value is left intact', s.streak.current, 3);
}

check('no streak on a fresh state', Store.currentStreak(freshState(), '2026-07-27'), 0);

/* ---------- backup codes ------------------------------------------------ */

{
  const s = Store.sanitise({
    done: [0, 7, 8, 63, 64, 79],
    streak: { current: 4, longest: 11, last: '2026-07-27' },
  });
  const code = Store.encode(s);
  const back = Store.decode(code);
  check('round-trip preserves lessons', back.done, [0, 7, 8, 63, 64, 79]);
  check('round-trip preserves streak', back.streak, { current: 4, longest: 11, last: '2026-07-27' });
  check('code has the expected shape', /^CP1-[0-9a-f]{20}-\d+-\d+-\d{8}$/.test(code), true);
}

{
  const s = freshState();
  check('empty state round-trips', Store.decode(Store.encode(s)).done, []);
}

{
  const all = Store.sanitise({ done: Array.from({ length: 80 }, (_, i) => i) });
  const back = Store.decode(Store.encode(all));
  check('all 80 lessons round-trip', back.done.length, 80);
  check('all-complete bitfield is full', Store.encode(all).split('-')[1], 'f'.repeat(20));
}

{
  const s = Store.sanitise({ done: [3], streak: { current: 2, longest: 2, last: null } });
  check('null last date round-trips as null', Store.decode(Store.encode(s)).streak.last, null);
}

check('decode rejects nonsense', Store.decode('hello'), null);
check('decode rejects empty', Store.decode(''), null);
check('decode rejects wrong prefix', Store.decode('XX9-01000000000000000000-1-1-20260727'), null);
check('decode rejects short bitfield', Store.decode('CP1-0100-1-1-20260727'), null);
check('decode rejects non-hex bitfield', Store.decode('CP1-zzzzzzzzzzzzzzzzzzzz-1-1-20260727'), null);
check('decode rejects a non-string', Store.decode(null), null);
check('decode tolerates surrounding space', Store.decode('  CP1-01000000000000000000-1-1-20260727  ').done, [0]);

/* ---------- corrupt persisted data -------------------------------------- */

check('sanitise handles null', Store.sanitise(null), freshState());
check('sanitise handles a string', Store.sanitise('garbage'), freshState());
check('sanitise drops out-of-range ids', Store.sanitise({ done: [-1, 0, 80, 999, 5] }).done, [0, 5]);
check('sanitise drops non-integer ids', Store.sanitise({ done: [1.5, 'x', null, 2] }).done, [2]);
check('sanitise de-duplicates ids', Store.sanitise({ done: [4, 4, 4, 1] }).done, [1, 4]);
check('sanitise rejects a bad date', Store.sanitise({ streak: { last: 'yesterday' } }).streak.last, null);
check(
  'sanitise repairs longest < current',
  Store.sanitise({ streak: { current: 9, longest: 2, last: '2026-07-27' } }).streak.longest,
  9,
);

{
  memory.set('cloudpath.v1', '{not json');
  check('load survives corrupt JSON', Store.load(), freshState());
  memory.clear();
}

{
  const s = Store.sanitise({ done: [1, 2], streak: { current: 2, longest: 2, last: '2026-07-27' } });
  Store.save(s);
  check('save then load is lossless', Store.load(), s);
  memory.clear();
}

/* ---------- report ------------------------------------------------------ */

if (failures.length > 0) {
  console.error(`\n${failures.length} FAILED, ${passed} passed\n`);
  failures.forEach((f) => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`store.js — ${passed} checks passed`);
