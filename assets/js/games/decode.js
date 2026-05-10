/* ============================================
 * Decode — daily mystery word from progressive clues
 * 5 clues unlock one at a time. Earlier guess = higher score.
 * Up to 5 attempts (each wrong attempt unlocks the next clue).
 * ============================================ */
(function () {
  'use strict';

  // Each puzzle: word + 5 clues from broad → specific.
  // Words/clues are general-knowledge nouns; clues use only general descriptions (no copyrighted text).
  var PUZZLES = [
    { word: "BITCOIN", clues: [
        "A type of digital asset created in 2009.",
        "Designed by an unknown person or group called Satoshi Nakamoto.",
        "Has a fixed maximum supply of 21 million units.",
        "Mined by solving cryptographic proof-of-work puzzles.",
        "The first and largest cryptocurrency by market cap."
    ]},
    { word: "ETHEREUM", clues: [
        "A blockchain platform launched in 2015.",
        "Co-founded by Vitalik Buterin.",
        "Its native token is the second-largest crypto by market cap.",
        "Switched from proof-of-work to proof-of-stake in 'The Merge'.",
        "Smart contracts run on its EVM virtual machine."
    ]},
    { word: "CHATGPT", clues: [
        "A consumer software product launched in late 2022.",
        "Released by an AI research company based in San Francisco.",
        "Hit 100 million users faster than any prior consumer app.",
        "Built on top of large language models in the GPT family.",
        "OpenAI's flagship conversational assistant."
    ]},
    { word: "TESLA", clues: [
        "An American multinational company headquartered in Austin, Texas.",
        "Designs and manufactures electric vehicles.",
        "Its CEO also runs SpaceX and X (formerly Twitter).",
        "Models include the S, 3, X, Y, and Cybertruck.",
        "Founded in 2003; named after the Serbian-American inventor."
    ]},
    { word: "QUANTUM", clues: [
        "A word from physics relating to the smallest indivisible unit.",
        "Often paired with the word 'mechanics' or 'computing'.",
        "Describes phenomena where superposition and entanglement matter.",
        "Forms the basis for a new kind of computer being built by Google, IBM, and others.",
        "Single qubits can represent 0, 1, or both at once."
    ]},
    { word: "AVATAR", clues: [
        "A word originally from Sanskrit Hindu philosophy.",
        "In modern usage, often refers to a digital representation of a person.",
        "Also the title of a 2009 James Cameron film.",
        "The film's sequel, released in 2022, was set on the planet Pandora.",
        "Includes blue-skinned humanoid creatures called the Na'vi."
    ]},
    { word: "PYTHON", clues: [
        "A name shared by a type of large constrictor snake.",
        "Also a programming language created in 1991.",
        "Designed by Guido van Rossum.",
        "Known for clean syntax and significant whitespace.",
        "The most popular language for AI and data science."
    ]},
    { word: "LINUX", clues: [
        "An open-source operating system kernel.",
        "Originally written by Linus Torvalds in 1991.",
        "Powers most of the world's servers, supercomputers, and Android phones.",
        "Distributions include Ubuntu, Debian, Fedora, and Arch.",
        "Its mascot is a penguin named Tux."
    ]},
    { word: "GOOGLE", clues: [
        "An American multinational technology company founded in 1998.",
        "Started as a research project by two Stanford PhD students.",
        "Its name is a misspelling of a very large number.",
        "Owns Android, YouTube, and the Chrome browser.",
        "The world's most visited website."
    ]},
    { word: "BLOCKCHAIN", clues: [
        "A type of distributed digital ledger.",
        "Records are linked together using cryptographic hashes.",
        "Originally proposed in a 2008 whitepaper by Satoshi Nakamoto.",
        "Underpins all major cryptocurrencies and many NFTs.",
        "Often described as 'append-only' and 'immutable'."
    ]},
    { word: "ALGORITHM", clues: [
        "A word that comes from the name of a 9th-century Persian mathematician.",
        "In computing, a finite set of well-defined steps to solve a problem.",
        "Used by social platforms to rank what you see in your feed.",
        "Examples include sorting, searching, and machine-learning models.",
        "TikTok's recommendation system is famously powerful."
    ]},
    { word: "STARTUP", clues: [
        "A type of newly founded company.",
        "Often associated with technology and rapid growth.",
        "Frequently funded by venture capital firms.",
        "Y Combinator and Sequoia are well-known investors in them.",
        "Aims to scale quickly and reach product-market fit."
    ]},
    { word: "INFLATION", clues: [
        "An economic concept measured in percent per year.",
        "Tracked by indexes like the CPI and the PCE.",
        "Spiked sharply across most major economies in 2022.",
        "Central banks raise interest rates to control it.",
        "Means the general level of prices is rising over time."
    ]},
    { word: "ROBOT", clues: [
        "A word coined in a 1920 Czech play by Karel Čapek.",
        "From a Slavic root meaning 'forced labor'.",
        "Today refers to a programmable machine that performs tasks.",
        "Can be industrial (in factories) or humanoid (Atlas, Optimus).",
        "Sci-fi versions include R2-D2, WALL-E, and the Terminator."
    ]},
    { word: "INTERNET", clues: [
        "A global system of interconnected computer networks.",
        "Began in the late 1960s as ARPANET.",
        "Uses the TCP/IP protocol suite to send packets of data.",
        "Made user-friendly by the World Wide Web in the early 1990s.",
        "Now reaches over 5 billion people."
    ]},
    { word: "OPENAI", clues: [
        "An American artificial intelligence research lab.",
        "Founded in 2015 with backing from Sam Altman, Elon Musk, and others.",
        "Originally a non-profit; later added a capped-profit arm.",
        "Best known for the GPT family of large language models.",
        "Released ChatGPT in November 2022."
    ]},
    { word: "STARGATE", clues: [
        "A 1994 science fiction film and a long-running TV franchise.",
        "Also the name of a major announced AI infrastructure project.",
        "Reportedly a $500-billion data-center build-out in the U.S.",
        "Backed by OpenAI, SoftBank, Oracle and others.",
        "Aims to host the next generation of frontier AI training."
    ]},
    { word: "SATOSHI", clues: [
        "The pseudonymous creator of a famous digital currency.",
        "Disappeared from the project in 2011.",
        "True identity remains unknown despite many claims.",
        "Wrote a 9-page whitepaper in October 2008.",
        "Gave their name to the smallest unit of Bitcoin (one hundred-millionth)."
    ]},
    { word: "WEBSITE", clues: [
        "A collection of related web pages.",
        "Identified by a unique domain name.",
        "Served over the HTTP or HTTPS protocol.",
        "First example created at CERN by Tim Berners-Lee in 1991.",
        "You're using one to play this puzzle right now."
    ]},
    { word: "NEURON", clues: [
        "A specialized cell in the human nervous system.",
        "Communicates via electrical and chemical signals.",
        "The human brain contains around 86 billion of them.",
        "Inspired the basic unit in artificial neural networks.",
        "Connections between them are called synapses."
    ]},
    { word: "MERGER", clues: [
        "A type of major business transaction.",
        "Two or more companies combine into one entity.",
        "Often subject to regulatory antitrust review.",
        "Can be horizontal, vertical, or conglomerate.",
        "Different from an acquisition, where one firm buys another outright."
    ]},
    { word: "WALLET", clues: [
        "A small folding case for carrying personal items.",
        "Traditionally holds cards, cash, and ID.",
        "In crypto, a piece of software that stores private keys.",
        "Can be 'hot' (online) or 'cold' (hardware/offline).",
        "Ledger and Trezor are two well-known hardware versions."
    ]},
    { word: "VOLATILITY", clues: [
        "A statistical measure used in finance.",
        "Often expressed as a standard deviation of returns.",
        "Higher means prices swing more violently.",
        "Crypto markets are famous for it.",
        "The 'VIX' tracks expected stock-market levels of it."
    ]},
    { word: "LAUNCH", clues: [
        "A verb commonly used in the tech industry.",
        "Refers to releasing a product to the public.",
        "Apple, SpaceX, and game studios are known for these events.",
        "Often paired with 'soft' or 'hard' as a modifier.",
        "Steve Jobs delivered famous keynote ones for the iPhone and iPad."
    ]},
    { word: "PHISHING", clues: [
        "A type of online scam.",
        "Uses fake messages to trick people into revealing information.",
        "The name is a deliberate misspelling of a fishing-related word.",
        "Most often arrives via email but also via SMS ('smishing').",
        "Common goal: steal passwords, banking, or crypto credentials."
    ]},
    { word: "SUBNET", clues: [
        "A networking concept.",
        "Short for 'subnetwork'.",
        "Logical subdivision of an IP network.",
        "Defined using a bitmask in IPv4 like 255.255.255.0.",
        "Routers use them to forward traffic efficiently."
    ]},
    { word: "OPENSOURCE", clues: [
        "A way of distributing software.",
        "Source code is made publicly available.",
        "Anyone can read, modify, and redistribute it under a license.",
        "Famous examples: Linux, Firefox, Kubernetes.",
        "Often abbreviated 'OSS'."
    ]},
    { word: "CLOUD", clues: [
        "A common feature in the sky.",
        "In tech, refers to delivering computing services over the internet.",
        "AWS, Azure, and Google's offering dominate the global market.",
        "Uses pay-as-you-go pricing for storage and compute.",
        "Replaced the need for many companies to run their own data centers."
    ]},
    { word: "DRONE", clues: [
        "A male honey bee, originally.",
        "Modern usage: an unmanned aerial vehicle.",
        "Often controlled by a remote pilot or autonomous software.",
        "DJI is the largest consumer manufacturer.",
        "Used for photography, delivery, and increasingly warfare."
    ]},
    { word: "PIXEL", clues: [
        "A unit of measurement on a digital screen.",
        "The word is a contraction of 'picture element'.",
        "The smallest controllable element of a raster image.",
        "Resolution like 1080p describes the total grid of them.",
        "Also the brand name of Google's smartphone line."
    ]}
  ];

  function init() {
    if (!window.DD) return setTimeout(init, 30);
    var mount = document.getElementById('game-mount');
    if (!mount) return;

    DD.wireRules(
      '<p>Five clues. Reveal as few as possible.</p>' +
      '<ul>' +
      '<li>You start with one clue. Each wrong guess unlocks the next.</li>' +
      '<li>You have <strong>5 attempts</strong> total.</li>' +
      '<li>Spelling counts (case and punctuation don\'t).</li>' +
      '<li>Score: 5 points if you get it on clue 1, 4 on clue 2, and so on.</li>' +
      '</ul>'
    );

    var day = DD.getPuzzleDay();
    DD.paintDate(day);
    var pool = DD.shuffle(PUZZLES, DD.rng(20240117));
    var p = pool[((day % pool.length) + pool.length) % pool.length];

    var saved = DD.loadState('decode', day) || { revealed: 1, attempts: [], finished: false, won: false };
    var state = {
      day: day, puzzle: p,
      revealed: saved.revealed,
      attempts: saved.attempts.slice(),
      finished: !!saved.finished,
      won: !!saved.won
    };

    mount.innerHTML =
      '<div class="dc-wrap">' +
        '<div class="dc-meter" id="dc-meter"></div>' +
        '<div class="dc-clues" id="dc-clues"></div>' +
        '<div class="dc-input-row">' +
          '<input class="dc-input" id="dc-input" type="text" placeholder="Type your guess…" autocomplete="off" autocorrect="off" autocapitalize="characters">' +
          '<button class="btn btn-primary" id="dc-guess" type="button">Guess</button>' +
        '</div>' +
        '<div class="dc-attempts" id="dc-attempts"></div>' +
      '</div>';

    var meterEl = document.getElementById('dc-meter');
    var cluesEl = document.getElementById('dc-clues');
    var attemptsEl = document.getElementById('dc-attempts');
    var input = document.getElementById('dc-input');
    var btn = document.getElementById('dc-guess');

    function paintMeter() {
      meterEl.innerHTML = '';
      for (var i = 0; i < 5; i++) {
        var s = document.createElement('span');
        var used = i < state.attempts.length;
        var cls = used ? 'used' : '';
        if (state.finished) {
          if (state.won && i === state.attempts.length - 1) cls = 'win';
          else if (!state.won && i === state.attempts.length - 1) cls = 'lose';
        }
        s.className = cls;
        meterEl.appendChild(s);
      }
    }
    function paintClues() {
      cluesEl.innerHTML = '';
      for (var i = 0; i < state.puzzle.clues.length; i++) {
        var visible = i < state.revealed || state.finished;
        var c = document.createElement('div');
        c.className = 'dc-clue' + (visible ? '' : ' locked');
        c.innerHTML = '<span class="dc-clue-num">Clue ' + (i+1) + '</span>' + (visible ? DD.escapeHtml(state.puzzle.clues[i]) : 'locked');
        cluesEl.appendChild(c);
      }
    }
    function paintAttempts() {
      attemptsEl.innerHTML = '';
      state.attempts.forEach(function (a, i) {
        var pill = document.createElement('span');
        pill.className = 'dc-attempt ' + (a.correct ? 'win' : 'wrong');
        pill.textContent = (i+1) + '. ' + a.text;
        attemptsEl.appendChild(pill);
      });
    }

    function normalize(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

    function endGame() {
      state.finished = true;
      DD.saveState('decode', day, state);
      DD.recordResult('decode', day, state.won);
      input.disabled = true; btn.disabled = true;
      paintMeter(); paintClues();
      var stats = DD.loadStats('decode');
      var score = state.won ? (5 - state.attempts.length + 1) : 0;
      var emoji = state.attempts.map(function (a) { return a.correct ? '🟢' : '🔴'; }).join('') + ' '.repeat(0);
      var line = 'Decode · Day ' + day + ' · ' + (state.won ? state.attempts.length + '/5' : 'X/5');
      var share = line + '\n' + emoji + '\nhttps://datadripco.com/puzzles/decode/';
      var panel = DD.buildResultPanel({
        won: state.won,
        title: state.won ? 'Cracked in ' + state.attempts.length + '!' : 'The mystery word was',
        answer: state.puzzle.word,
        stats: [
          { v: stats.played, l: 'Played' },
          { v: stats.played ? Math.round((stats.wins/stats.played)*100) + '%' : '0%', l: 'Win rate' },
          { v: stats.streak, l: 'Streak' },
          { v: state.won ? score : 0, l: 'Score (today)' }
        ],
        shareText: share
      });
      mount.parentNode.appendChild(panel);
    }

    function doGuess() {
      if (state.finished) return;
      var raw = input.value.trim();
      if (!raw) return;
      var correct = normalize(raw) === normalize(state.puzzle.word);
      state.attempts.push({ text: raw.toUpperCase(), correct: correct });
      input.value = '';
      if (correct) { state.won = true; endGame(); return; }
      if (state.revealed < state.puzzle.clues.length) state.revealed++;
      DD.saveState('decode', day, state);
      paintMeter(); paintClues(); paintAttempts();
      if (state.attempts.length >= 5) { state.won = false; endGame(); }
    }

    btn.addEventListener('click', doGuess);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doGuess(); });

    paintMeter(); paintClues(); paintAttempts();
    if (state.finished) endGame();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
