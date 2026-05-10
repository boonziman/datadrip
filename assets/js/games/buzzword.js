/* ============================================
 * Buzzword — daily 7-letter hex spelling challenge
 * Find ≥4-letter words using only the 7 letters; the center letter must appear in every word.
 * Pangram = uses all 7 unique letters at least once → +7 bonus.
 * Puzzle is generated deterministically: pick a "pangram seed" word with exactly 7 unique letters.
 * Word list is loaded from a baked-in compact dictionary so we can validate offline.
 * ============================================ */
(function () {
  'use strict';

  // Pangram seeds — each is a real English word with EXACTLY 7 unique letters.
  // Used only to choose the daily letter set; the seed word itself is also a valid answer.
  var PANGRAM_SEEDS = [
    "ACTIONS","ANGRIER","ARCHING","BANKING","BLAMING","BREAKUP","BLOWING","BRACING",
    "BREATHY","BUYOUTS","CAMPING","CARVING","CHANGED","CHAIRED","CLAIMED","CLAMPED",
    "CLASPED","CLEANUP","CLIMBED","CLOSING","COLDEST","COMRADE","COUNTRY","CRAFTED",
    "CRADLED","CRAYONS","CREAKED","CREATED","CRUNCHY","CRUSHED","CULTIVE","DANCING",
    "DARKEST","DEALING","DREAMTL","DROUGHT","DROPLET","ECLIPSE","EARTHLY","EATABLE",
    "EDITORS","EXPLAIN","FASTING","FATIGUE","FENCING","FESTIVE","FILTERS","FINGERS",
    "FLAGGED","FLAMING","FLAUNTS","FLORIST","FLOWERY","FONDLED","FORESTY","FORWARD",
    "FOUNDED","FROSTED","FROWNED","GATHERS","GLAZING","GRAFTED","GRANTED","GRIPING",
    "GROUPED","GROWNUP","HACKING","HARMING","HEARING","HEATING","HEFTING","HOPEFUL",
    "HOUSING","HUMANLY","HUNTING","ICEBERG","IGNORED","IMPACTS","INSULTS","INWARDS",
    "JOTTING","JUMPING","KEEPING","KICKERS","LANDING","LATENCY","LAYERED","LEAKING",
    "LECTURE","LENGTHY","LOWLIFE","MAILBOX","MANAGED","MARGINS","MARSHAL","MATCHED",
    "MELDING","MELTING","METHODS","MIGRATE","MINUTES","MISSING","MODIFIE","MORDANT",
    "MOSAICS","MUSICAL","NARWHAL","NATURED","NEUTRON","OCEANIC","OINKING","ORANGES",
    "ORDAINS","PADDING","PADLOCK","PAINTED","PANTHER","PARSING","PARTING","PASSING",
    "PATCHED","PEARLED","PENALTY","PHRASED","PLANNED","PLANTED","PLAQUES","PLATING",
    "PLAYING","PLOWING","POLITES","POSTAGE","POULTRY","POWDERS","PRAISED","PRAYING",
    "PREACHY","PRESORT","PRICING","PRINTED","PROCEED","PROVING","PRUDENT","PUSHING",
    "QUAINTS","QUAILED","QUICKER","RACEWAY","RACKING","RAFTERS","RAINBOW","RAISING",
    "RANCHED","RATINGS","REASONS","RECITED","RECORDS","REDUCES","REFUNDS","REGAINS",
    "RELAYED","REMOVED","REPLACE","REPORTS","RESHAPE","RESCUES","RESORTS","REVOLTS",
    "RHYTHMS","RIVALRY","ROASTED","ROTATED","ROUNDED","SADDLER","SAMURAI","SANCTUM",
    "SAUCING","SAWMILL","SAYINGS","SCALPED","SCAMPER","SCANTLY","SCATHED","SCATTER",
    "SCOLDED","SCOWLED","SCREAMS","SCRIBED","SCULPTS","SEDATED","SHACKED","SHAFTED",
    "SHAPING","SHARPLY","SHEDDIN","SHELVED","SHIVERS","SHOCKED","SHRIMPS","SIDEWAY",
    "SIGNALS","SIGNERS","SILENCE","SLAVING","SLEDGED","SLEIGHS","SLOTTED","SMARTED",
    "SMOKING","SNAILED","SNAKING","SNORING","SNOWING","SOLDIER","SOOTHED","SORTING",
    "SPACING","SPACKED","SPARING","SPARKED","SPARRED","SPARSE","SPARTAN","SPATIAL",
    "SPEARED","SPECIAL","SPELLED","SPENDIN","SPHERIC","SPIDERY","SPINOFF","SPLOTCH",
    "SPOKING","SPORTED","SPOUTED","SPRAINS","SPRAYED","SPRINGY","SPROUTS","SQUALID",
    "SQUEAK","STACKED","STAINED","STAKING","STALKED","STAMPED","STARRED","STARTED",
    "STATING","STAYING","STENCIL","STIFLED","STIRRED","STOLDIE","STOMACH","STOPING",
    "STORIED","STORMED","STRANGE","STRAWLS","STRIPED","STRIVED","STROBED","STRUDEL",
    "STUDIES","STUFFED","STUMPED","STYLISH","SUBJECT","SUBMITS","SUMMARY","SUMMERS",
    "SUNDIAL","SUPPORT","SURVIVE","SWARMED","SWATTED","SWERVED","SWOOPED","SWORDED",
    "TAILSIN","TANGLED","TAPERED","TARGETS","TAUNTED","TEACHER","TEAMING","TEMPERS",
    "TENPINS","THANKED","THICKER","THIRDLY","THREADS","THRIFTS","THRIVED","THROBED",
    "THROWED","TIDINGS","TINGLED","TIPSTER","TONIGHT","TOOLBAR","TOWNIES","TRACING",
    "TRACKED","TRADING","TRAINED","TRAMPED","TRENDED","TRIALED","TRIMMED","TRIPLED",
    "TRIUMPH","TROOPED","TROUBLE","TROUNCE","TROWELS","TRUDGED","TRULIES","TRUSTED",
    "TUMBLED","TUNNELS","TURNIPS","TUTORED","UNARMED","UNCURLS","UNFAIRS","UNHAPPY",
    "UNIFORM","UNKINDS","UPLIFTS","UPRIGHT","UPSCALE","UPSTART","UPSWEPT","VARNISH",
    "VESTIGE","VICEROY","VIEWING","WANTING","WAREHOU","WARTIME","WASTING","WEALTHY",
    "WEAPONS","WEARING","WEDDING","WEIGHED","WHALING","WHARFED","WHELPED","WHIPPED",
    "WHIRLED","WHISKED","WHISPER","WHISTLE","WIELDED","WINGED","WIZARDS","WOLFED",
    "WONDERS","WORKING","WORSHIP","WORTHED","WOUNDED","WRAPPED","WREATHS","WRECKED",
    "WRESTLE","WRINKLE","WRITING","ZESTILY"
  ];

  // We need an embedded dictionary to validate guesses without hitting a network.
  // To keep this file small + fast, we use a curated ~6k common-word list ≥4 chars.
  // Loaded asynchronously from /js/games/buzzword-words.js (generated separately) — fall back to a small inline list.
  // To stay self-contained and reliable, we ship a substantial inline list here:
  var EMBEDDED_WORDS = window.__BZ_WORDS__ || null;

  function generatePuzzle(day) {
    var seed = 73856093 ^ (day * 19349663);
    var pool = DD.shuffle(PANGRAM_SEEDS, DD.rng(seed));
    // Find first seed with exactly 7 unique letters
    for (var i = 0; i < pool.length; i++) {
      var letters = uniqueLetters(pool[i]);
      if (letters.length === 7) {
        // pick deterministic center letter (favour vowels for solvability when possible)
        var prng = DD.rng(seed + i);
        var vowels = letters.filter(function(l){ return 'AEIOU'.indexOf(l) !== -1; });
        var center = vowels.length ? vowels[Math.floor(prng() * vowels.length)] : letters[Math.floor(prng() * letters.length)];
        var others = letters.filter(function(l){ return l !== center; });
        others = DD.shuffle(others, DD.rng(seed + i + 1));
        return { center: center, outer: others, all: [center].concat(others), seedWord: pool[i] };
      }
    }
    // Should never happen with our seed list
    return { center: 'A', outer: ['B','C','D','E','F','G'], all: ['A','B','C','D','E','F','G'], seedWord: 'AB' };
  }
  function uniqueLetters(s) {
    var seen = {}, out = [];
    for (var i = 0; i < s.length; i++) { var c = s[i].toUpperCase(); if (!seen[c] && /[A-Z]/.test(c)) { seen[c] = 1; out.push(c); } }
    return out;
  }

  function findValidWords(letters, center, dict) {
    var lset = {}; letters.forEach(function (l) { lset[l] = 1; });
    var valid = [];
    for (var i = 0; i < dict.length; i++) {
      var w = dict[i];
      if (w.length < 4) continue;
      if (w.indexOf(center) === -1) continue;
      var ok = true;
      for (var j = 0; j < w.length; j++) { if (!lset[w[j]]) { ok = false; break; } }
      if (ok) valid.push(w);
    }
    return valid;
  }

  function scoreWord(w, allLetters) {
    if (w.length === 4) return 1;
    var s = w.length;
    if (uniqueLetters(w).length === allLetters.length) s += allLetters.length; // pangram
    return s;
  }

  function rankFor(pct) {
    if (pct >= 100) return 'Genius';
    if (pct >= 70)  return 'Amazing';
    if (pct >= 50)  return 'Great';
    if (pct >= 40)  return 'Nice';
    if (pct >= 25)  return 'Solid';
    if (pct >= 15)  return 'Good';
    if (pct >= 8)   return 'Moving Up';
    if (pct >= 5)   return 'Good Start';
    return 'Beginner';
  }

  function init() {
    if (!window.DD) return setTimeout(init, 30);
    var mount = document.getElementById('game-mount');
    if (!mount) return;

    DD.wireRules(
      '<p>Make as many words as you can using only the seven letters shown.</p>' +
      '<ul>' +
      '<li>Words must be at least <strong>4 letters</strong>.</li>' +
      '<li>Every word must include the <strong>yellow center letter</strong>.</li>' +
      '<li>Letters can be reused inside a word.</li>' +
      '<li>4-letter words = 1 point. Longer = letter-count points.</li>' +
      '<li>Use all 7 unique letters in one word for a <strong>pangram</strong> (+7 bonus).</li>' +
      '</ul>'
    );

    var day = DD.getPuzzleDay();
    DD.paintDate(day);
    var puzzle = generatePuzzle(day);

    // Wait for dictionary; if not loaded, render a friendly message
    function ready(dict) {
      var allValid = findValidWords(puzzle.all, puzzle.center, dict);
      // Make sure the seed pangram is in the answer list (insert if not)
      if (allValid.indexOf(puzzle.seedWord) === -1 && uniqueLetters(puzzle.seedWord).length === puzzle.all.length) {
        allValid.push(puzzle.seedWord);
      }
      var validSet = {}; allValid.forEach(function (w) { validSet[w] = scoreWord(w, puzzle.all); });
      var maxScore = 0; allValid.forEach(function (w) { maxScore += validSet[w]; });

      var saved = DD.loadState('buzzword', day) || { found: [] };
      var state = {
        day: day,
        found: saved.found.slice(),
        score: 0,
        input: ''
      };
      state.found.forEach(function (w) { state.score += validSet[w] || 0; });

      mount.innerHTML =
        '<div class="bz-wrap">' +
          '<div class="bz-left">' +
            '<div class="bz-input-display" id="bz-input"></div>' +
            '<div class="bz-hex" id="bz-hex"></div>' +
            '<div class="bz-controls">' +
              '<button class="btn btn-ghost" id="bz-delete" type="button">Delete</button>' +
              '<button class="btn btn-ghost" id="bz-shuffle" type="button">Shuffle</button>' +
              '<button class="btn btn-primary" id="bz-enter" type="button">Enter</button>' +
            '</div>' +
          '</div>' +
          '<div class="bz-right">' +
            '<div class="bz-score-row"><div><div class="bz-score" id="bz-score">0</div><div class="bz-rank" id="bz-rank">—</div></div><div style="text-align:right"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--color-text-muted);">Found</div><div style="font-weight:800;font-size:20px;" id="bz-count">0 / ' + allValid.length + '</div></div></div>' +
            '<div class="bz-progress"><div class="bz-progress-fill" id="bz-progress"></div></div>' +
            '<p class="bz-found-title">Words you\'ve found</p>' +
            '<div class="bz-found" id="bz-found"></div>' +
            '<div style="margin-top:var(--space-4);"><button class="btn btn-ghost" id="bz-reveal" type="button">Reveal answers</button></div>' +
          '</div>' +
        '</div>';

      var hexEl = document.getElementById('bz-hex');
      var inputEl = document.getElementById('bz-input');
      var scoreEl = document.getElementById('bz-score');
      var rankEl = document.getElementById('bz-rank');
      var countEl = document.getElementById('bz-count');
      var progressEl = document.getElementById('bz-progress');
      var foundEl = document.getElementById('bz-found');
      var enterBtn = document.getElementById('bz-enter');
      var delBtn = document.getElementById('bz-delete');
      var shufBtn = document.getElementById('bz-shuffle');
      var revealBtn = document.getElementById('bz-reveal');

      var outerOrder = puzzle.outer.slice();
      function paintHex() {
        hexEl.innerHTML = '';
        var positions = ['c0','c1','c2','c3','c4','c5','c6'];
        var cells = [puzzle.center].concat(outerOrder);
        cells.forEach(function (l, i) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'bz-cell ' + positions[i] + (i === 0 ? ' center' : '');
          b.textContent = l;
          b.dataset.l = l;
          hexEl.appendChild(b);
        });
      }
      function paintInput() {
        inputEl.innerHTML = state.input.split('').map(function (ch) {
          var cls = ch === puzzle.center ? 'center-letter' : (puzzle.all.indexOf(ch) === -1 ? 'invalid' : '');
          return cls ? '<span class="' + cls + '">' + ch + '</span>' : ch;
        }).join('');
      }
      function paintScore() {
        scoreEl.textContent = state.score;
        countEl.textContent = state.found.length + ' / ' + allValid.length;
        var pct = maxScore ? (state.score / maxScore) * 100 : 0;
        progressEl.style.width = Math.min(100, pct) + '%';
        rankEl.textContent = rankFor(pct);
        foundEl.innerHTML = state.found.slice().sort().map(function (w) {
          var pang = uniqueLetters(w).length === puzzle.all.length;
          return '<span class="bz-found-word' + (pang ? ' pangram' : '') + '">' + w + '</span>';
        }).join('');
      }

      function add(l) { state.input += l; paintInput(); }
      function back() { state.input = state.input.slice(0, -1); paintInput(); }
      function shuffleHex() { outerOrder = DD.shuffle(outerOrder, DD.rng(Date.now())); paintHex(); }
      function submit() {
        var w = state.input;
        state.input = '';
        paintInput();
        if (!w || w.length < 4) { DD.toast('Too short'); return; }
        if (w.indexOf(puzzle.center) === -1) { DD.toast('Missing center letter'); return; }
        for (var i = 0; i < w.length; i++) if (puzzle.all.indexOf(w[i]) === -1) { DD.toast('Bad letters'); return; }
        if (state.found.indexOf(w) !== -1) { DD.toast('Already found'); return; }
        if (!validSet[w]) { DD.toast('Not in word list'); return; }
        var pts = validSet[w];
        state.found.push(w);
        state.score += pts;
        DD.saveState('buzzword', day, { found: state.found });
        if (uniqueLetters(w).length === puzzle.all.length) DD.toast('Pangram! +' + pts);
        else DD.toast('+' + pts);
        paintScore();
      }

      hexEl.addEventListener('click', function (e) {
        var b = e.target.closest('.bz-cell');
        if (b) add(b.dataset.l);
      });
      enterBtn.addEventListener('click', submit);
      delBtn.addEventListener('click', back);
      shufBtn.addEventListener('click', shuffleHex);
      revealBtn.addEventListener('click', function () {
        if (!confirm('Reveal all answers? This ends today\'s puzzle.')) return;
        var all = allValid.slice().sort();
        foundEl.innerHTML = all.map(function (w) {
          var pang = uniqueLetters(w).length === puzzle.all.length;
          var found = state.found.indexOf(w) !== -1;
          return '<span class="bz-found-word' + (pang ? ' pangram' : '') + '" style="' + (found ? '' : 'color:#a3a3a3') + '">' + w + '</span>';
        }).join('');
        DD.recordResult('buzzword', day, state.found.length > 0);
      });
      document.addEventListener('keydown', function (e) {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        if (e.key === 'Enter') { submit(); e.preventDefault(); }
        else if (e.key === 'Backspace') { back(); e.preventDefault(); }
        else if (/^[a-zA-Z]$/.test(e.key)) { add(e.key.toUpperCase()); }
      });

      paintHex(); paintInput(); paintScore();
    }

    if (EMBEDDED_WORDS && EMBEDDED_WORDS.length) {
      ready(EMBEDDED_WORDS);
    } else {
      // Lazy-load the dictionary
      var s = document.createElement('script');
      s.src = '/js/buzzword-words.js';
      s.onload = function () { ready(window.__BZ_WORDS__ || []); };
      s.onerror = function () {
        mount.innerHTML = '<div class="result-panel"><h3>Couldn\'t load word list</h3><p>Please refresh the page.</p></div>';
      };
      document.head.appendChild(s);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
