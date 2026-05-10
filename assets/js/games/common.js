/* ============================================
 * Datadripco — Games shared utilities
 * Provides: daily seed, deterministic PRNG, localStorage helpers,
 *           toast, share-to-clipboard, countdown to next puzzle.
 * Exposed on window.DD
 * ============================================ */
(function () {
  'use strict';

  /** Days since 1970-01-01 (UTC) for the player's local calendar day. */
  function daysSinceEpoch(date) {
    var d = date || new Date();
    return Math.floor(
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000
    );
  }

  /** Mulberry32 PRNG — deterministic, fast, good distribution. */
  function rng(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) >>> 0;
      var x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, prng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(prng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /**
   * Resolve "puzzle day" — supports ?day=N (offset) or ?day=YYYY-MM-DD.
   * Returns the integer day index used to seed everything.
   */
  function getPuzzleDay() {
    var params = new URLSearchParams(window.location.search);
    var override = params.get('day');
    if (override !== null && override !== '') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(override)) {
        var d = new Date(override + 'T00:00:00');
        return daysSinceEpoch(d);
      }
      var n = parseInt(override, 10);
      if (!isNaN(n)) return n;
    }
    return daysSinceEpoch();
  }

  /** Stable storage key per game + day. */
  function dayKey(gameSlug, day) {
    return 'dd:' + gameSlug + ':' + day;
  }

  function loadState(gameSlug, day) {
    try {
      var raw = localStorage.getItem(dayKey(gameSlug, day));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveState(gameSlug, day, state) {
    try { localStorage.setItem(dayKey(gameSlug, day), JSON.stringify(state)); } catch (e) {}
  }
  function clearState(gameSlug, day) {
    try { localStorage.removeItem(dayKey(gameSlug, day)); } catch (e) {}
  }

  /** Streak/stats per game (cumulative across days). */
  function statsKey(gameSlug) { return 'dd:' + gameSlug + ':stats'; }
  function loadStats(gameSlug) {
    try {
      var raw = localStorage.getItem(statsKey(gameSlug));
      return raw ? JSON.parse(raw) : { played: 0, wins: 0, streak: 0, bestStreak: 0, lastWonDay: null };
    } catch (e) { return { played: 0, wins: 0, streak: 0, bestStreak: 0, lastWonDay: null }; }
  }
  function saveStats(gameSlug, s) {
    try { localStorage.setItem(statsKey(gameSlug), JSON.stringify(s)); } catch (e) {}
  }
  function recordResult(gameSlug, day, won) {
    var s = loadStats(gameSlug);
    s.played++;
    if (won) {
      s.wins++;
      if (s.lastWonDay === day - 1) s.streak++;
      else s.streak = 1;
      if (s.streak > s.bestStreak) s.bestStreak = s.streak;
      s.lastWonDay = day;
    } else {
      s.streak = 0;
    }
    saveStats(gameSlug, s);
    return s;
  }

  /** Toast (single-fire, soft-fade). */
  var toastTimer = null;
  function toast(msg, ms) {
    var el = document.getElementById('game-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 1800);
  }

  /** Copy to clipboard (with graceful fallback). */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function(){return true;}).catch(function(){return false;});
    }
    return new Promise(function (resolve) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        resolve(true);
      } catch (e) { resolve(false); }
    });
  }

  /** Format the puzzle date (and "Day #" for share). */
  function formatPuzzleDate(day) {
    var d = new Date(day * 86400000);
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  /** Display today's date + a small dev marker if ?day was used. */
  function paintDate(day) {
    var el = document.getElementById('puzzle-date');
    if (!el) return;
    el.textContent = formatPuzzleDate(day);
    var today = daysSinceEpoch();
    if (day !== today) {
      var diff = day - today;
      var note = document.createElement('span');
      note.style.cssText = 'margin-left:8px;color:#dc2626;font-weight:700;';
      note.textContent = '· DEV: ' + (diff > 0 ? '+' + diff : diff) + ' day' + (Math.abs(diff) === 1 ? '' : 's');
      el.appendChild(note);
    }
  }

  /** Countdown to next puzzle (local midnight). */
  function startCountdown(targetEl) {
    if (!targetEl) return;
    function tick() {
      var now = new Date();
      var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
      var diff = Math.max(0, next - now);
      var h = Math.floor(diff / 3600000);
      var m = Math.floor((diff % 3600000) / 60000);
      var s = Math.floor((diff % 60000) / 1000);
      targetEl.textContent = ('00'+h).slice(-2) + ':' + ('00'+m).slice(-2) + ':' + ('00'+s).slice(-2);
    }
    tick();
    return setInterval(tick, 1000);
  }

  /** Build a result panel (DOM) shared by every game. */
  function buildResultPanel(opts) {
    // opts: { won, title, answer, stats:[{v,l}], shareText, day, gameName }
    var panel = document.createElement('div');
    panel.className = 'result-panel';
    var heading = opts.won ? '🎉 ' + (opts.title || 'You got it!') : '😶 ' + (opts.title || 'Better luck tomorrow');
    var html = '<h3>' + escapeHtml(heading) + '</h3>';
    if (opts.answer) html += '<div class="result-answer">' + escapeHtml(opts.answer) + '</div>';
    if (opts.stats && opts.stats.length) {
      html += '<div class="result-stats">';
      opts.stats.forEach(function (s) {
        html += '<div class="result-stat"><div class="v">' + escapeHtml(String(s.v)) + '</div><div class="l">' + escapeHtml(s.l) + '</div></div>';
      });
      html += '</div>';
    }
    if (opts.shareText) {
      html += '<pre class="result-share">' + escapeHtml(opts.shareText) + '</pre>';
    }
    html += '<div class="result-actions">';
    html += '<button class="btn btn-primary" data-action="share">Share result</button>';
    html += '<a class="btn btn-secondary" href="/puzzles/">More puzzles</a>';
    html += '</div>';
    html += '<div class="result-countdown">Next puzzle in <span data-countdown>--:--:--</span></div>';
    panel.innerHTML = html;

    panel.querySelector('[data-action="share"]').addEventListener('click', function () {
      copyText(opts.shareText || '').then(function (ok) {
        toast(ok ? 'Copied to clipboard!' : 'Could not copy — long-press to select');
      });
    });
    startCountdown(panel.querySelector('[data-countdown]'));
    return panel;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  /** Wire global "How to play" button & rules panel. */
  function wireRules(rulesHtml) {
    var btn = document.getElementById('btn-howto');
    var panel = document.getElementById('rules-panel');
    var body = document.getElementById('rules-body');
    var close = document.getElementById('btn-rules-close');
    if (!btn || !panel || !body) return;
    body.innerHTML = rulesHtml;
    btn.addEventListener('click', function () { panel.hidden = !panel.hidden; if (!panel.hidden) panel.scrollIntoView({behavior:'smooth', block:'start'}); });
    if (close) close.addEventListener('click', function () { panel.hidden = true; });
  }

  window.DD = {
    daysSinceEpoch: daysSinceEpoch,
    rng: rng,
    shuffle: shuffle,
    getPuzzleDay: getPuzzleDay,
    loadState: loadState,
    saveState: saveState,
    clearState: clearState,
    loadStats: loadStats,
    saveStats: saveStats,
    recordResult: recordResult,
    toast: toast,
    copyText: copyText,
    formatPuzzleDate: formatPuzzleDate,
    paintDate: paintDate,
    startCountdown: startCountdown,
    buildResultPanel: buildResultPanel,
    escapeHtml: escapeHtml,
    wireRules: wireRules
  };
})();
