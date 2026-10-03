// Celebrations after an answer: floating XP, combo / sticker / daily-goal toasts and confetti.

import { floatText, toast, confetti } from './fx.js';
import { sfx } from './sound.js';

export function celebrate(result, word, anchor) {
  if (result.xp) floatText(anchor, `+${result.xp} XP${result.stars ? ` · +${result.stars} ⭐` : ''}`);
  if ([5, 10, 15, 20].includes(result.combo)) {
    toast('🔥', `${result.combo} jó válasz egymás után!`);
    confetti({ count: 70, power: 0.8 });
  }
  if (result.mastered) {
    toast('🥇', `Arany kártya: ${word.english}!`);
    confetti({ count: 90 });
    sfx('coin');
  }
  if (result.goal) {
    toast('🎁', `Napi cél kész! +${result.goal.stars} ⭐`);
    confetti({ count: 160 });
    sfx('win');
  }
}
