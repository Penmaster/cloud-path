/**
 * Extracts the curriculum from devops-study-hub.html into curriculum.json.
 *
 * The source HTML is the single source of truth. This script evaluates the
 * actual `R`, `STAGES` and `L` literals out of that file rather than
 * transcribing them, so lesson text cannot drift. It refuses to emit output
 * unless every structural assertion passes.
 *
 * Usage: node tools/extract-curriculum.mjs <source.html> <out.json>
 */

import { readFileSync, writeFileSync } from 'node:fs';

const [, , sourcePath, outPath, jsOutPath] = process.argv;
if (!sourcePath || !outPath) {
  console.error('usage: extract-curriculum.mjs <source.html> <out.json> [out.js]');
  process.exit(2);
}

const html = readFileSync(sourcePath, 'utf8');

/**
 * Returns the literal that follows `var <name> =`, found by matching brackets
 * rather than by regex, so braces inside strings do not truncate it.
 */
function extractLiteral(source, name) {
  const anchor = new RegExp(`var\\s+${name}\\s*=\\s*`).exec(source);
  if (!anchor) throw new Error(`Could not find "var ${name} =" in the source.`);

  let i = anchor.index + anchor[0].length;
  const open = source[i];
  const close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) throw new Error(`"var ${name} =" is not followed by { or [.`);

  let depth = 0;
  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue; }
    if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }

    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return source.slice(anchor.index + anchor[0].length, i + 1);
    }
  }
  throw new Error(`Unbalanced brackets while reading "var ${name}".`);
}

/** Evaluates a JS object/array literal with no access to any scope. */
function evaluateLiteral(literal, name) {
  try {
    return Function(`"use strict"; return (${literal});`)();
  } catch (error) {
    throw new Error(`Failed to evaluate "${name}": ${error.message}`);
  }
}

/**
 * The source renders labels via innerHTML, so an entity like `&amp;` displays
 * as "&". Decoding here preserves what the reader actually sees.
 */
function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

const R = evaluateLiteral(extractLiteral(html, 'R'), 'R');
const STAGES = evaluateLiteral(extractLiteral(html, 'STAGES'), 'STAGES');
const L = evaluateLiteral(extractLiteral(html, 'L'), 'L');

const stages = STAGES.map((stage, id) => ({
  id,
  name: decodeEntities(stage.name),
  weeks: decodeEntities(stage.weeks),
  note: decodeEntities(stage.note),
}));

const lessons = L.map((lesson, id) => ({
  id,
  stageId: lesson.s,
  week: lesson.w,
  title: decodeEntities(lesson.t),
  goal: decodeEntities(lesson.goal),
  minutes: lesson.min,
  task: decodeEntities(lesson.do),
  doneWhen: decodeEntities(lesson.dn),
  resources: lesson.r.map((key) => {
    const entry = R[key];
    if (!entry) throw new Error(`Lesson ${id} references unknown resource "${key}".`);
    const [label, url, type, cost] = entry;
    return { label: decodeEntities(label), url, type, cost };
  }),
}));

/* ---------- assertions: refuse to emit anything that drifted ---------- */

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(lessons.length === 80, `Expected 80 lessons, got ${lessons.length}.`);
check(stages.length === 5, `Expected 5 stages, got ${stages.length}.`);

lessons.forEach((lesson, index) => {
  check(lesson.id === index, `Lesson at index ${index} has id ${lesson.id} — ids must be sequential from 0.`);
  check(lesson.resources.length > 0, `Lesson ${index} has no resources.`);
  check(
    Number.isInteger(lesson.stageId) && lesson.stageId >= 0 && lesson.stageId < stages.length,
    `Lesson ${index} has out-of-range stageId ${lesson.stageId}.`,
  );
  check(Number.isInteger(lesson.week) && lesson.week >= 1 && lesson.week <= 16, `Lesson ${index} has invalid week ${lesson.week}.`);
  check(Number.isInteger(lesson.minutes) && lesson.minutes > 0, `Lesson ${index} has invalid minutes ${lesson.minutes}.`);
  ['title', 'goal', 'task', 'doneWhen'].forEach((field) => {
    check(typeof lesson[field] === 'string' && lesson[field].trim() !== '', `Lesson ${index} has empty ${field}.`);
  });
  lesson.resources.forEach((resource) => {
    check(resource.url.startsWith('https://'), `Lesson ${index} resource "${resource.label}" is not https: ${resource.url}`);
    check(['free', 'paid'].includes(resource.cost), `Lesson ${index} resource "${resource.label}" has unexpected cost "${resource.cost}".`);
  });
});

const weeks = [...new Set(lessons.map((lesson) => lesson.week))].sort((a, b) => a - b);
check(weeks.length === 16, `Expected 16 distinct weeks, got ${weeks.length}.`);
check(
  weeks.every((week, index) => week === index + 1),
  `Weeks are not a contiguous 1..16 run: ${weeks.join(',')}`,
);

// Lessons must stay in ascending week order — the order is dependency-driven.
lessons.forEach((lesson, index) => {
  if (index === 0) return;
  check(lesson.week >= lessons[index - 1].week, `Lesson ${index} (week ${lesson.week}) goes backwards in time.`);
  check(lesson.stageId >= lessons[index - 1].stageId, `Lesson ${index} goes backwards a stage.`);
});

Object.values(R).forEach(([label, url]) => {
  check(url.startsWith('https://'), `Registry entry "${label}" is not https: ${url}`);
});

if (failures.length > 0) {
  console.error('EXTRACTION REFUSED — the source did not match the locked structure:\n');
  failures.forEach((failure) => console.error(`  ✗ ${failure}`));
  process.exit(1);
}

/* ---------- report ---------- */

const referenced = new Set(lessons.flatMap((lesson) => L[lesson.id].r));
const unreferenced = Object.keys(R).filter((key) => !referenced.has(key));

const perStage = stages.map((stage) => {
  const own = lessons.filter((lesson) => lesson.stageId === stage.id);
  const stageWeeks = [...new Set(own.map((lesson) => lesson.week))];
  return `  stage ${stage.id}  ${String(own.length).padStart(2)} lessons  weeks ${stageWeeks[0]}–${stageWeeks[stageWeeks.length - 1]}  ${stage.name}`;
});

console.log('VERIFIED');
console.log(`  lessons ............ ${lessons.length}`);
console.log(`  stages ............. ${stages.length}`);
console.log(`  weeks .............. ${weeks.length} (1–16)`);
console.log(`  resource registry .. ${Object.keys(R).length} entries`);
console.log(`  resource links ..... ${lessons.reduce((total, lesson) => total + lesson.resources.length, 0)} across all lessons`);
console.log(`  all URLs https ..... yes`);
console.log(`  ids sequential ..... 0–${lessons.length - 1}`);
console.log('');
perStage.forEach((line) => console.log(line));
console.log('');
console.log(`  minutes range ...... ${Math.min(...lessons.map((l) => l.minutes))}–${Math.max(...lessons.map((l) => l.minutes))}`);
console.log(`  setup-only keys .... ${unreferenced.length} (${unreferenced.join(', ') || 'none'})`);

// The Setup screen lists resources by registry key rather than by lesson, so
// the registry ships alongside the resolved lessons.
const resources = Object.fromEntries(
  Object.entries(R).map(([key, [label, url, type, cost]]) => [
    key,
    { label: decodeEntities(label), url, type, cost },
  ]),
);

const curriculum = { stages, lessons, resources };

writeFileSync(outPath, `${JSON.stringify(curriculum, null, 2)}\n`);
console.log(`\nwrote ${outPath}`);

// Also emit a plain script the page can load synchronously. Avoiding fetch()
// means the curriculum is present on first paint and cannot fail offline, even
// if the service worker has not installed yet.
if (jsOutPath) {
  writeFileSync(
    jsOutPath,
    `/* Generated by tools/extract-curriculum.mjs — do not edit by hand. */\n` +
      `window.CURRICULUM = ${JSON.stringify(curriculum)};\n`,
  );
  console.log(`wrote ${jsOutPath}`);
}
