/**
 * Mount script - one bundle, all games.
 * Hugo pages render <div id="dd-game-root" data-game="wordless"></div> and we mount the matching component.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Wordless } from './games/Wordless';
import { SpellingBee } from './games/SpellingBee';
import { MoreLess } from './games/MoreLess';
import { Clueless } from './games/Clueless';
import { Songless } from './games/Songless';
import { LetterPop } from './games/LetterPop';

const REGISTRY: Record<string, React.FC> = {
  wordless: Wordless,
  'spelling-bee': SpellingBee,
  'more-less': MoreLess,
  clueless: Clueless,
  songless: Songless,
  letterpop: LetterPop,
};

function boot() {
  const el = document.getElementById('dd-game-root');
  if (!el) return;
  const slug = el.dataset.game || '';
  const Cmp = REGISTRY[slug];
  if (!Cmp) {
    el.innerHTML = `<p style="color:#fff;padding:2rem">Unknown game: ${slug}</p>`;
    return;
  }
  document.body.classList.add('dd-puzzle-page');
  el.classList.add('dd-games');
  createRoot(el).render(
    <StrictMode>
      <Cmp />
    </StrictMode>
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
