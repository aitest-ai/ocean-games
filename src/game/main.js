// Entry point of game/index.html: ?g=kayak | surf | sail | batting picks the game, the shell runs it.
import { runGame } from './shell.js';

// every game, for the "other games" links (series: ocean / land)
const GAMES = [
  { id: 'kayak', icon: '🛶', title: '划舟', series: 'ocean', load: () => import('./kayak.js').then((m) => m.kayak) },
  { id: 'surf', icon: '🏄', title: '衝浪', series: 'ocean', load: () => import('./surf.js').then((m) => m.surf) },
  { id: 'sail', icon: '⛵', title: '帆船', series: 'ocean', load: () => import('./sail.js').then((m) => m.sail) },
  { id: 'batting', icon: '⚾', title: '打擊練習', series: 'land', load: () => import('./batting.js').then((m) => m.batting) },
];
const id = new URLSearchParams(location.search).get('g');
const g = GAMES.find((x) => x.id === id) || GAMES[0];
await runGame(await g.load(), GAMES);
