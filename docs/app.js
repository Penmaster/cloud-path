/* ==========================================================================
   Cloud Path — rendering and interaction.
   Reads state through window.Store. Never touches localStorage directly.
   ========================================================================== */

(function () {
  'use strict';

  var C = window.CURRICULUM;
  var Store = window.Store;

  var TOTAL = C.lessons.length;
  var state = Store.load();
  var storageOK = Store.storageWorks();

  /* ------------------------------------------------------------------------
     NOT FROM devops-study-hub.html.
     The 80 lessons are untouched. These are the skills employers ask for that
     the course deliberately leaves out, offered only as an optional appendix
     after week 16 so they cannot make the main path feel longer.
     Ordered by how much they move the needle. All free, all verified live.
     ---------------------------------------------------------------------- */
  /* Also not from the source file. Lesson 1 says "Windows: install WSL with
     Ubuntu" and every lesson after it assumes a Linux terminal — which WSL
     provides. These cover the one way that reliably goes wrong: installing the
     tools on Windows instead of inside Ubuntu. */
  var WINDOWS = [
    { label: 'VS Code — working inside WSL', url: 'https://code.visualstudio.com/docs/remote/wsl', type: 'read', cost: 'free' },
    { label: 'Docker Desktop with the WSL 2 backend', url: 'https://docs.docker.com/desktop/features/wsl/', type: 'read', cost: 'free' },
  ];

  var AFTER = [
    { label: 'Automate the Boring Stuff with Python', url: 'https://automatetheboringstuff.com/', type: 'course', cost: 'free' },
    { label: 'The official Python tutorial', url: 'https://docs.python.org/3/tutorial/', type: 'read', cost: 'free' },
    { label: 'Helm — templated Kubernetes deploys', url: 'https://helm.sh/docs/', type: 'read', cost: 'free' },
    { label: 'EKS Workshop — Kubernetes on real AWS', url: 'https://www.eksworkshop.com/', type: 'lab', cost: 'free' },
    { label: 'Ansible — getting started', url: 'https://docs.ansible.com/projects/ansible/latest/getting_started/index.html', type: 'read', cost: 'free' },
    { label: 'GitLab CI/CD', url: 'https://docs.gitlab.com/ci/', type: 'read', cost: 'free' },
    { label: 'AWS Secrets Manager', url: 'https://docs.aws.amazon.com/secretsmanager/', type: 'read', cost: 'free' },
    { label: 'SQLBolt — SQL in the browser', url: 'https://sqlbolt.com/', type: 'lab', cost: 'free' },
  ];

  var el = {
    streak: document.getElementById('streak'),
    meter: document.getElementById('meter'),
    meterFill: document.getElementById('meter-fill'),
    meterLabel: document.getElementById('meter-label'),
    today: document.getElementById('view-today'),
    plan: document.getElementById('view-plan'),
    setup: document.getElementById('view-setup'),
    toast: document.getElementById('toast'),
    main: document.getElementById('main'),
  };

  /* ---------- text safety ------------------------------------------------ */

  /** Escapes everything. Use for any value going into markup. */
  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Lesson text carries deliberate inline <code> markup from the source file.
   * Everything is escaped first, then that one tag is allowed back in — so it
   * is an allowlist, not a bypass.
   */
  function rich(value) {
    return esc(value)
      .replace(/&lt;code&gt;/g, '<code>')
      .replace(/&lt;\/code&gt;/g, '</code>');
  }

  /* ---------- derived values --------------------------------------------- */

  var doneSet = new Set(state.done);

  function isDone(id) { return doneSet.has(id); }

  function completedCount() { return doneSet.size; }

  /** Today's lesson: the first by id that is not complete. */
  function currentLessonId() {
    for (var i = 0; i < TOTAL; i++) { if (!doneSet.has(i)) return i; }
    return -1;
  }

  function stageProgress(stageId) {
    var own = C.lessons.filter(function (l) { return l.stageId === stageId; });
    var done = own.filter(function (l) { return doneSet.has(l.id); }).length;
    return { done: done, total: own.length };
  }

  function persist() {
    state.done = Array.from(doneSet).sort(function (a, b) { return a - b; });
    Store.save(state);
  }

  /* ---------- chrome ------------------------------------------------------ */

  function renderChrome() {
    var n = completedCount();
    var pct = Math.round((n / TOTAL) * 100);

    el.meterFill.style.width = pct + '%';
    el.meter.setAttribute('aria-valuenow', String(n));
    el.meterLabel.textContent = n + ' of ' + TOTAL + ' lessons · ' + pct + '%';

    var days = Store.currentStreak(state);
    if (days > 0) {
      el.streak.hidden = false;
      el.streak.textContent = days === 1 ? '1 day' : days + ' days';
      el.streak.setAttribute('title', 'Longest streak: ' + state.streak.longest);
    } else {
      el.streak.hidden = true;
    }
  }

  /* ---------- shared pieces ---------------------------------------------- */

  function resourceHTML(resource) {
    if (!resource) return '';
    return '<a class="res" href="' + esc(resource.url) + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="res-body">' +
        '<span class="res-kind">' + esc(resource.type) + '</span>' +
        '<span class="res-label">' + esc(resource.label) + '</span>' +
      '</span>' +
      '<span class="res-cost">' + esc(resource.cost) + '</span>' +
      '<svg class="res-go" width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M7 17 17 7M9 7h8v8"/></svg>' +
    '</a>';
  }

  function resourcesByKey(keys) {
    return keys.map(function (key) { return resourceHTML(C.resources[key]); }).join('');
  }

  /* ---------- today ------------------------------------------------------- */

  function renderToday() {
    var id = currentLessonId();

    if (id === -1) {
      el.today.innerHTML =
        '<div class="card">' +
          '<div class="done-mark">' +
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
              'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<path d="M5 12.5 10 17.5 19 7"/></svg>' +
          '</div>' +
          '<h1 class="lesson-title">All ' + TOTAL + ' lessons complete.</h1>' +
          '<p class="lesson-goal">Sixteen weeks done. The portfolio is the point, not the checkmarks — ' +
            'go and use it.</p>' +
          '<div class="actions">' +
            '<button class="btn" data-act="undo">Undo last lesson</button>' +
          '</div>' +
        '</div>';
      return;
    }

    var lesson = C.lessons[id];
    var stage = C.stages[lesson.stageId];

    el.today.innerHTML =
      '<article class="card">' +
        '<div class="eyebrow">Week ' + lesson.week + ' · Lesson ' + (id + 1) + ' of ' + TOTAL + '</div>' +
        '<h1 class="lesson-title">' + esc(lesson.title) + '</h1>' +
        '<p class="lesson-goal">' + esc(lesson.goal) + '</p>' +
        '<div class="lesson-meta">' +
          '<span>' + esc(stage.name) + '</span>' +
          '<span class="lesson-meta-time">about ' + lesson.minutes + ' minutes</span>' +
        '</div>' +

        '<div class="section-label">Materials</div>' +
        lesson.resources.map(resourceHTML).join('') +

        '<div class="section-label">Do this</div>' +
        '<div class="block">' + rich(lesson.task) + '</div>' +

        '<div class="section-label">You are done when</div>' +
        '<div class="block block--criterion">' + rich(lesson.doneWhen) + '</div>' +

        '<div class="actions">' +
          '<button class="btn btn--primary" data-act="complete">Mark finished</button>' +
          (id > 0 ? '<button class="btn btn--quiet" data-act="undo">Undo last lesson</button>' : '') +
        '</div>' +
      '</article>' +

      (isGate(id)
        ? '<div class="card card--warn">' +
            '<p class="prose"><strong>This one is a gate.</strong> Everything after it needs this ' +
              'working, so the usual advice — move on and come back — does not apply here. ' +
              'Take as many days as it needs. Getting stuck for a week on this is normal and is not ' +
              'a sign you should stop.</p>' +
          '</div>'
        : '<div class="card">' +
            '<p class="prose">Stuck for more than 30 minutes? Note the question, move on, and come back ' +
              'tomorrow. Being stuck is normal; staying stuck is the only mistake.</p>' +
          '</div>') +

      renderRecall();
  }

  /* ---------- gates ------------------------------------------------------- */

  /* Four lessons stand up infrastructure everything later depends on. The
     "move on and come back tomorrow" advice is actively wrong for them.
     Matched on title as well as id, so that if the source curriculum ever
     changes the note quietly disappears rather than landing on a wrong lesson. */
  var GATES = {
    10: 'What a server actually is',
    11: 'SSH — connecting safely',
    12: 'Install a web server',
    40: 'AWS account — set up safely FIRST',
  };

  function isGate(id) {
    return GATES[id] !== undefined && C.lessons[id] && C.lessons[id].title === GATES[id];
  }

  /* ---------- retrieval practice ------------------------------------------ */

  var recallId = null;

  /**
   * Resurfaces the completion criterion of an earlier lesson and asks whether
   * he can still do it. The prompt is the curriculum's own wording — nothing
   * here is invented, and nothing is scored.
   */
  function renderRecall() {
    recallId = Store.pickReview(state);
    if (recallId === null) return '';

    var lesson = C.lessons[recallId];
    return '<div class="card card--recall">' +
      '<h2 class="card-title">Still got it?</h2>' +
      '<p class="recall-src">Week ' + lesson.week + ' · ' + esc(lesson.title) + '</p>' +
      '<div class="block block--criterion">' + rich(lesson.doneWhen) + '</div>' +
      '<p class="prose recall-ask">Right now, without looking it up — could you still do that?</p>' +
      '<div class="actions actions--row">' +
        '<button class="btn" data-act="recall-no">Not really</button>' +
        '<button class="btn" data-act="recall-yes">Yes</button>' +
      '</div>' +
    '</div>';
  }

  function answerRecall(remembered) {
    if (recallId === null) return;
    var lesson = C.lessons[recallId];
    Store.recordReview(state, recallId, remembered);
    persist();
    renderToday();
    toast(remembered
      ? 'Good — that one comes back later'
      : 'Worth a look: week ' + lesson.week + ', ' + lesson.title);
  }

  /* ---------- plan -------------------------------------------------------- */

  var openStages = null;

  function renderPlan() {
    var current = currentLessonId();
    var currentStage = current === -1 ? C.stages.length - 1 : C.lessons[current].stageId;

    if (openStages === null) {
      openStages = new Set([currentStage]);
    }

    el.plan.innerHTML = C.stages.map(function (stage) {
      var progress = stageProgress(stage.id);
      var lessons = C.lessons.filter(function (l) { return l.stageId === stage.id; });

      var rows = '';
      var lastWeek = null;
      lessons.forEach(function (lesson) {
        if (lesson.week !== lastWeek) {
          rows += '<div class="week-head">Week ' + lesson.week + '</div>';
          lastWeek = lesson.week;
        }
        var classes = 'row' +
          (doneSet.has(lesson.id) ? ' is-done' : '') +
          (lesson.id === current ? ' is-current' : '');
        rows +=
          '<button class="' + classes + '" data-lesson="' + lesson.id + '" ' +
            'aria-pressed="' + (doneSet.has(lesson.id) ? 'true' : 'false') + '">' +
            '<span class="check">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                'stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                '<path d="M5 12.5 10 17.5 19 7"/></svg>' +
            '</span>' +
            '<span class="row-text">' +
              '<span class="row-title">' + esc(lesson.title) + '</span>' +
              '<span class="row-min">' + lesson.minutes + ' min</span>' +
            '</span>' +
          '</button>';
      });

      var open = openStages.has(stage.id);
      return '<section class="stage' + (open ? ' is-open' : '') + '" data-stage="' + stage.id + '">' +
        '<button class="stage-head" data-toggle="' + stage.id + '" aria-expanded="' + open + '">' +
          '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="m9 6 6 6-6 6"/></svg>' +
          '<span class="stage-head-text">' +
            '<span class="stage-name">' + esc(stage.name) + '</span>' +
            '<span class="stage-weeks">' + esc(stage.weeks) + '</span>' +
          '</span>' +
          '<span class="stage-count">' + progress.done + '/' + progress.total + '</span>' +
        '</button>' +
        '<div class="stage-body">' +
          '<p class="stage-note">' + esc(stage.note) + '</p>' +
          rows +
        '</div>' +
      '</section>';
    }).join('');
  }

  /* ---------- setup ------------------------------------------------------- */
  /* Content below is reproduced verbatim from devops-study-hub.html. */

  function renderSetup() {
    el.setup.innerHTML =
      '<div class="card">' +
        '<h2 class="card-title">Install these once</h2>' +
        resourcesByKey(['wsl', 'vscode', 'dockerstart', 'kind', 'tf', 'awscli', 'shellcheck', 'trivy']) +
      '</div>' +

      '<div class="card">' +
        '<h2 class="card-title">On a Windows laptop</h2>' +
        '<p class="prose">Everything in this course works on Windows. Lesson 1 has you install ' +
          '<strong>WSL with Ubuntu</strong>, which gives you a real Linux terminal — after that every ' +
          'lesson works exactly as written.</p>' +
        '<p class="prose"><strong>One rule, and it is the thing that trips people up:</strong> ' +
          'do everything inside the Ubuntu terminal, never PowerShell. Install Docker, Terraform, the ' +
          'AWS CLI, ShellCheck and Trivy <em>inside Ubuntu</em> too. Install them on Windows instead and ' +
          'the commands in the lessons will not match what you type, and you will not understand why.</p>' +
        '<p class="prose" style="margin-bottom:var(--s4)">VS Code is the exception — install it on ' +
          'Windows normally, then add its WSL extension so it edits the files inside Ubuntu.</p>' +
        resourcesByKey(['wsl']) +
        WINDOWS.map(resourceHTML).join('') +
      '</div>' +

      '<div class="card card--warn">' +
        '<h2 class="card-title">Money rules — read before week 9</h2>' +
        '<div class="prose"><ul>' +
          '<li><strong>Before creating anything in AWS:</strong> turn on MFA, create a budget alert at €10, €25 and €50.</li>' +
          '<li>Delete everything at the end of each session. <code>terraform destroy</code> or delete in the console.</li>' +
          '<li>The three things that quietly cost money: NAT Gateways, idle load balancers, and EKS clusters. Never leave them overnight.</li>' +
          '<li>Check the billing page every single Sunday. Every one.</li>' +
          '<li>Weeks 1–8 cost almost nothing: a small VPS (~€5/month) and a domain (~€10/year). Everything else in that period is free.</li>' +
        '</ul></div>' +
      '</div>' +

      '<div class="card">' +
        '<h2 class="card-title">How to study</h2>' +
        '<div class="prose"><ul>' +
          '<li><strong>One lesson per day.</strong> Not two. Consistency beats intensity, and burnout is the main reason people quit at week 6.</li>' +
          '<li><strong>Type every command yourself.</strong> Copy-paste teaches nothing.</li>' +
          '<li><strong>Break things on purpose.</strong> The fix is where the learning is.</li>' +
          '<li><strong>Write notes into your GitHub repo daily.</strong> By week 16 that repo is your CV.</li>' +
          '<li><strong>If you miss a day, just continue.</strong> Don’t try to catch up — that’s how people quit.</li>' +
        '</ul></div>' +
      '</div>' +

      '<div class="card">' +
        '<h2 class="card-title">About the time estimates</h2>' +
        '<p class="prose">Each lesson shows how long it should take. Ordinary lessons land close. ' +
          '<strong>The project days do not</strong> — a lesson marked 150 minutes can easily take a ' +
          'weekend the first time, and the capstone in week 16 takes far longer than the numbers suggest. ' +
          'That is normal and it is not you being slow. Take the time the work actually needs. ' +
          'Nothing here is scored and nothing is late.</p>' +
      '</div>' +

      '<div class="card">' +
        '<h2 class="card-title">A daily nudge</h2>' +
        '<p class="prose">This app can’t send you notifications. Open your phone’s Clock app and set a ' +
          'repeating alarm for your study time — that does the same job in thirty seconds.</p>' +
      '</div>' +

      '<div class="card">' +
        '<h2 class="card-title">Extra practice (optional)</h2>' +
        resourcesByKey(['killercoda', 'roadmapproj', 'devopscube', 'kodekloud', 'workshops', 'skillbuilder']) +
      '</div>' +

      '<div class="card">' +
        '<h2 class="card-title">If you want the certification</h2>' +
        '<p class="prose" style="margin-bottom:var(--s4)">Optional. Do it after week 12, once the concepts are real. ' +
          'The exam code changes over time — check AWS’s own site before paying for any course or booking.</p>' +
        resourcesByKey(['saaguide', 'cantrill', 'skillbuilder', 'awstraining']) +
      '</div>' +

      '<div class="card">' +
        '<h2 class="card-title">After week 16</h2>' +
        '<p class="prose" style="margin-bottom:var(--s4)">Do not open these until you have finished. ' +
          'The 80 lessons are the path, and the portfolio they build is what gets you interviews. ' +
          'These are the things job adverts ask for that the course leaves out on purpose. ' +
          '<strong>Start with Python</strong> — it comes up more than anything else on this list. ' +
          'Take the rest in whatever order the jobs you are applying for happen to mention them.</p>' +
        AFTER.map(resourceHTML).join('') +
      '</div>' +

      '<div class="card">' +
        '<h2 class="card-title">Back up your progress</h2>' +
        '<p class="prose">Your progress lives only on this phone. If you clear Safari’s website data it is gone. ' +
          'Copy this code somewhere safe — notes, email, anywhere — and you can paste it back to restore everything.</p>' +
        '<code class="code-out" id="backup-code">' + esc(Store.encode(state)) + '</code>' +
        '<div class="actions" style="margin-top:0">' +
          '<button class="btn" data-act="copy-code">Copy code</button>' +
        '</div>' +
        '<div class="section-label">Restore from a code</div>' +
        '<textarea class="field" id="restore-input" rows="2" placeholder="Paste your code here" ' +
          'autocapitalize="off" autocorrect="off" spellcheck="false"></textarea>' +
        '<div class="actions" style="margin-top:0">' +
          '<button class="btn" data-act="restore">Restore progress</button>' +
        '</div>' +
      '</div>' +

      (storageOK ? '' :
        '<div class="card card--warn">' +
          '<h2 class="card-title">Progress is not saving</h2>' +
          '<p class="prose">This browser is blocking local storage, so ticks will disappear when you close the tab. ' +
            'Private browsing is the usual cause.</p>' +
        '</div>') +

      '<div class="card">' +
        '<h2 class="card-title">Start over</h2>' +
        '<p class="prose">Clears all ' + TOTAL + ' ticks and your streak. There is no undo.</p>' +
        '<div class="actions">' +
          '<button class="btn btn--quiet btn--danger" data-act="reset">Reset all progress</button>' +
        '</div>' +
      '</div>';
  }

  /* ---------- actions ----------------------------------------------------- */

  var toastTimer = null;
  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add('is-shown');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      el.toast.classList.remove('is-shown');
    }, 2200);
  }

  function completeCurrent() {
    var id = currentLessonId();
    if (id === -1) return;
    doneSet.add(id);
    Store.markActiveToday(state);
    persist();
    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Un-ticks the highest completed id — the one most recently reached. */
  function undoLast() {
    if (doneSet.size === 0) return;
    var highest = Math.max.apply(null, Array.from(doneSet));
    doneSet.delete(highest);
    persist();
    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleLesson(id) {
    if (doneSet.has(id)) {
      doneSet.delete(id);
    } else {
      doneSet.add(id);
      Store.markActiveToday(state);
    }
    persist();
    renderChrome();
    renderToday();
    renderPlan();
  }

  function copyCode() {
    var code = Store.encode(state);
    var done = function () { toast('Code copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, function () { toast('Select the code and copy it'); });
    } else {
      toast('Select the code and copy it');
    }
  }

  function restoreCode() {
    var input = document.getElementById('restore-input');
    var restored = Store.decode(input ? input.value : '');
    if (!restored) {
      toast('That code was not recognised');
      return;
    }
    state = restored;
    doneSet = new Set(state.done);
    Store.save(state);
    renderAll();
    toast('Restored ' + state.done.length + ' of ' + TOTAL + ' lessons');
  }

  function resetAll() {
    if (!window.confirm('Reset all ' + TOTAL + ' lessons and your streak? This cannot be undone.')) return;
    state = Store.emptyState();
    doneSet = new Set();
    Store.save(state);
    renderAll();
    toast('Progress reset');
  }

  /* ---------- events ------------------------------------------------------ */

  document.addEventListener('click', function (event) {
    var actionEl = event.target.closest('[data-act]');
    if (actionEl) {
      var act = actionEl.getAttribute('data-act');
      if (act === 'complete') completeCurrent();
      else if (act === 'undo') undoLast();
      else if (act === 'copy-code') copyCode();
      else if (act === 'restore') restoreCode();
      else if (act === 'reset') resetAll();
      else if (act === 'recall-yes') answerRecall(true);
      else if (act === 'recall-no') answerRecall(false);
      return;
    }

    var toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      var stageId = Number(toggle.getAttribute('data-toggle'));
      if (openStages.has(stageId)) openStages.delete(stageId); else openStages.add(stageId);
      renderPlan();
      return;
    }

    var row = event.target.closest('[data-lesson]');
    if (row) toggleLesson(Number(row.getAttribute('data-lesson')));
  });

  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      var view = tab.getAttribute('data-view');
      document.querySelectorAll('.tab').forEach(function (other) {
        var active = other === tab;
        other.classList.toggle('is-active', active);
        if (active) other.setAttribute('aria-current', 'page');
        else other.removeAttribute('aria-current');
      });
      ['today', 'plan', 'setup'].forEach(function (name) {
        el[name].hidden = (name !== view);
      });
      window.scrollTo(0, 0);
    });
  });

  /* ---------- boot -------------------------------------------------------- */

  function renderAll() {
    renderChrome();
    renderToday();
    renderPlan();
    renderSetup();
  }

  renderAll();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* offline is a bonus, not a requirement */ });
    });
  }
})();
