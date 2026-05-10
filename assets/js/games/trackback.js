/* ============================================
 * Trackback — daily song-from-clues guess game
 * Five factual clues revealed one at a time: Year → Genre → Artist initial → Album → Chart peak.
 * No audio, no lyrics — only public-record factual metadata. Six attempts (skip = use a clue).
 * ============================================ */
(function () {
  'use strict';

  // Pool of well-known, widely-known popular songs (factual public-record metadata only).
  // Fields: t = title, ar = artist, y = release year, g = genre, al = album, peak = US Hot 100 / chart peak descriptor.
  var TRACKS = [
    { t: "Bohemian Rhapsody", ar: "Queen", y: 1975, g: "Rock", al: "A Night at the Opera", peak: "#9 US / #1 UK" },
    { t: "Billie Jean", ar: "Michael Jackson", y: 1983, g: "Pop / R&B", al: "Thriller", peak: "#1 US Billboard Hot 100" },
    { t: "Like a Rolling Stone", ar: "Bob Dylan", y: 1965, g: "Folk Rock", al: "Highway 61 Revisited", peak: "#2 US Billboard Hot 100" },
    { t: "Smells Like Teen Spirit", ar: "Nirvana", y: 1991, g: "Grunge / Rock", al: "Nevermind", peak: "#6 US Billboard Hot 100" },
    { t: "Hey Jude", ar: "The Beatles", y: 1968, g: "Rock", al: "(Non-album single)", peak: "#1 US Billboard Hot 100" },
    { t: "Imagine", ar: "John Lennon", y: 1971, g: "Soft Rock", al: "Imagine", peak: "#3 US Billboard Hot 100" },
    { t: "Rolling in the Deep", ar: "Adele", y: 2010, g: "Pop / Soul", al: "21", peak: "#1 US Billboard Hot 100" },
    { t: "Shape of You", ar: "Ed Sheeran", y: 2017, g: "Pop", al: "÷ (Divide)", peak: "#1 US Billboard Hot 100" },
    { t: "Uptown Funk", ar: "Mark Ronson ft. Bruno Mars", y: 2014, g: "Funk / Pop", al: "Uptown Special", peak: "#1 US Billboard Hot 100" },
    { t: "Despacito", ar: "Luis Fonsi ft. Daddy Yankee", y: 2017, g: "Reggaeton / Latin Pop", al: "Vida", peak: "#1 US Billboard Hot 100" },
    { t: "Hotel California", ar: "Eagles", y: 1976, g: "Soft Rock", al: "Hotel California", peak: "#1 US Billboard Hot 100" },
    { t: "Stairway to Heaven", ar: "Led Zeppelin", y: 1971, g: "Rock", al: "Led Zeppelin IV", peak: "Not released as single (US)" },
    { t: "Sweet Child O' Mine", ar: "Guns N' Roses", y: 1987, g: "Hard Rock", al: "Appetite for Destruction", peak: "#1 US Billboard Hot 100" },
    { t: "Thriller", ar: "Michael Jackson", y: 1982, g: "Pop / Funk", al: "Thriller", peak: "#4 US Billboard Hot 100" },
    { t: "Bad Guy", ar: "Billie Eilish", y: 2019, g: "Electropop", al: "When We All Fall Asleep, Where Do We Go?", peak: "#1 US Billboard Hot 100" },
    { t: "Blinding Lights", ar: "The Weeknd", y: 2019, g: "Synth-pop", al: "After Hours", peak: "#1 US Billboard Hot 100" },
    { t: "Dance Monkey", ar: "Tones and I", y: 2019, g: "Pop", al: "The Kids Are Coming", peak: "#1 in 30+ countries" },
    { t: "Old Town Road", ar: "Lil Nas X", y: 2019, g: "Country Rap", al: "7 EP", peak: "#1 US Billboard Hot 100 (19 weeks)" },
    { t: "Levitating", ar: "Dua Lipa", y: 2020, g: "Disco-pop", al: "Future Nostalgia", peak: "#2 US Billboard Hot 100" },
    { t: "Watermelon Sugar", ar: "Harry Styles", y: 2019, g: "Pop Rock", al: "Fine Line", peak: "#1 US Billboard Hot 100" },
    { t: "Rockstar", ar: "Post Malone ft. 21 Savage", y: 2017, g: "Hip-Hop", al: "Beerbongs & Bentleys", peak: "#1 US Billboard Hot 100" },
    { t: "God's Plan", ar: "Drake", y: 2018, g: "Hip-Hop / R&B", al: "Scorpion", peak: "#1 US Billboard Hot 100" },
    { t: "Hey Ya!", ar: "OutKast", y: 2003, g: "Funk / Pop Rap", al: "Speakerboxxx/The Love Below", peak: "#1 US Billboard Hot 100" },
    { t: "Crazy in Love", ar: "Beyoncé ft. Jay-Z", y: 2003, g: "R&B / Pop", al: "Dangerously in Love", peak: "#1 US Billboard Hot 100" },
    { t: "Single Ladies (Put a Ring on It)", ar: "Beyoncé", y: 2008, g: "R&B / Dance-pop", al: "I Am... Sasha Fierce", peak: "#1 US Billboard Hot 100" },
    { t: "Umbrella", ar: "Rihanna ft. Jay-Z", y: 2007, g: "Pop / R&B", al: "Good Girl Gone Bad", peak: "#1 US Billboard Hot 100" },
    { t: "Poker Face", ar: "Lady Gaga", y: 2008, g: "Electropop", al: "The Fame", peak: "#1 US Billboard Hot 100" },
    { t: "Royals", ar: "Lorde", y: 2013, g: "Art Pop", al: "Pure Heroine", peak: "#1 US Billboard Hot 100" },
    { t: "Shake It Off", ar: "Taylor Swift", y: 2014, g: "Pop", al: "1989", peak: "#1 US Billboard Hot 100" },
    { t: "Counting Stars", ar: "OneRepublic", y: 2013, g: "Pop Rock", al: "Native", peak: "#2 US Billboard Hot 100" },
    { t: "Wonderwall", ar: "Oasis", y: 1995, g: "Britpop", al: "(What's the Story) Morning Glory?", peak: "#8 US / #2 UK" },
    { t: "Creep", ar: "Radiohead", y: 1992, g: "Alternative Rock", al: "Pablo Honey", peak: "#34 US Billboard Hot 100" },
    { t: "Yesterday", ar: "The Beatles", y: 1965, g: "Pop / Folk", al: "Help!", peak: "#1 US Billboard Hot 100" },
    { t: "Purple Rain", ar: "Prince", y: 1984, g: "Rock / Pop", al: "Purple Rain", peak: "#2 US Billboard Hot 100" },
    { t: "I Will Always Love You", ar: "Whitney Houston", y: 1992, g: "Soul / Pop", al: "The Bodyguard (Soundtrack)", peak: "#1 US Billboard Hot 100 (14 weeks)" },
    { t: "My Heart Will Go On", ar: "Celine Dion", y: 1997, g: "Soft Rock / Soundtrack", al: "Let's Talk About Love", peak: "#1 US Billboard Hot 100" },
    { t: "Empire State of Mind", ar: "Jay-Z ft. Alicia Keys", y: 2009, g: "Hip-Hop", al: "The Blueprint 3", peak: "#1 US Billboard Hot 100" },
    { t: "Lose Yourself", ar: "Eminem", y: 2002, g: "Hip-Hop", al: "8 Mile (Soundtrack)", peak: "#1 US Billboard Hot 100 (12 weeks)" },
    { t: "In Da Club", ar: "50 Cent", y: 2003, g: "Hip-Hop", al: "Get Rich or Die Tryin'", peak: "#1 US Billboard Hot 100" },
    { t: "Just the Way You Are", ar: "Bruno Mars", y: 2010, g: "Pop / R&B", al: "Doo-Wops & Hooligans", peak: "#1 US Billboard Hot 100" },
    { t: "Someone Like You", ar: "Adele", y: 2011, g: "Pop / Soul", al: "21", peak: "#1 US Billboard Hot 100" },
    { t: "Take On Me", ar: "a-ha", y: 1985, g: "Synth-pop", al: "Hunting High and Low", peak: "#1 US Billboard Hot 100" },
    { t: "Africa", ar: "Toto", y: 1982, g: "Soft Rock", al: "Toto IV", peak: "#1 US Billboard Hot 100" },
    { t: "Don't Stop Believin'", ar: "Journey", y: 1981, g: "Rock", al: "Escape", peak: "#9 US Billboard Hot 100" },
    { t: "Livin' on a Prayer", ar: "Bon Jovi", y: 1986, g: "Rock", al: "Slippery When Wet", peak: "#1 US Billboard Hot 100" },
    { t: "Sweet Caroline", ar: "Neil Diamond", y: 1969, g: "Pop", al: "Sweet Caroline", peak: "#4 US Billboard Hot 100" },
    { t: "Wonderful World", ar: "Sam Cooke", y: 1960, g: "Soul / Pop", al: "(Single)", peak: "#12 US Billboard Hot 100" },
    { t: "I Want to Hold Your Hand", ar: "The Beatles", y: 1963, g: "Rock", al: "Meet the Beatles!", peak: "#1 US Billboard Hot 100" },
    { t: "Born to Run", ar: "Bruce Springsteen", y: 1975, g: "Rock", al: "Born to Run", peak: "#23 US Billboard Hot 100" },
    { t: "What's Going On", ar: "Marvin Gaye", y: 1971, g: "Soul", al: "What's Going On", peak: "#2 US Billboard Hot 100" }
  ];

  function init() {
    if (!window.DD) return setTimeout(init, 30);
    var mount = document.getElementById('game-mount');
    if (!mount) return;

    DD.wireRules(
      '<p>Guess the daily song. Each clue you reveal makes it easier — but the fewer clues you use, the better your score.</p>' +
      '<ul>' +
      '<li>Type your guess (title only — artist is ignored). Capitalization & punctuation don\'t matter.</li>' +
      '<li>Skip a guess to reveal the next clue without using an attempt.</li>' +
      '<li>You have <strong>6 total moves</strong> (guesses + skips combined).</li>' +
      '<li>Clues, in order: Year → Genre → Artist initial → Album → Chart peak.</li>' +
      '</ul>'
    );

    var day = DD.getPuzzleDay();
    DD.paintDate(day);

    // Deterministic per day across all years
    var pool = DD.shuffle(TRACKS, DD.rng(20240101));
    var idx = ((day % pool.length) + pool.length) % pool.length;
    var track = pool[idx];

    var saved = DD.loadState('trackback', day) || { revealed: 1, attempts: [], finished: false, won: false };
    var state = {
      day: day,
      track: track,
      revealed: saved.revealed,        // # clues currently visible (1..5)
      attempts: saved.attempts.slice(),// [{kind:'guess'|'skip', text?, correct?}]
      finished: !!saved.finished,
      won: !!saved.won,
      maxMoves: 6
    };

    var clueDefs = [
      { label: 'Year',           value: String(track.y) },
      { label: 'Genre',          value: track.g },
      { label: 'Artist initial', value: track.ar.charAt(0).toUpperCase() + ' · (' + countWords(track.ar) + ' word' + (countWords(track.ar) === 1 ? '' : 's') + ')' },
      { label: 'Album',          value: track.al },
      { label: 'Chart peak',     value: track.peak }
    ];

    mount.innerHTML =
      '<div class="tb-wrap">' +
        '<div class="tb-clues" id="tb-clues"></div>' +
        '<div class="tb-input-row">' +
          '<input class="tb-input" id="tb-input" type="text" placeholder="Guess the song title…" autocomplete="off" autocorrect="off" autocapitalize="off">' +
          '<button class="btn btn-primary" id="tb-guess" type="button">Guess</button>' +
          '<button class="btn btn-ghost" id="tb-skip" type="button">Skip</button>' +
        '</div>' +
        '<div class="tb-attempts" id="tb-attempts"></div>' +
      '</div>';

    var cluesEl = document.getElementById('tb-clues');
    var attemptsEl = document.getElementById('tb-attempts');
    var input = document.getElementById('tb-input');
    var btnGuess = document.getElementById('tb-guess');
    var btnSkip = document.getElementById('tb-skip');

    function paintClues() {
      cluesEl.innerHTML = '';
      for (var i = 0; i < clueDefs.length; i++) {
        var visible = i < state.revealed || state.finished;
        var c = document.createElement('div');
        c.className = 'tb-clue' + (visible ? ' revealed' : '');
        c.innerHTML = '<span class="tb-clue-label">' + DD.escapeHtml(clueDefs[i].label) + '</span>' +
                      '<span class="tb-clue-value' + (visible ? '' : ' locked') + '">' + (visible ? DD.escapeHtml(clueDefs[i].value) : '— locked —') + '</span>';
        cluesEl.appendChild(c);
      }
    }
    function paintAttempts() {
      attemptsEl.innerHTML = '';
      state.attempts.forEach(function (a, i) {
        var pill = document.createElement('span');
        if (a.kind === 'skip') {
          pill.className = 'tb-attempt skip';
          pill.textContent = (i+1) + '. Skipped';
        } else {
          pill.className = 'tb-attempt ' + (a.correct ? 'win' : 'wrong');
          pill.textContent = (i+1) + '. ' + a.text;
        }
        attemptsEl.appendChild(pill);
      });
    }

    function normalize(s) {
      return String(s || '').toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\b(the|a|an)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function endGame(won) {
      state.finished = true;
      state.won = won;
      state.revealed = clueDefs.length;
      DD.saveState('trackback', day, state);
      DD.recordResult('trackback', day, won);
      paintClues(); paintAttempts(); lockInput();
      var stats = DD.loadStats('trackback');
      var moves = state.attempts.length;
      var line = 'Trackback · Day ' + day + ' · ' + (won ? moves + '/6 ' + (moves <= 1 ? '🟢🟢🟢' : moves <= 3 ? '🟢🟢' : '🟢') : 'X/6');
      var share = line + '\n' + state.attempts.map(function (a) { return a.kind === 'skip' ? '⏭️' : (a.correct ? '✅' : '❌'); }).join('') + '\nhttps://datadripco.com/puzzles/trackback/';
      var panel = DD.buildResultPanel({
        won: won,
        title: won ? 'Solved in ' + moves + '!' : 'The track was',
        answer: track.t + ' — ' + track.ar,
        stats: [
          { v: stats.played, l: 'Played' },
          { v: stats.played ? Math.round((stats.wins/stats.played)*100) + '%' : '0%', l: 'Win rate' },
          { v: stats.streak, l: 'Streak' },
          { v: stats.bestStreak, l: 'Best' }
        ],
        shareText: share
      });
      mount.parentNode.appendChild(panel);
    }

    function lockInput() { input.disabled = true; btnGuess.disabled = true; btnSkip.disabled = true; }

    function doGuess() {
      if (state.finished) return;
      var raw = input.value.trim();
      if (!raw) return;
      var correct = normalize(raw) === normalize(track.t);
      state.attempts.push({ kind: 'guess', text: raw, correct: correct });
      input.value = '';
      if (correct) { endGame(true); return; }
      if (state.revealed < clueDefs.length) state.revealed++;
      DD.saveState('trackback', day, state);
      paintClues(); paintAttempts();
      if (state.attempts.length >= state.maxMoves) endGame(false);
    }
    function doSkip() {
      if (state.finished) return;
      state.attempts.push({ kind: 'skip' });
      if (state.revealed < clueDefs.length) state.revealed++;
      DD.saveState('trackback', day, state);
      paintClues(); paintAttempts();
      if (state.attempts.length >= state.maxMoves) endGame(false);
    }

    btnGuess.addEventListener('click', doGuess);
    btnSkip.addEventListener('click', doSkip);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doGuess(); });

    paintClues(); paintAttempts();
    if (state.finished) endGame(state.won);
  }

  function countWords(s) { return String(s).trim().split(/\s+/).length; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
