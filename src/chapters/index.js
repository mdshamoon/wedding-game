import { CONFIG } from '../config.js';
import { runPrologue } from './prologue.js';
import { runCh1 } from './ch1.js';

const lazy = (loader, name) => async (game) => (await loader())[name](game);

export const CHAPTERS = [
  { title: 'Prologue: Lucknow to Kichha', kicker: CONFIG.dates.arrival, run: runPrologue },
  { title: 'Ghar Wapsi', kicker: CONFIG.dates.arrival, run: runCh1 },
  { title: 'Haldi', kicker: CONFIG.dates.haldi, run: lazy(() => import('./haldi.js'), 'runHaldi') },
  { title: 'Sehra Bandi & the Baraat', kicker: CONFIG.dates.nikah, run: lazy(() => import('./sehra.js'), 'runSehra') },
  { title: 'Band, Baaja, Ghodi', kicker: CONFIG.dates.nikah, run: lazy(() => import('./procession.js'), 'runProcession') },
  { title: 'Nikah', kicker: CONFIG.dates.nikah, run: lazy(() => import('./nikah.js'), 'runNikah') },
  { title: 'Walima', kicker: CONFIG.dates.walima, run: lazy(() => import('./walima.js'), 'runWalima') },
  { title: 'Epilogue', kicker: 'Forever', run: lazy(() => import('./epilogue.js'), 'runEpilogue') },
];
