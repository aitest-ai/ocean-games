// Level types. To add one: write its rules (see run.js) and its picture (src/quiz/views/), then
// list it here and in VIEWS (src/quiz/views/index.js). How-to: docs/quiz.md「之後怎麼加新關卡類型」.
import { run } from './run.js';
import { tf } from './tf.js';
import { buzz } from './buzz.js';

export const LEVELS = { run, tf, buzz };
export const LEVEL_ORDER = ['run', 'tf', 'buzz'];
