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

/* ---------- retrieval practice ------------------------------------------ */

const doneUpTo = (n) => Store.sanitise({ done: Array.from({ length: n }, (_, i) => i) });

{
  // Nothing to review until there is something older than the fresh window.
  check('no review when nothing is completed', Store.pickReview(freshState(), '2026-07-27'), null);
  check('no review when all completions are too fresh', Store.pickReview(doneUpTo(2), '2026-07-27'), null);
  check('first review appears once past the fresh window', Store.pickReview(doneUpTo(3), '2026-07-27'), 0);
}

const addDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

{
  // Oldest unreviewed material comes first — it has decayed longest.
  const s = doneUpTo(10);
  check('picks the earliest unreviewed lesson', Store.pickReview(s, '2026-07-27'), 0);
  Store.recordReview(s, 0, true, '2026-07-27');
  check('then the next earliest, the following day', Store.pickReview(s, '2026-07-28'), 1);
}

{
  // At most one prompt a day, however many are overdue.
  const s = doneUpTo(10); // eight are eligible and all are unreviewed
  check('one is offered', Store.pickReview(s, '2026-07-27'), 0);
  Store.recordReview(s, 0, true, '2026-07-27');
  check('answering closes the day', Store.pickReview(s, '2026-07-27'), null);
  check('a new one appears tomorrow', Store.pickReview(s, '2026-07-28'), 1);
}

{
  // The two newest completions are never asked about, on any day.
  const s = doneUpTo(10);
  let day = '2026-07-27';
  const picked = new Set();
  for (let i = 0; i < 60; i++) {
    const id = Store.pickReview(s, day);
    if (id !== null) { picked.add(id); Store.recordReview(s, id, true, day); }
    day = addDays(day, 1);
  }
  check('the freshest two never surface', [picked.has(8), picked.has(9)], [false, false]);
  check('every older lesson does surface', [...picked].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
}

{
  // Spacing: answered today, not due tomorrow, due after the interval.
  const s = doneUpTo(5);
  Store.recordReview(s, 0, true, '2026-07-27'); // level 1 -> interval 4 days
  Store.recordReview(s, 1, true, '2026-07-27');
  Store.recordReview(s, 2, true, '2026-07-27');
  check('nothing due the same day', Store.pickReview(s, '2026-07-27'), null);
  check('still not due after 3 days', Store.pickReview(s, '2026-07-30'), null);
  check('due once the interval passes', Store.pickReview(s, '2026-07-31'), 0);
}

{
  // Anything never reviewed outranks anything merely overdue, however overdue.
  const s = doneUpTo(4); // eligible: 0 and 1
  Store.recordReview(s, 0, true, '2026-01-01'); // wildly overdue, but seen
  check('unreviewed beats overdue', Store.pickReview(s, '2026-07-27'), 1);
}

{
  // The ladder expands on success and collapses on failure.
  // Only lesson 0 is eligible here, so nothing else can win the pick.
  const s = doneUpTo(3);
  Store.recordReview(s, 0, true, '2026-07-01');
  check('one success -> level 1', s.review[0].level, 1);
  Store.recordReview(s, 0, true, '2026-07-05');
  check('two successes -> level 2', s.review[0].level, 2);
  Store.recordReview(s, 0, false, '2026-07-10');
  check('an honest "no" resets to level 0', s.review[0].level, 0);
  check('not due the very next day', Store.pickReview(s, '2026-07-11'), null);
  check('and it returns after the shortest interval', Store.pickReview(s, '2026-07-12'), 0);
}

{
  const s = doneUpTo(5);
  for (let i = 0; i < 12; i++) Store.recordReview(s, 0, true, '2026-07-27');
  check('level is capped at the top of the ladder', s.review[0].level, Store.LADDER.length - 1);
}

{
  // Among lessons that have all been seen, the most overdue wins.
  const s = doneUpTo(4); // eligible: 0 and 1, both reviewed below
  Store.recordReview(s, 0, true, '2026-07-20');  // level 1, interval 4 -> 4 days overdue
  Store.recordReview(s, 1, false, '2026-07-26'); // level 0, interval 2 -> due exactly now
  check('most overdue wins', Store.pickReview(s, '2026-07-28'), 0);
}

check('sanitise handles a missing review map', Store.sanitise({ done: [1] }).review, {});
check('sanitise handles review as an array', Store.sanitise({ done: [1], review: [] }).review, {});
check('sanitise drops out-of-range review ids', Store.sanitise({ review: { 999: { seen: '2026-07-27', level: 1 } } }).review, {});
check('sanitise drops review entries with a bad date', Store.sanitise({ review: { 1: { seen: 'nope', level: 1 } } }).review, {});
check(
  'sanitise clamps an out-of-range level',
  Store.sanitise({ review: { 1: { seen: '2026-07-27', level: 99 } } }).review[1].level,
  Store.LADDER.length - 1,
);

{
  const s = doneUpTo(5);
  Store.recordReview(s, 0, true, '2026-07-27');
  Store.save(s);
  check('review state survives save then load', Store.load().review, s.review);
  memory.clear();
}

{
  // Backup codes deliberately carry progress only. Losing the review schedule
  // is trivial; losing 60 completed lessons is not.
  const s = doneUpTo(5);
  Store.recordReview(s, 0, true, '2026-07-27');
  const back = Store.decode(Store.encode(s));
  check('restore keeps the lessons', back.done.length, 5);
  check('restore starts the review schedule fresh', back.review, {});
}

/* ---------- report ------------------------------------------------------ */

if (failures.length > 0) {
  console.error(`\n${failures.length} FAILED, ${passed} passed\n`);
  failures.forEach((f) => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`store.js — ${passed} checks passed`);
