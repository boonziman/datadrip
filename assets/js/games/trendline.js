/* ============================================
 * Trendline — daily Higher / Lower comparison game
 * Compare two real-world data points; pick which has the higher value. Streak as long as you can.
 * Daily order is deterministic (everyone gets the same questions in the same order each day).
 * ============================================ */
(function () {
  'use strict';

  // Items: factual, ranked-by-value comparisons. Each has name, category, metric (description), value (number).
  // Values are approximate and used only for relative comparison — the *direction* of higher/lower is what matters.
  var ITEMS = [
    // Country populations (millions, ~2024)
    { name: "India",          cat: "Country",     metric: "Population (millions)", value: 1428 },
    { name: "China",          cat: "Country",     metric: "Population (millions)", value: 1411 },
    { name: "United States",  cat: "Country",     metric: "Population (millions)", value: 333 },
    { name: "Indonesia",      cat: "Country",     metric: "Population (millions)", value: 277 },
    { name: "Pakistan",       cat: "Country",     metric: "Population (millions)", value: 240 },
    { name: "Brazil",         cat: "Country",     metric: "Population (millions)", value: 215 },
    { name: "Nigeria",        cat: "Country",     metric: "Population (millions)", value: 223 },
    { name: "Bangladesh",     cat: "Country",     metric: "Population (millions)", value: 172 },
    { name: "Russia",         cat: "Country",     metric: "Population (millions)", value: 144 },
    { name: "Mexico",         cat: "Country",     metric: "Population (millions)", value: 128 },
    { name: "Japan",          cat: "Country",     metric: "Population (millions)", value: 124 },
    { name: "Germany",        cat: "Country",     metric: "Population (millions)", value: 84 },
    { name: "United Kingdom", cat: "Country",     metric: "Population (millions)", value: 67 },
    { name: "France",         cat: "Country",     metric: "Population (millions)", value: 65 },
    { name: "Canada",         cat: "Country",     metric: "Population (millions)", value: 39 },
    { name: "Australia",      cat: "Country",     metric: "Population (millions)", value: 26 },
    { name: "Iceland",        cat: "Country",     metric: "Population (millions)", value: 0.39 },

    // Companies — approximate market cap in USD billions, late-2024 era
    { name: "Apple",          cat: "Company",     metric: "Market cap (USD bn)",   value: 3400 },
    { name: "Microsoft",      cat: "Company",     metric: "Market cap (USD bn)",   value: 3100 },
    { name: "Nvidia",         cat: "Company",     metric: "Market cap (USD bn)",   value: 3000 },
    { name: "Alphabet",       cat: "Company",     metric: "Market cap (USD bn)",   value: 2100 },
    { name: "Amazon",         cat: "Company",     metric: "Market cap (USD bn)",   value: 1900 },
    { name: "Meta",           cat: "Company",     metric: "Market cap (USD bn)",   value: 1300 },
    { name: "Tesla",          cat: "Company",     metric: "Market cap (USD bn)",   value: 800 },
    { name: "Berkshire",      cat: "Company",     metric: "Market cap (USD bn)",   value: 950 },
    { name: "TSMC",           cat: "Company",     metric: "Market cap (USD bn)",   value: 900 },
    { name: "Visa",           cat: "Company",     metric: "Market cap (USD bn)",   value: 540 },
    { name: "Netflix",        cat: "Company",     metric: "Market cap (USD bn)",   value: 290 },
    { name: "Adobe",          cat: "Company",     metric: "Market cap (USD bn)",   value: 230 },
    { name: "Spotify",        cat: "Company",     metric: "Market cap (USD bn)",   value: 90 },
    { name: "Uber",           cat: "Company",     metric: "Market cap (USD bn)",   value: 150 },
    { name: "Airbnb",         cat: "Company",     metric: "Market cap (USD bn)",   value: 90 },
    { name: "Snap",           cat: "Company",     metric: "Market cap (USD bn)",   value: 18 },

    // Crypto market caps (USD bn, approx)
    { name: "Bitcoin",        cat: "Crypto",      metric: "Market cap (USD bn)",   value: 1900 },
    { name: "Ethereum",       cat: "Crypto",      metric: "Market cap (USD bn)",   value: 380 },
    { name: "BNB",            cat: "Crypto",      metric: "Market cap (USD bn)",   value: 95 },
    { name: "Solana",         cat: "Crypto",      metric: "Market cap (USD bn)",   value: 90 },
    { name: "XRP",            cat: "Crypto",      metric: "Market cap (USD bn)",   value: 70 },
    { name: "Dogecoin",       cat: "Crypto",      metric: "Market cap (USD bn)",   value: 30 },
    { name: "Cardano",        cat: "Crypto",      metric: "Market cap (USD bn)",   value: 18 },
    { name: "TRON",           cat: "Crypto",      metric: "Market cap (USD bn)",   value: 22 },
    { name: "Avalanche",      cat: "Crypto",      metric: "Market cap (USD bn)",   value: 15 },
    { name: "Chainlink",      cat: "Crypto",      metric: "Market cap (USD bn)",   value: 10 },

    // App / platform monthly users (millions)
    { name: "Facebook",       cat: "Platform",    metric: "Monthly active users (M)", value: 3070 },
    { name: "YouTube",        cat: "Platform",    metric: "Monthly active users (M)", value: 2700 },
    { name: "WhatsApp",       cat: "Platform",    metric: "Monthly active users (M)", value: 2780 },
    { name: "Instagram",      cat: "Platform",    metric: "Monthly active users (M)", value: 2400 },
    { name: "TikTok",         cat: "Platform",    metric: "Monthly active users (M)", value: 1500 },
    { name: "Telegram",       cat: "Platform",    metric: "Monthly active users (M)", value: 900 },
    { name: "Snapchat",       cat: "Platform",    metric: "Monthly active users (M)", value: 800 },
    { name: "X (Twitter)",    cat: "Platform",    metric: "Monthly active users (M)", value: 540 },
    { name: "Reddit",         cat: "Platform",    metric: "Monthly active users (M)", value: 500 },
    { name: "LinkedIn",       cat: "Platform",    metric: "Monthly active users (M)", value: 1000 },
    { name: "Pinterest",      cat: "Platform",    metric: "Monthly active users (M)", value: 500 },
    { name: "Discord",        cat: "Platform",    metric: "Monthly active users (M)", value: 200 },
    { name: "Threads",        cat: "Platform",    metric: "Monthly active users (M)", value: 175 },

    // Cities by metro area population (millions)
    { name: "Tokyo",          cat: "City",        metric: "Metro population (M)",  value: 37 },
    { name: "Delhi",          cat: "City",        metric: "Metro population (M)",  value: 33 },
    { name: "Shanghai",       cat: "City",        metric: "Metro population (M)",  value: 29 },
    { name: "São Paulo",      cat: "City",        metric: "Metro population (M)",  value: 22 },
    { name: "Mexico City",    cat: "City",        metric: "Metro population (M)",  value: 22 },
    { name: "Cairo",          cat: "City",        metric: "Metro population (M)",  value: 22 },
    { name: "Mumbai",         cat: "City",        metric: "Metro population (M)",  value: 21 },
    { name: "New York",       cat: "City",        metric: "Metro population (M)",  value: 20 },
    { name: "Istanbul",       cat: "City",        metric: "Metro population (M)",  value: 16 },
    { name: "London",         cat: "City",        metric: "Metro population (M)",  value: 14 },
    { name: "Paris",          cat: "City",        metric: "Metro population (M)",  value: 11 },
    { name: "Singapore",      cat: "City",        metric: "Metro population (M)",  value: 6 },
    { name: "Reykjavík",      cat: "City",        metric: "Metro population (M)",  value: 0.24 }
  ];

  function init() {
    if (!window.DD) return setTimeout(init, 30);
    var mount = document.getElementById('game-mount');
    if (!mount) return;

    DD.wireRules(
      '<p>Two real things. Pick which one has the higher value for the metric shown.</p>' +
      '<ul>' +
      '<li>Each round mixes the same metric (population, market cap, users, etc).</li>' +
      '<li>Get one wrong and the round ends.</li>' +
      '<li>10-round daily challenge — same questions for everyone, same order.</li>' +
      '<li>Values are approximate and based on public data; we round for clarity.</li>' +
      '</ul>'
    );

    var day = DD.getPuzzleDay();
    DD.paintDate(day);

    var ROUND_LEN = 10;
    var prng = DD.rng((day + 1) * 2654435761);

    // Build rounds: each round picks 2 items in the same category with different values.
    var byCat = {};
    ITEMS.forEach(function (it) { (byCat[it.cat] = byCat[it.cat] || []).push(it); });

    var rounds = [];
    var attempts = 0;
    while (rounds.length < ROUND_LEN && attempts < 200) {
      attempts++;
      var cats = Object.keys(byCat);
      var cat = cats[Math.floor(prng() * cats.length)];
      var pool = byCat[cat];
      if (pool.length < 2) continue;
      var ai = Math.floor(prng() * pool.length);
      var bi = Math.floor(prng() * pool.length);
      if (ai === bi) continue;
      var a = pool[ai], b = pool[bi];
      if (a.value === b.value) continue;
      // Avoid trivial 100x differences; aim for at most 50x ratio
      var hi = Math.max(a.value, b.value), lo = Math.min(a.value, b.value);
      if (hi / lo > 80) continue;
      rounds.push({ a: a, b: b });
    }

    var saved = DD.loadState('trendline', day) || { idx: 0, score: 0, finished: false, won: false, history: [] };
    var state = {
      idx: saved.idx,
      score: saved.score,
      finished: saved.finished,
      won: saved.won,
      history: saved.history.slice()
    };

    mount.innerHTML =
      '<div class="tl-wrap">' +
        '<div class="tl-score-bar">' +
          '<div class="tl-stat-block"><div class="num" id="tl-score">' + state.score + '</div><div class="lbl">Streak</div></div>' +
          '<div class="tl-stat-block"><div class="num" id="tl-round">' + Math.min(state.idx + 1, ROUND_LEN) + '/' + ROUND_LEN + '</div><div class="lbl">Round</div></div>' +
          '<div class="tl-stat-block"><div class="num">' + ROUND_LEN + '</div><div class="lbl">Total</div></div>' +
        '</div>' +
        '<div class="tl-arena" id="tl-arena"></div>' +
      '</div>';

    var arena = document.getElementById('tl-arena');
    var scoreEl = document.getElementById('tl-score');
    var roundEl = document.getElementById('tl-round');

    function fmt(v) {
      if (v >= 1000) return (v).toLocaleString(undefined, { maximumFractionDigits: 0 });
      if (v >= 10) return v.toFixed(0);
      return v.toFixed(2);
    }

    function renderRound() {
      if (state.finished || state.idx >= rounds.length) return endGame();
      var r = rounds[state.idx];
      arena.innerHTML =
        '<div class="tl-side" data-side="a">' +
          '<p class="tl-side-eyebrow">' + DD.escapeHtml(r.a.cat) + '</p>' +
          '<h3 class="tl-side-name">' + DD.escapeHtml(r.a.name) + '</h3>' +
          '<p class="tl-side-metric">' + DD.escapeHtml(r.a.metric) + '</p>' +
          '<div class="tl-value-display" data-value-a>?</div>' +
          '<div class="tl-buttons">' +
            '<button class="tl-btn tl-btn--higher" data-pick="a-higher" type="button">Higher</button>' +
            '<button class="tl-btn tl-btn--lower" data-pick="a-lower" type="button">Lower</button>' +
          '</div>' +
        '</div>' +
        '<div class="tl-vs">VS</div>' +
        '<div class="tl-side" data-side="b">' +
          '<p class="tl-side-eyebrow">' + DD.escapeHtml(r.b.cat) + '</p>' +
          '<h3 class="tl-side-name">' + DD.escapeHtml(r.b.name) + '</h3>' +
          '<p class="tl-side-metric">' + DD.escapeHtml(r.b.metric) + '</p>' +
          '<div class="tl-value-display" data-value-b>' + fmt(r.b.value) + '</div>' +
          '<div class="tl-buttons" style="visibility:hidden">' +
            '<button class="tl-btn" type="button">·</button>' +
          '</div>' +
        '</div>';
      scoreEl.textContent = state.score;
      roundEl.textContent = (state.idx + 1) + '/' + ROUND_LEN;

      arena.querySelectorAll('[data-pick]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var pick = btn.dataset.pick;          // 'a-higher' | 'a-lower'
          var aHigher = r.a.value > r.b.value;
          var correct = (pick === 'a-higher' && aHigher) || (pick === 'a-lower' && !aHigher);
          // reveal A
          arena.querySelector('[data-value-a]').textContent = fmt(r.a.value);
          arena.querySelectorAll('.tl-btn').forEach(function (b) { b.disabled = true; });
          state.history.push(correct ? '✅' : '❌');
          if (correct) {
            state.score++;
            state.idx++;
            DD.saveState('trendline', day, state);
            setTimeout(function () { renderRound(); }, 950);
          } else {
            state.finished = true;
            state.won = state.score >= ROUND_LEN;
            DD.saveState('trendline', day, state);
            DD.recordResult('trendline', day, state.won);
            setTimeout(function () { endGame(); }, 1100);
          }
        });
      });

      // If somehow score reaches ROUND_LEN, finish as a win
      if (state.score >= ROUND_LEN) {
        state.finished = true; state.won = true;
        DD.saveState('trendline', day, state);
        DD.recordResult('trendline', day, true);
        setTimeout(endGame, 800);
      }
    }

    function endGame() {
      var stats = DD.loadStats('trendline');
      var line = 'Trendline · Day ' + day + ' · ' + state.score + '/' + ROUND_LEN;
      var share = line + '\n' + state.history.join('') + '\nhttps://datadripco.com/puzzles/trendline/';
      var panel = DD.buildResultPanel({
        won: state.score >= ROUND_LEN,
        title: state.score >= ROUND_LEN ? 'Perfect run!' : 'Round over',
        answer: state.score + ' correct',
        stats: [
          { v: stats.played, l: 'Played' },
          { v: stats.bestStreak, l: 'Best ever' },
          { v: stats.played ? Math.round((stats.wins/stats.played)*100) + '%' : '0%', l: 'Perfect %' }
        ],
        shareText: share
      });
      mount.parentNode.appendChild(panel);
    }

    if (state.finished || state.idx >= ROUND_LEN) endGame();
    else renderRound();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
