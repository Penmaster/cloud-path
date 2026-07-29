# Cloud Path

A calm, offline study tracker for an 80-lesson, 16-week DevOps → AWS curriculum.

Static site. No backend, no accounts, no build tooling, no dependencies, and no
network calls after first load. Installs to a phone home screen and behaves like
an app. 124 KB.

**Live:** https://penmaster.github.io/cloud-path/

---

## Using it

Open the link on a laptop and it just works.

On a **phone**, open it in the browser and add it to the home screen — on iPhone
that means **Safari** specifically, since only Safari can install to the home
screen on iOS:

1. Open the link in Safari
2. Tap **Share**
3. **Add to Home Screen** → Add

It then runs full-screen with its own icon and works with no signal.

> Installing is not cosmetic. Safari wipes a normal site's local storage after
> 7 days without a visit. Home-screen web apps are exempt from that counter, so
> adding it to the home screen is what makes progress stick. Left as a browser
> tab, progress can vanish after a week away.

Progress is stored on the device and never leaves it. Two phones do not sync.

---

## Layout

```
source/devops-study-hub.html   the source of truth for all content
src/curriculum.json            extracted curriculum, for inspection and diffing
dist/                          the app — edit here
  index.html
  app.css                      every design token is in the :root block at the top
  store.js                     storage, streak arithmetic, backup codes (no DOM)
  app.js                       rendering and events (never touches localStorage)
  curriculum.js                GENERATED — do not edit
  sw.js                        offline cache
tools/
  extract-curriculum.mjs       HTML source of truth  →  JSON + JS
  test-store.mjs               46 checks on storage / streak / backup logic
  build.mjs                    extract → test → assemble docs/
docs/                          GENERATED — what GitHub Pages serves
```

### The content is authored, not written here

`source/devops-study-hub.html` is the **single source of truth** for all 80
lessons, their resources, and the Setup screen text.
`tools/extract-curriculum.mjs` evaluates the real `R`, `STAGES` and `L` literals
out of that file rather than transcribing them, so lesson text cannot drift.

It refuses to emit anything unless the structure holds: exactly 80 lessons,
5 stages, weeks 1–16 contiguous, sequential ids, every lesson with at least one
resource, every URL `https://`, and no lesson going backwards in week or stage.

**To change a lesson, edit the HTML and rebuild.** Never edit `curriculum.js`.

---

## Working on it

```bash
node tools/build.mjs
```

Re-extracts the curriculum, runs the tests, and rebuilds `docs/`. It stops if
the source file is missing or a test fails.

Tests only:

```bash
node tools/test-store.mjs
```

Serve it locally:

```bash
python3 -m http.server 8788 --directory dist
```

> While developing, the service worker serves stale CSS and JS. In DevTools:
> Application → Service Workers → Unregister, then Clear storage.

---

## Deploying

GitHub Pages publishes from `main` → `/docs`. So the deploy is just a push:

```bash
node tools/build.mjs
git add -A
git commit -m "Update"
git push
```

Pages takes about a minute. There is no CI and no second account involved.

`build.mjs` stamps `sw.js` with a hash of the built files, so the cache name
changes whenever content changes. Without that, an already-installed phone would
keep serving the old version forever. **Always deploy the output of
`build.mjs`** — hand-editing `docs/` breaks that guarantee.

### On privacy

This repo is public, so the code and the curriculum are visible to anyone. That
is fine here and worth being explicit about why: **the app stores nothing
personal and sends nothing anywhere.** All progress is local to the device,
there is no server, no analytics, no telemetry, and no third-party requests —
not even a web font. There is nothing to leak.

`robots.txt` and a `noindex` meta tag keep it out of search results. That is
tidiness, not access control — anyone with the link can open it.

---

## The "After week 16" appendix

One card at the bottom of Setup lists eight free follow-on resources — Python,
Helm, EKS, Ansible, GitLab CI, Secrets Manager, SQL. **These are the only links
in the app that do not come from the source HTML.** They live in the `AFTER`
array in `dist/app.js`, behind a provenance comment.

They exist because a gap analysis against current job adverts found **Python
absent from all 80 lessons** despite being one of the most commonly required
skills, alongside Terraform. Kubernetes is also only five lessons and only on
local `kind` — no Helm, no managed cluster.

The fix was deliberately *not* to add lessons. The curriculum's sequence is
dependency-correct and its audience already bounced off a harder version;
stretching 16 weeks to 22 would defeat the point. So the gaps sit in an appendix
that stays at the bottom of Setup, never appears on Today or Plan, never affects
progress or the streak, and opens by saying not to read it until week 16 is done.

Every entry is free and was verified live. If you add to it, keep both true.

---

## Testing yourself

Beneath the day's lesson, Today sometimes shows a **"Still got it?"** card: the
completion criterion from a lesson he finished weeks ago, and one question —
*could you still do that, right now, without looking it up?*

The prompts are **the curriculum's own words**. Nothing is invented and there is
no question bank. The 80 lessons already contain 80 author-written criteria;
they were simply being used once and never seen again.

Two answers. "Yes" pushes the lesson further out — 2, 4, 8, 16, then 32 days.
"Not really" brings it back tomorrow and names the lesson worth revisiting.

Constraints that keep it a nudge rather than a test:

- **One prompt a day, maximum**, however many are overdue
- Nothing is scored — no percentage, no tally, no history
- **It cannot affect progress, the lesson count or the streak.** "Not really" is
  information, not a penalty
- The two most recent completions are skipped; asking about yesterday tests
  nothing

This exists because only 18% of the course's completion criteria require an
*explanation* rather than just "it worked" — and that proportion falls as the
material gets harder. Spaced retrieval over the author's own criteria closes
that gap without adding a single lesson.

Backup codes carry progress only, not the review schedule. Restoring on a new
phone keeps all 80 completion flags and the streak, and simply starts the review
schedule again.

## Gate lessons

Four lessons stand up infrastructure that everything after them depends on:
getting a Linux server, SSH, nginx, and the AWS account. On those, the usual
"stuck for 30 minutes? move on and come back tomorrow" advice is replaced —
moving on is impossible, and saying otherwise sets a beginner up to fail at the
exact point where attrition concentrates.

## Deliberate limitations

**No notifications.** A home-screen web app has no reliable API for scheduled
local notifications on iOS, and web push would need a server. Rather than ship
something that half-works, Setup suggests a repeating phone alarm. A real daily
reminder would require a native app — that is the only thing an Apple Developer
membership would buy here.

**Progress is local to one device.** No sync, by design. Two ways it can still
be lost: clearing the browser's website data, or iOS evicting storage when the
device is critically low on space. The **backup code** in Setup is the defence —
one button copies a short string encoding all 80 completion flags plus the
streak, and one field pastes it back.

**Streak rules.** One or more lessons completed on a local calendar day counts
as one active day. Consecutive days increment; any gap restarts at 1; the
longest streak is never reduced. Device local time, no timezone conversion. A
streak whose last active day is older than yesterday displays as 0 without
anything needing to run in the background.

---

## Things this app deliberately does not do

No notes, timers, cloud sync, accounts, sharing, search, light mode,
achievements, badges, certification features, or exam countdowns.

It never shows "behind schedule", a due date, a target finish date, or a
catch-up prompt. Missing days is expected; the app must not make that feel like
failure. See `CLAUDE.md`.
