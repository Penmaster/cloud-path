# Cloud Path — project rules

A calm, offline study tracker for a 16-week DevOps → AWS curriculum.
Delivered as a static site that installs to an iPhone home screen.

These rules are locked. They come from explicit decisions, not inference.
If a task cannot be done without breaking one, **stop and ask**.

---

## 0. CONTENT IS AUTHORED — NEVER GENERATED

`devops-study-hub.html` is the **single source of truth** for all curriculum
content. Every lesson title, goal, task, completion criterion, resource label
and URL comes from that file, verbatim.

- **If that file is missing or unreadable: STOP and ask.**
  Do not research. Do not draft a proposal. Do not substitute another syllabus.
  Do not reconstruct it from memory of this conversation.
- Never rewrite, improve, summarise, translate, shorten or "clarify" lesson text.
- Never add a lesson, resource, or URL that is not in the source file.

## 1. STRUCTURE IS FIXED

**80 lessons. 5 stages. 16 weeks.** A different count is a bug.

- Do not reshape, reorder, merge, split or rebalance anything.
- The order is **dependency-driven** — each lesson assumes the one before it.
- Shape of the curriculum:
  - **Weeks 1–8** — DevOps/Linux foundations, **zero AWS**
    (terminal, Git, one small Linux server, networking, Bash, Docker)
  - **Weeks 9–12** — AWS core, console-first, then Terraform
  - **Weeks 13–16** — CI/CD, Kubernetes, monitoring, capstone
- **The absence of AWS before week 9 is a deliberate design decision, not an
  oversight.** Never "fix" it.

## 2. THE READER

A **near-total beginner**. Assume he can use a computer and nothing more:
no serious terminal use, no Linux, no cloud, no Git.

He saw an earlier, more advanced version of this roadmap and found it
overwhelming. That reaction is the reason this gentle version exists.

- **Never raise the depth of any lesson.**
- The interface must never make him feel behind, measured, or judged.

## 3. THE GOAL — AND WHAT IT IS NOT

Target outcome: competence and employability. He can interview credibly for a
junior DevOps/cloud role with **10 documented projects**.

This is **not** a certification course.

- AWS Solutions Architect Associate appears **once**, in lesson 80, as an
  optional decision he makes at the end.
- **Do not build** cert features, practice questions, mock exams, or
  exam countdowns.

## 4. TIME AND PACE

Intended pace: **one lesson per day, 5 days a week, 16 weeks, ~1.5–2 hours a day.**

- Every lesson carries its own `minutes` value (90–180) in the data.
  **Display that value. Never override it. Never recalculate it.**
  Never sum it into a "total time remaining" figure.
- There is **no deadline**. If he misses days, he simply continues where he is.
- The app must **never** display: "behind schedule", a due date, a target
  finish date, a catch-up prompt, or days-missed. Ever.

## 5. SCOPE — v1

Three screens: **Today**, **Plan**, **Setup**. Today is the landing screen.

In scope:
- Progress: which of the 80 lessons are complete.
- Streak counter (current + longest).
- Backup code: one button to copy progress out, one field to paste it back,
  plus a plain-English line explaining what it is for.
- One line in Setup telling him to set a repeating daily alarm on his phone.

Explicitly **out of scope** — do not add, do not offer:
notes, timers, cloud sync, accounts, sharing, search, dark/light toggle,
gamification, achievements, badges, in-app browser, widgets,
push notifications, any backend, any network call after first load.

### The "After week 16" appendix — approved addition

The Setup screen carries one card of follow-on resources (Python, Helm, EKS,
Ansible, GitLab CI, Secrets Manager, SQL) that are **not** from the source HTML.
They live in the `AFTER` array in `dist/app.js`, marked with a provenance
comment. Approved on 2026-07-27 after a gap analysis against current job
adverts found Python absent from all 80 lessons despite being a commonly
required skill.

A second card, **"On a Windows laptop"**, sits near the top of Setup for the
same reason: lesson 1 says "Windows: install WSL with Ubuntu" and never mentions
Windows again, which leaves a beginner free to install Docker and Terraform in
PowerShell instead of inside Ubuntu. Its two extra links live in the `WINDOWS`
array in `dist/app.js`.

Rules for both:
- It is an **appendix, not part of the path.** It must stay at the bottom of
  Setup, must stay optional, and must never appear on Today or Plan.
- It must never affect lesson count, progress, or the streak.
- Every entry must be free and verified live before shipping.
- **This is the only place invented links are permitted.** Everything else
  still comes from the source file, verbatim.

Also added: an "About the time estimates" card, stating plainly that project
days run long and that this is not failure. This exists because the source
file's `minutes` values are optimistic for the project lessons, and those
values are displayed as-is and must not be recalculated (see §4).

### No daily notification

Deliberately dropped. A home-screen web app has no reliable API for scheduled
local notifications, and web push would require a server we are not building.
A half-working reminder is worse than none. The Setup line about a phone alarm
replaces it. **Do not reintroduce this.**

## 6. PRIVACY

- All progress is local to the device. **Nothing is ever sent to the server.**
- No analytics, no telemetry, no fonts or scripts from a CDN, no third-party
  requests of any kind. Not even a web font. Do not add one.
- The repo and the site are **public**. That is acceptable only because there is
  nothing personal in either — no server, no accounts, no data collection.
  If that ever stops being true, this decision has to be revisited first.
- `robots.txt` and a `noindex` meta tag keep it out of search results. That is
  tidiness, **not access control**. Anyone with the link can open it. Say so
  plainly rather than implying the link is private.

## 7. DESIGN

- **Dark only.** No light mode, no toggle.
- **One accent: muted teal-green.** No gradients. No second accent colour.
  No AWS orange.
- Calm, generous spacing, large tap targets, real typographic hierarchy,
  restrained motion.
- **Never more than one decision on screen at a time.** Today shows exactly one
  lesson — never a list.
- All colour, spacing, radius, type-scale and duration values live in one
  tokens block and are referenced as CSS custom properties.
  **No raw hex colour or magic number anywhere else.**

## 8. ENGINEERING

- Static site. No build step, no framework, no bundler, no npm dependency.
- Must work fully offline after first load, including the curriculum.
- Progress persisted in `localStorage`; the app must survive a corrupt or
  absent value without crashing.
- Keep presentation, state and storage in separate, clearly named units.
  No storage calls inside rendering code.

## 9. DISCIPLINE

- If a spec is ambiguous, **stop and ask**. Do not guess.
- After every task, re-read the diff twice:
  1. Is it correct?
  2. Is it in scope — did I add anything nobody asked for?

---

## Deploying

GitHub Pages serves `main` → `/docs`. The deploy is `node tools/build.mjs`
then commit and push. `docs/` is generated — never hand-edit it, because
`build.mjs` stamps `sw.js` with a content hash and editing around that leaves
already-installed phones stuck on an old cached version forever.

## Parked, outside this repo

A verified Flutter scaffold exists on the author's machine at
`../study_tracker/` (three-layer architecture, enforced import boundaries, iOS
build confirmed). It is deliberately **not** in this repo. It is kept in case
the native app is revived — a native app is the only route that could ever
deliver a real daily notification.
