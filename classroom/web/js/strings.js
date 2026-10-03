// Hungarian phrases the coach says. Easy to extend: just add lines to the lists.

import { pick } from './util.js';
import { state, peekToday, streakNow } from './state.js';

/** The title the pupils see. */
export const APP_TITLE = 'Angol kaland';

const name = () => state.data.player.name;

export const praise = () => pick([
  'Szuper!', 'Így van!', 'Pontosan!', 'Szép munka!', 'Telitalálat!', 'Kiváló!',
  'Ez az!', `Ez az, ${name()}!`, `Szép volt, ${name()}!`,
]);

export const oops = () => pick([
  'Semmi baj, így tanulunk.', 'Majdnem!', 'Legközelebb sikerül.', 'Ez nehéz volt.',
]);

export const finishLine = rating => ({
  3: `Hibátlan kör, ${name()}!`,
  2: `Szép munka, ${name()}!`,
  1: `Jó kezdés, ${name()}. Gyakorolj még, és menni fog!`,
}[rating]);

export function homeLine() {
  const n = name();
  const today = peekToday();
  const goal = state.data.settings.dailyGoal;
  const streak = streakNow();
  if (today.goalDone) return pick([`Mára kész a napi cél. Szép munka, ${n}!`, `A mai cél megvan, ${n}! Ha van kedved, gyakorolj még.`]);
  if (today.done > 0) return `Még ${goal - today.done} szó, és megvan a mai cél! 🎁`;
  if (streak >= 2) return `${streak} napja gyakorolsz egymás után. Ne szakítsd meg a sorozatot! 🔥`;
  return pick([
    `Szia, ${n}! Gyakoroljunk egy kicsit!`,
    `Készen állsz, ${n}? Kezdjük!`,
    `Hello, ${n}! Ez angolul azt jelenti: szia.`,
    `Szia, ${n}! Ma melyik játékkal kezded?`,
  ]);
}
