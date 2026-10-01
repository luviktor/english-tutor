// Hungarian phrases the mascot says. Easy to extend: just add lines to the lists.

import { pick } from './util.js';
import { state, peekToday, streakNow } from './state.js';

const name = () => state.data.player.name;

export const praise = () => pick([
  'Szuper!', 'Ügyes vagy!', 'Fantasztikus!', 'Zseniális!', 'Így van!', 'Szép munka!',
  'Tökéletes!', `Bravó, ${name()}!`, `Ügyes vagy, ${name()}!`, 'Ez az!',
]);

export const oops = () => pick([
  'Semmi baj, így tanulunk!', 'Majdnem!', 'Nem baj, legközelebb sikerül!', 'Ez egy nehéz volt!',
]);

export const finishLine = rating => ({
  3: `Hibátlan munka, ${name()}! Te egy csillag vagy!`,
  2: `Nagyon ügyes voltál, ${name()}!`,
  1: `Szép próbálkozás, ${name()}! Gyakorolj még, és menni fog!`,
}[rating]);

export function homeLine() {
  const n = name();
  const today = peekToday();
  const goal = state.data.settings.dailyGoal;
  const streak = streakNow();
  if (today.goalDone) return pick([`Ma már megvan a napi célod! Zseniális vagy, ${n}!`, `Mára kész a nagy cél, ${n}! 🎉`]);
  if (today.done > 0) return `Még ${goal - today.done} szó, és megkapod a napi ajándékot! 🎁`;
  if (streak >= 2) return `${streak} napja gyakorolsz egymás után! Folytassuk a sorozatot! 🔥`;
  return pick([
    `Szia, ${n}! Kezdjünk egy kis angolt!`,
    `Készen állsz, ${n}? Tanuljunk együtt!`,
    `Ma is nagyot alkotunk, ${n}!`,
    `Hello ${n}! Ez angolul azt jelenti: szia!`,
  ]);
}
