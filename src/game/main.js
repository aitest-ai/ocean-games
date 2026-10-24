// Entry point of game/index.html: ?g=kayak | surf | sail picks the game, the shell runs it.
import { runGame } from './shell.js';

const MODES = {
  kayak: () => import('./kayak.js').then((m) => m.kayak),
  surf: () => import('./surf.js').then((m) => m.surf),
  sail: () => import('./sail.js').then((m) => m.sail),
};
const id = new URLSearchParams(location.search).get('g');
runGame(await (MODES[id] || MODES.kayak)());
