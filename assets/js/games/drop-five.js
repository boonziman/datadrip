/* ============================================
 * Drop Five — daily 5-letter word guess
 * 6 attempts. Color hints: green=correct spot, yellow=in word/wrong spot, gray=not in word.
 * Answer pool is shuffled deterministically by year so order doesn't repeat across years.
 * ============================================ */
(function () {
  'use strict';

  // Curated common 5-letter words — answer pool (~250). Plays across years, no repeats within a cycle.
  // (Common, recognizable English words — no proper nouns, no plurals of 4-letter words, no offensive words.)
  var ANSWERS = [
    "about","above","abuse","actor","acute","admit","adopt","adult","after","again",
    "agent","agree","ahead","alarm","album","alert","alike","alive","allow","alone",
    "along","alter","among","anger","angle","angry","apart","apple","apply","arena",
    "argue","arise","array","aside","asset","audio","audit","avoid","awake","award",
    "aware","badly","baker","basic","beach","began","begin","being","below","bench",
    "billy","birth","black","blame","blind","block","blood","board","boost","booth",
    "bound","brain","brand","brass","brave","bread","break","breed","brief","bring",
    "broad","broke","brown","build","built","buyer","cable","calif","carry","catch",
    "cause","chain","chair","chart","chase","cheap","check","chest","chief","child",
    "china","chose","civil","claim","class","clean","clear","click","clock","close",
    "cloud","coach","coast","could","count","court","cover","craft","crash","cream",
    "crime","cross","crowd","crown","curve","cycle","daily","dance","dated","dealt",
    "death","debut","delay","depth","doing","doubt","dozen","draft","drama","drawn",
    "dream","dress","drill","drink","drive","drove","dying","eager","early","earth",
    "eight","elite","empty","enemy","enjoy","enter","entry","equal","error","event",
    "every","exact","exist","extra","faith","false","fault","fiber","field","fifth",
    "fifty","fight","final","first","fixed","flash","fleet","floor","fluid","focus",
    "force","forth","forty","forum","found","frame","frank","fraud","fresh","front",
    "fruit","fully","funny","giant","given","glass","globe","going","grace","grade",
    "grand","grant","grass","great","green","gross","group","grown","guard","guess",
    "guest","guide","happy","harry","heart","heavy","hence","horse","hotel","house",
    "human","ideal","image","index","inner","input","issue","japan","jimmy","joint",
    "jones","judge","known","label","large","laser","later","laugh","layer","learn",
    "lease","least","leave","legal","level","light","limit","links","lives","local",
    "logic","loose","lower","lucky","lunch","lying","magic","major","maker","march",
    "maria","match","maybe","mayor","meant","media","metal","might","minor","minus",
    "mixed","model","money","month","moral","motor","mount","mouse","mouth","movie",
    "music","needs","never","newly","night","noise","north","noted","novel","nurse",
    "occur","ocean","offer","often","order","other","ought","paint","panel","paper",
    "party","peace","peter","phase","phone","photo","piece","pilot","pitch","place",
    "plain","plane","plant","plate","point","pound","power","press","price","pride",
    "prime","print","prior","prize","proof","proud","prove","queen","quick","quiet",
    "quite","radio","raise","range","rapid","ratio","reach","ready","refer","right",
    "rival","river","rough","round","route","royal","rural","scale","scene","scope",
    "score","sense","serve","seven","shall","shape","share","sharp","sheet","shelf",
    "shell","shift","shine","shirt","shock","shoot","short","shown","sight","silly",
    "since","sixth","sixty","sized","skill","sleep","slide","small","smart","smile",
    "smith","smoke","solid","solve","sorry","sound","south","space","spare","speak",
    "speed","spend","spent","split","spoke","sport","staff","stage","stake","stand",
    "start","state","steam","steel","stick","still","stock","stone","stood","store",
    "storm","story","strip","stuck","study","stuff","style","sugar","suite","super",
    "sweet","table","taken","taste","taxes","teach","teeth","texas","thank","theft",
    "their","theme","there","these","thick","thing","think","third","those","three",
    "threw","throw","tight","times","tired","title","today","topic","total","touch",
    "tough","tower","track","trade","train","treat","trend","trial","tried","tries",
    "truck","truly","trust","truth","twice","under","union","unity","until","upper",
    "upset","urban","usage","usual","valid","value","video","virus","visit","vital",
    "voice","waste","watch","water","wheel","where","which","while","white","whole",
    "whose","woman","women","world","worry","worse","worst","worth","would","wound",
    "write","wrong","wrote","yield","young","youth"
  ];

  // Larger valid-guess set: answers + extra common words. Keep it focused and clean.
  var EXTRA_VALID = [
    "ables","abled","aback","abase","abate","abbey","abbot","abhor","abode","aboot",
    "abort","abyss","ached","aches","achoo","acing","acned","acorn","acres","acted",
    "actin","aging","agony","aimed","aired","aisle","alibi","alien","align","alley",
    "allow","alloy","altar","amass","amaze","amber","ample","amply","ancho","angel",
    "anime","ankle","annex","annoy","anode","antic","anvil","aorta","apace","aphid",
    "apnea","apron","aptly","aroma","arose","arrow","arson","artsy","ascot","ashen",
    "aspic","atlas","atoll","atone","attic","auger","aught","augur","aunts","aunty",
    "aural","avail","avert","avian","awful","awoke","axial","axing","axion","azure",
    "bacon","badge","bagel","baggy","baker","baled","bales","balms","balmy","balsa",
    "banal","bandy","banjo","banks","barbs","bared","barge","barns","baron","bases",
    "basil","baths","baton","batty","bawdy","bawls","bayed","bayou","beach","beads",
    "beady","beaks","beams","beans","beard","beast","beats","beaus","beech","beefs",
    "beefy","beeps","beery","befog","befit","began","beget","begot","begun","being",
    "belay","belch","belie","belly","below","belts","bench","bends","beret","berms",
    "berry","beryl","bezel","bible","biddy","bigot","biked","biker","bikes","bilge",
    "bilks","binds","binge","bingo","biome","biped","birch","birds","bison","biter",
    "bites","bitty","blabs","black","blade","blame","bland","blank","blare","blase",
    "blast","blaze","bleak","bleat","bleed","bleep","blend","bless","blimp","blind",
    "blink","blips","bliss","blitz","bloat","blobs","block","blocs","blogs","bloke",
    "blond","blood","bloom","blots","blown","blows","blues","bluff","blunt","blurb",
    "blurs","blurt","blush","board","boars","boast","boats","bobby","boded","bodes",
    "bogey","boggy","bogus","boils","bolts","bombs","bonds","boner","bones","boney",
    "bongo","bonus","booby","books","booms","boons","boors","boost","booth","boots",
    "booty","booze","boozy","borax","bored","bores","boric","bosom","bossy","botch",
    "bough","bound","bouts","bowed","bowel","bower","bowls","boxed","boxer","boxes",
    "brace","braid","brain","brake","brand","brash","brass","brats","brave","bravo",
    "brawl","brawn","brays","bread","break","bream","breed","briar","bribe","brick",
    "bride","brief","brier","brigs","brims","brine","bring","brink","briny","brisk",
    "broad","broil","broke","brood","brook","broom","broth","brown","brows","bruin",
    "brunt","brush","brute","buddy","budge","buggy","bugle","build","built","bulbs",
    "bulge","bulgy","bulks","bulky","bulls","bully","bumpy","bunch","bunks","bunny",
    "bunts","buoys","burly","burns","burnt","burps","burro","burrs","bursa","burst",
    "buses","bushy","busts","busty","butch","butte","butts","buyer","buzzy","bylaw",
    "cabal","cabby","cabin","cable","cacao","cache","cacti","caddy","cadet","cadge",
    "cafes","caged","cages","cagey","cairn","caked","cakes","calks","calls","calms",
    "calve","camel","cameo","camps","campy","canal","candy","caned","caner","canes",
    "canna","canny","canoe","canon","caped","caper","capes","capon","carat","cards",
    "cared","cares","caret","cargo","carol","carps","carry","carts","carve","cased",
    "cases","casks","caste","casts","catch","cater","cause","caved","caves","cavil",
    "cease","cedar","ceded","cedes","cello","cells","cents","chafe","chaff","chain",
    "chair","chalk","champ","chant","chaos","chaps","chard","charm","chars","chart",
    "chary","chase","chasm","cheap","cheat","check","cheek","cheep","cheer","chefs",
    "chess","chest","chews","chewy","chick","chico","chide","chief","child","chile",
    "chili","chill","chime","chimp","china","chink","chips","chirp","chits","chock",
    "choir","choke","chomp","chops","chord","chore","chose","chuck","chuff","chugs",
    "chump","chunk","churn","chute","cider","cigar","cinch","circa","cited","cites",
    "civet","civic","civil","clack","clade","claim","clamp","clams","clang","clank",
    "clans","claps","clash","clasp","class","claws","clays","clean","clear","cleat",
    "clefs","cleft","clerk","clews","click","cliff","climb","clime","cling","clink",
    "clips","cloak","clock","clods","clogs","clomp","clone","clops","close","cloth",
    "clots","cloud","clout","clove","clown","clubs","cluck","clued","clues","clump",
    "clung","clunk","coach","coals","coast","coats","coded","codes","codex","coeds",
    "coils","coins","cokes","colas","colds","colic","colon","color","colts","comas",
    "combo","combs","comet","comfy","comic","comma","conch","condo","cones","conga",
    "conic","cooed","cooks","cools","coops","copes","copra","cords","cored","cores",
    "corgi","corks","corky","corns","corny","corps","costs","cotes","couch","cough",
    "could","count","coups","court","coven","cover","coves","covet","cowed","cower",
    "coyly","craft","cramp","crams","crane","crank","crash","crass","crate","crave",
    "crawl","craws","craze","crazy","creak","cream","credo","creed","creek","creep",
    "creme","crepe","crept","cress","crest","crews","cribs","crick","cried","crier",
    "cries","crime","crimp","crisp","croak","crock","crocs","crone","crony","crook",
    "crops","cross","croup","crowd","crown","crows","crude","cruel","crumb","crump",
    "crush","crust","crypt","cubed","cubes","cubic","cubit","cuddy","cuffs","cuing",
    "culls","cults","cumin","curbs","curds","cured","cures","curfs","curio","curls",
    "curly","currs","curry","curse","curst","curve","curvy","cushy","cusps","cycle",
    "cyclo","cynic","daddy","dados","daffy","daily","dairy","daisy","daled","dales",
    "dally","damps","dance","dandy","dared","dares","darks","darns","darts","dated",
    "dater","dates","datum","daubs","daunt","davit","dawns","deads","deafs","deals",
    "dealt","deans","dears","death","debar","debit","debts","debug","debut","decaf",
    "decal","decay","decks","decoy","decry","deeds","deems","deeps","defer","defog",
    "deify","deign","deity","delay","delis","delts","delve","demos","demur","denim",
    "dense","dents","depot","depth","derby","desks","deter","detox","deuce","devil",
    "diary","diced","dicer","dices","dicey","dicta","didst","diets","digit","diked",
    "dikes","dimes","dimly","diner","dines","dingo","dings","dingy","dinky","dints",
    "diode","dippy","dirge","dirts","dirty","disco","discs","dishy","ditch","ditty",
    "diver","dives","divot","divvy","dizzy","docks","dodge","dodgy","doers","doffs",
    "doggy","dogma","doily","doing","doled","doles","dolls","dolly","domes","donee",
    "donor","donut","dooms","doors","dopey","dorms","dorky","doses","dosed","doted",
    "dotes","doted","doted","doter","doted","doted","doted","dotes","dotty","doubt",
    "dough","douse","doves","dowdy","dowel","downs","downy","dowry","dowse","doxes",
    "doyen","dozed","dozen","dozes","draft","drags","drain","drake","drama","drank",
    "drape","drawl","drawn","draws","drays","dread","dream","dress","drier","dries",
    "drift","drill","drily","drink","drips","drive","droid","droll","drone","drool",
    "droop","drops","dross","drove","drown","drugs","druid","drums","drunk","drupe",
    "dryad","dryer","dryly","duals","ducal","ducat","duchy","ducks","ducky","ducts",
    "duded","dudes","duels","duets","duffs","dugout","duked","dukes","dulls","dully",
    "dumbs","dummy","dumps","dumpy","dunce","dunes","dunks","duomo","duped","dupes",
    "durst","dusks","dusky","dusts","dusty","duties","dutch","duvet","dwarf","dwell",
    "dyads","dyers","dyets","dying","dykes","eager","eagle","eared","earls","early",
    "earns","earth","eased","easel","eases","eaten","eater","eaves","ebbed","ebony",
    "echos","edged","edger","edges","edict","edify","edits","educe","eels","eerie",
    "egret","eider","eight","eject","eked","ekes","elbow","elder","elect","elegy",
    "elfin","elide","elite","elope","elude","elves","email","embed","ember","emcee",
    "emery","emirs","emits","empty","enact","ended","ender","endow","ennui","enrol",
    "ensue","enter","entry","envoy","epees","epoch","epoxy","equal","equip","erase",
    "erect","erode","erred","error","erupt","essay","ester","ether","ethic","ethos",
    "evade","event","every","evict","evils","evoke","exalt","exams","excel","exert",
    "exile","exist","extol","extra","exude","exult","fable","faced","faces","facet",
    "facts","faded","fades","fagot","fails","faint","fairs","fairy","faith","faked",
    "faker","fakes","falls","false","famed","fancy","fangs","farce","fared","fares",
    "farms","fasts","fatal","fated","fates","fatty","fault","fauna","favor","fawns",
    "faxed","faxes","fazed","fazes","feast","feats","feces","feder","feeds","feels",
    "feign","feint","fells","felon","felts","femur","fence","fends","feral","ferns",
    "ferny","ferry","fests","fetal","fetch","feted","fetes","fetid","fetus","feuds",
    "fever","fewer","fezes","fiats","fiber","fibre","fibs","ficus","field","fiefs",
    "fiend","fiery","fifes","fifth","fifty","fight","filch","filed","files","filet",
    "fills","filly","films","filmy","filth","final","finch","finds","fined","finer",
    "fines","finks","fiord","fired","fires","firms","firms","first","firth","fishy",
    "fists","fitly","fives","fixed","fixer","fixes","fizzy","fjord","flabs","flack",
    "flags","flail","flair","flake","flaky","flame","flank","flans","flaps","flare",
    "flash","flask","flats","flaws","flecs","fleas","flecs","fleet","flesh","flews",
    "flick","flier","flies","fling","flint","flips","flirt","flits","float","flock",
    "flogs","flood","floor","flops","flora","floss","flour","flout","flown","flows",
    "flubs","flues","fluff","fluid","fluke","flume","flung","flunk","flush","flute",
    "flyby","foals","foamy","focal","focus","foggy","foils","foist","folds","folio",
    "folks","folly","fonts","foods","fools","foots","force","fords","foray","forge",
    "forgo","forks","forms","forte","forth","forts","forty","forum","fouls","found",
    "fount","fours","fowls","foxes","foyer","frail","frame","franc","frank","fraud",
    "frays","freak","freed","freer","frees","fresh","frets","friar","fried","fries",
    "frill","frisk","frizz","frock","frogs","frond","front","frost","froth","frown",
    "froze","fruit","fryer","fudge","fugue","fully","fumes","funds","fungi","funky",
    "funny","furls","furor","furry","fused","fuses","fussy","fusty","futon","fuzzy",
    "gable","gaffe","gaily","gains","gaits","galas","gales","galls","gamed","games",
    "gamma","gamut","gangs","gaped","gapes","garbs","gases","gasps","gassy","gated",
    "gates","gauge","gaunt","gauze","gavel","gawks","gawky","gayer","gayly","gazed",
    "gazer","gazes","gears","geeks","geese","gelid","gemmy","genes","genie","genii",
    "genre","gents","genus","germs","gesso","getup","ghost","ghoul","giant","gibed",
    "gibes","giddy","gifts","gigas","gilds","gills","gilts","gimme","gimpy","ginko",
    "girds","girls","girth","given","giver","gives","gizmo","glade","glads","glans",
    "glare","glass","glaze","gleam","glean","glebe","glees","glens","glide","glint",
    "glitz","gloat","globe","globs","glomb","gloom","glops","glory","gloss","glove",
    "glows","glued","glues","gluey","gluts","glyph","gnarl","gnash","gnats","gnaws",
    "gnome","goads","goals","goats","godly","goers","gofer","going","golds","golem",
    "golfs","gonad","goner","gongs","gonna","goods","goody","gooey","goofs","goofy",
    "gooks","goons","goose","gored","gores","gorge","gorse","gotta","gouge","gourd",
    "gouts","gowns","grabs","grace","grade","grads","graft","grail","grain","grams",
    "grand","grant","grape","graph","grasp","grass","grata","grate","grave","gravy",
    "grays","graze","great","greed","greek","green","greet","greys","grids","grief",
    "grill","grime","grimy","grind","grins","gripe","grips","grist","grits","groan",
    "groat","groin","groom","grope","gross","group","grout","grove","growl","grown",
    "grows","grubs","gruel","gruff","grunt","guard","guess","guest","guide","guild",
    "guile","guilt","guise","gulfs","gulls","gulps","gummy","gunky","gurus","gushy",
    "gusts","gusty","gutsy","guyed","gypsy","gyros"
  ];

  function init() {
    if (!window.DD) return setTimeout(init, 30);
    var mount = document.getElementById('game-mount');
    if (!mount) return;

    DD.wireRules(
      '<p>Guess the five-letter word in six tries.</p>' +
      '<ul>' +
      '<li><span class="rule-tile rule-tile--g">A</span> Letter is in the word and in the right spot.</li>' +
      '<li><span class="rule-tile rule-tile--y">A</span> Letter is in the word but in the wrong spot.</li>' +
      '<li><span class="rule-tile rule-tile--n">A</span> Letter is not in the word at all.</li>' +
      '</ul>' +
      '<p>A new word drops every day at midnight your local time.</p>'
    );

    var day = DD.getPuzzleDay();
    DD.paintDate(day);
    var year = new Date(day * 86400000).getUTCFullYear();
    var seed = year * 1000003;
    var pool = DD.shuffle(ANSWERS, DD.rng(seed));
    var dayOfYear = day - DD.daysSinceEpoch(new Date(Date.UTC(year, 0, 1)));
    var answer = pool[((dayOfYear % pool.length) + pool.length) % pool.length].toUpperCase();

    var validSet = {};
    ANSWERS.forEach(function (w) { validSet[w.toUpperCase()] = 1; });
    EXTRA_VALID.forEach(function (w) { validSet[w.toUpperCase()] = 1; });

    var saved = DD.loadState('drop-five', day) || { guesses: [], finished: false, won: false };

    var ROWS = 6, COLS = 5;
    var state = {
      day: day,
      answer: answer,
      guesses: saved.guesses.slice(),
      current: '',
      finished: !!saved.finished,
      won: !!saved.won,
      keyHints: {} // letter -> 'correct'|'present'|'absent'
    };

    // Re-derive keyHints from guesses
    state.guesses.forEach(function (g) { recomputeKeyHints(g); });

    function recomputeKeyHints(guess) {
      var marks = scoreGuess(guess, state.answer);
      for (var i = 0; i < guess.length; i++) {
        var l = guess[i], cur = state.keyHints[l];
        var mk = marks[i];
        if (mk === 'correct') state.keyHints[l] = 'correct';
        else if (mk === 'present' && cur !== 'correct') state.keyHints[l] = 'present';
        else if (mk === 'absent' && !cur) state.keyHints[l] = 'absent';
      }
    }

    mount.innerHTML =
      '<div class="df-board" id="df-board"></div>' +
      '<div class="df-keyboard" id="df-keyboard"></div>';

    var board = document.getElementById('df-board');
    for (var r = 0; r < ROWS; r++) {
      var row = document.createElement('div');
      row.className = 'df-row';
      row.dataset.r = r;
      for (var c = 0; c < COLS; c++) {
        var t = document.createElement('div');
        t.className = 'df-tile';
        t.dataset.r = r; t.dataset.c = c;
        row.appendChild(t);
      }
      board.appendChild(row);
    }

    var KEYS = [
      ['Q','W','E','R','T','Y','U','I','O','P'],
      ['A','S','D','F','G','H','J','K','L'],
      ['ENTER','Z','X','C','V','B','N','M','BACK']
    ];
    var kb = document.getElementById('df-keyboard');
    KEYS.forEach(function (row) {
      var rEl = document.createElement('div');
      rEl.className = 'df-krow';
      row.forEach(function (k) {
        var btn = document.createElement('button');
        btn.className = 'df-key' + (k === 'ENTER' || k === 'BACK' ? ' wide' : '');
        btn.dataset.key = k;
        btn.textContent = k === 'BACK' ? '⌫' : k;
        btn.type = 'button';
        rEl.appendChild(btn);
      });
      kb.appendChild(rEl);
    });

    paint();

    if (state.finished) showResult();

    // Input handlers
    document.addEventListener('keydown', onKey);
    kb.addEventListener('click', function (e) {
      var b = e.target.closest('.df-key');
      if (!b) return;
      handleKey(b.dataset.key);
    });

    function onKey(e) {
      if (state.finished) return;
      if (e.key === 'Enter') handleKey('ENTER');
      else if (e.key === 'Backspace') handleKey('BACK');
      else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
    }

    function handleKey(k) {
      if (state.finished) return;
      if (k === 'ENTER') return submit();
      if (k === 'BACK') { state.current = state.current.slice(0, -1); paint(); return; }
      if (state.current.length < COLS) { state.current += k; paint(); }
    }

    function paint() {
      var r = state.guesses.length;
      // paint past guesses
      for (var i = 0; i < state.guesses.length; i++) {
        var g = state.guesses[i];
        var marks = scoreGuess(g, state.answer);
        for (var j = 0; j < COLS; j++) {
          var tile = board.querySelector('.df-tile[data-r="' + i + '"][data-c="' + j + '"]');
          tile.textContent = g[j];
          tile.className = 'df-tile filled flip ' + marks[j];
        }
      }
      // paint current row
      if (r < ROWS) {
        for (var j2 = 0; j2 < COLS; j2++) {
          var tile2 = board.querySelector('.df-tile[data-r="' + r + '"][data-c="' + j2 + '"]');
          var ch = state.current[j2] || '';
          tile2.textContent = ch;
          tile2.className = 'df-tile' + (ch ? ' filled' : '');
        }
      }
      // paint future rows blank
      for (var rr = r + (state.current ? 1 : 1); rr < ROWS; rr++) {
        if (rr === r) continue;
        for (var jj = 0; jj < COLS; jj++) {
          var t3 = board.querySelector('.df-tile[data-r="' + rr + '"][data-c="' + jj + '"]');
          t3.textContent = '';
          t3.className = 'df-tile';
        }
      }
      // keyboard hints
      Object.keys(state.keyHints).forEach(function (letter) {
        var b = kb.querySelector('.df-key[data-key="' + letter + '"]');
        if (b) {
          b.classList.remove('correct', 'present', 'absent');
          b.classList.add(state.keyHints[letter]);
        }
      });
    }

    function submit() {
      if (state.current.length !== COLS) {
        flashRow(state.guesses.length, 'Not enough letters');
        return;
      }
      if (!validSet[state.current]) {
        flashRow(state.guesses.length, 'Not in word list');
        return;
      }
      var guess = state.current;
      state.guesses.push(guess);
      state.current = '';
      recomputeKeyHints(guess);
      var won = guess === state.answer;
      paint();
      if (won) {
        state.finished = true; state.won = true;
        DD.saveState('drop-five', day, { guesses: state.guesses, finished: true, won: true });
        DD.recordResult('drop-five', day, true);
        setTimeout(showResult, 700);
      } else if (state.guesses.length >= ROWS) {
        state.finished = true; state.won = false;
        DD.saveState('drop-five', day, { guesses: state.guesses, finished: true, won: false });
        DD.recordResult('drop-five', day, false);
        setTimeout(showResult, 700);
      } else {
        DD.saveState('drop-five', day, { guesses: state.guesses, finished: false, won: false });
      }
    }

    function flashRow(r, msg) {
      var row = board.querySelector('.df-row[data-r="' + r + '"]');
      if (row) { row.classList.add('shake'); setTimeout(function () { row.classList.remove('shake'); }, 450); }
      DD.toast(msg);
    }

    function showResult() {
      var stats = DD.loadStats('drop-five');
      var emojiMap = { correct: '🟩', present: '🟨', absent: '⬛' };
      var grid = state.guesses.map(function (g) {
        return scoreGuess(g, state.answer).map(function (m) { return emojiMap[m]; }).join('');
      }).join('\n');
      var headerLine = 'Drop Five · Day ' + day + ' · ' + (state.won ? state.guesses.length : 'X') + '/6';
      var shareText = headerLine + '\n' + grid + '\nhttps://datadripco.com/puzzles/drop-five/';
      var panel = DD.buildResultPanel({
        won: state.won,
        title: state.won ? 'Solved in ' + state.guesses.length + '!' : 'The word was',
        answer: state.answer,
        stats: [
          { v: stats.played, l: 'Played' },
          { v: stats.played ? Math.round((stats.wins/stats.played)*100) + '%' : '0%', l: 'Win rate' },
          { v: stats.streak, l: 'Streak' },
          { v: stats.bestStreak, l: 'Best' }
        ],
        shareText: shareText
      });
      mount.parentNode.appendChild(panel);
    }
  }

  function scoreGuess(guess, answer) {
    var marks = ['absent','absent','absent','absent','absent'];
    var counts = {};
    for (var i = 0; i < 5; i++) {
      if (guess[i] === answer[i]) marks[i] = 'correct';
      else counts[answer[i]] = (counts[answer[i]] || 0) + 1;
    }
    for (var j = 0; j < 5; j++) {
      if (marks[j] === 'correct') continue;
      var c = guess[j];
      if (counts[c] > 0) { marks[j] = 'present'; counts[c]--; }
    }
    return marks;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
