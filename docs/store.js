/* ==========================================================================
   Cloud Path — storage, streak arithmetic, backup codes.
   No DOM access lives in this file. Rendering code calls in; it never reaches
   into localStorage directly.
   ========================================================================== */

window.Store = (function () {
  'use strict';

  var KEY = 'cloudpath.v1';
  var CODE_PREFIX = 'CP1';

  function lessonCount() {
    return (window.CURRICULUM && window.CURRICULUM.lessons.length) || 80;
  }

  /* ---------- dates: device-local, no timezone conversion ---------------- */

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /** Local calendar day as YYYY-MM-DD. */
  function dayKey(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** Whole days from key `a` to key `b`. Parsed as local dates, never UTC. */
  function daysBetween(a, b) {
    var pa = a.split('-'), pb = b.split('-');
    var da = new Date(+pa[0], +pa[1] - 1, +pa[2]);
    var db = new Date(+pb[0], +pb[1] - 1, +pb[2]);
    return Math.round((db - da) / 86400000);
  }

  function isDayKey(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  /* ---------- state ------------------------------------------------------ */

  /**
   * Spacing ladder, in days. A lesson answered "still got it" moves up a rung
   * and comes back later; "not really" drops it to the bottom and it returns
   * tomorrow. Standard expanding-interval retrieval practice.
   */
  var LADDER = [2, 4, 8, 16, 32];

  /** How many of the most recent completions are too fresh to be worth asking. */
  var TOO_FRESH = 2;

  function emptyState() {
    return {
      done: [],
      streak: { current: 0, longest: 0, last: null },
      // lessonId -> { seen: 'YYYY-MM-DD', level: 0..LADDER.length-1 }
      review: {},
      // The day the last recall was answered. At most one per day — several
      // prompts can be due at once, and marching through them would turn a
      // gentle nudge into a drill.
      recallDay: null,
    };
  }

  /** Coerces anything into a valid state. Never throws, never returns null. */
  function sanitise(raw) {
    var state = emptyState();
    if (!raw || typeof raw !== 'object') return state;

    var max = lessonCount();
    if (Array.isArray(raw.done)) {
      var seen = {};
      raw.done.forEach(function (id) {
        if (Number.isInteger(id) && id >= 0 && id < max && !seen[id]) {
          seen[id] = true;
          state.done.push(id);
        }
      });
      state.done.sort(function (a, b) { return a - b; });
    }

    var s = raw.streak;
    if (s && typeof s === 'object') {
      if (Number.isInteger(s.current) && s.current >= 0) state.streak.current = s.current;
      if (Number.isInteger(s.longest) && s.longest >= 0) state.streak.longest = s.longest;
      if (isDayKey(s.last)) state.streak.last = s.last;
    }
    if (state.streak.longest < state.streak.current) {
      state.streak.longest = state.streak.current;
    }

    if (isDayKey(raw.recallDay)) state.recallDay = raw.recallDay;

    if (raw.review && typeof raw.review === 'object' && !Array.isArray(raw.review)) {
      Object.keys(raw.review).forEach(function (key) {
        var id = Number(key);
        var entry = raw.review[key];
        if (!Number.isInteger(id) || id < 0 || id >= max) return;
        if (!entry || typeof entry !== 'object') return;
        if (!isDayKey(entry.seen)) return;
        var level = Number.isInteger(entry.level) ? entry.level : 0;
        state.review[id] = {
          seen: entry.seen,
          level: Math.min(Math.max(level, 0), LADDER.length - 1),
        };
      });
    }
    return state;
  }

  function load() {
    try {
      return sanitise(JSON.parse(window.localStorage.getItem(KEY)));
    } catch (e) {
      return emptyState();
    }
  }

  /** Returns true when the write landed. False means storage is unavailable. */
  function save(state) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({
        v: 1,
        done: state.done,
        streak: state.streak,
        review: state.review,
        recallDay: state.recallDay,
      }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function storageWorks() {
    try {
      var probe = KEY + '.probe';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- streak ----------------------------------------------------- */

  /**
   * Records that a lesson was completed today.
   *   - one or more completions in a day counts once
   *   - a consecutive day increments
   *   - any gap restarts at 1
   *   - longest never decreases
   */
  function markActiveToday(state, today) {
    var key = today || dayKey();
    var last = state.streak.last;

    if (last === key) return state;

    if (last && daysBetween(last, key) === 1) {
      state.streak.current += 1;
    } else {
      state.streak.current = 1;
    }
    state.streak.last = key;
    if (state.streak.current > state.streak.longest) {
      state.streak.longest = state.streak.current;
    }
    return state;
  }

  /**
   * The streak as it should be displayed right now. A stored streak whose last
   * active day is older than yesterday has already been broken, so it reads 0
   * without needing anything to run in the background.
   */
  function currentStreak(state, today) {
    if (!state.streak.last) return 0;
    var gap = daysBetween(state.streak.last, today || dayKey());
    return (gap === 0 || gap === 1) ? state.streak.current : 0;
  }

  /* ---------- backup code ------------------------------------------------ */
  /* CP1-<80-bit completion bitfield in hex>-<current>-<longest>-<YYYYMMDD|0> */

  function encode(state) {
    var bytes = new Array(Math.ceil(lessonCount() / 8)).fill(0);
    state.done.forEach(function (id) {
      bytes[Math.floor(id / 8)] |= (1 << (id % 8));
    });
    var hex = bytes.map(function (b) { return pad2hex(b); }).join('');
    var last = state.streak.last ? state.streak.last.replace(/-/g, '') : '0';
    return [CODE_PREFIX, hex, state.streak.current, state.streak.longest, last].join('-');
  }

  function pad2hex(n) {
    var h = n.toString(16);
    return h.length < 2 ? '0' + h : h;
  }

  /** Returns a state, or null when the code is not one of ours. */
  function decode(code) {
    if (typeof code !== 'string') return null;
    var parts = code.trim().replace(/\s+/g, '').split('-');
    if (parts.length !== 5 || parts[0].toUpperCase() !== CODE_PREFIX) return null;

    var hex = parts[1].toLowerCase();
    var byteCount = Math.ceil(lessonCount() / 8);
    if (!/^[0-9a-f]+$/.test(hex) || hex.length !== byteCount * 2) return null;

    var current = parseInt(parts[2], 10);
    var longest = parseInt(parts[3], 10);
    if (!Number.isInteger(current) || !Number.isInteger(longest)) return null;

    var done = [];
    for (var i = 0; i < byteCount; i++) {
      var byte = parseInt(hex.substr(i * 2, 2), 16);
      for (var bit = 0; bit < 8; bit++) {
        if (byte & (1 << bit)) done.push(i * 8 + bit);
      }
    }

    var last = null;
    if (/^\d{8}$/.test(parts[4])) {
      last = parts[4].slice(0, 4) + '-' + parts[4].slice(4, 6) + '-' + parts[4].slice(6, 8);
    }

    return sanitise({ done: done, streak: { current: current, longest: longest, last: last } });
  }

  /* ---------- retrieval practice ----------------------------------------- */

  /**
   * Chooses one already-completed lesson worth re-checking today, or null when
   * nothing is due. The most overdue wins; ties go to the earliest lesson,
   * because the oldest material has decayed longest.
   *
   * The newest few completions are skipped — asking whether you remember
   * something you did yesterday tests nothing.
   */
  function pickReview(state, today) {
    var key = today || dayKey();
    if (state.recallDay === key) return null;

    var eligible = state.done.slice(0, Math.max(0, state.done.length - TOO_FRESH));

    var best = null;
    var bestOverdue = -1;

    eligible.forEach(function (id) {
      var entry = state.review[id];
      var overdue;
      if (!entry) {
        // Never reviewed. Treat as long overdue so early lessons surface first.
        overdue = Number.MAX_SAFE_INTEGER - id;
      } else {
        var elapsed = daysBetween(entry.seen, key);
        var interval = LADDER[entry.level];
        if (elapsed < interval) return;
        overdue = elapsed - interval;
      }
      if (overdue > bestOverdue) {
        bestOverdue = overdue;
        best = id;
      }
    });

    return best;
  }

  /**
   * Records an honest self-assessment. `remembered` true moves the lesson up
   * the spacing ladder; false drops it to the bottom so it returns tomorrow.
   */
  function recordReview(state, id, remembered, today) {
    var key = today || dayKey();
    var entry = state.review[id] || { level: 0 };
    var level = remembered ? Math.min(entry.level + 1, LADDER.length - 1) : 0;
    state.review[id] = { seen: key, level: level };
    state.recallDay = key;
    return state;
  }

  return {
    load: load,
    save: save,
    pickReview: pickReview,
    recordReview: recordReview,
    LADDER: LADDER,
    TOO_FRESH: TOO_FRESH,
    storageWorks: storageWorks,
    emptyState: emptyState,
    sanitise: sanitise,
    dayKey: dayKey,
    daysBetween: daysBetween,
    markActiveToday: markActiveToday,
    currentStreak: currentStreak,
    encode: encode,
    decode: decode,
  };
})();
