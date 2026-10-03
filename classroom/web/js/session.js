// One round of a game: picks the words, gives XP / stars, and summarises at the end.

import { state, recordAnswer, addXP, addStars, checkDailyGoal, commit } from './state.js';
import { wordsOf } from './dict.js';
import { levelInfo } from './levels.js';
import { grantBadges } from './badges.js';
import { shuffle, todayStr, daysBetween } from './util.js';

/**
 * Chooses n words: the ones that need practice most come first (low level, not seen for a while);
 * at most `maxNew` never-seen words per round, unless the topic has hardly any known words yet.
 */
export function pickWords(topic, n, maxNew = 4) {
  const pool = wordsOf(topic);
  const today = todayStr();
  const known = [];
  const fresh = [];
  for (const w of pool) (state.data.words[w.key] ? known : fresh).push(w);
  const need = w => {
    const r = state.data.words[w.key];
    const since = r.last ? Math.min(daysBetween(r.last, today), 14) : 14;
    return (5 - r.lvl) * 10 + since + Math.random() * 9;
  };
  known.sort((a, b) => need(b) - need(a));
  const wantNew = Math.min(fresh.length, Math.max(n - known.length, Math.min(maxNew, n)));
  return shuffle([...shuffle(fresh).slice(0, wantNew), ...known.slice(0, n - wantNew)]).slice(0, n);
}

export function startSession(game, topic) {
  const startLevel = levelInfo(state.data.player.xp).level;
  let finished = false;
  const s = {
    right: 0, half: 0, wrong: 0, combo: 0, bestCombo: 0, xp: 0, stars: 0,
    answers: [], mastered: [], goal: null,

    /** outcome: 'right' | 'half' (solved with help) | 'wrong'. */
    answer(word, outcome, base = 10) {
      let xp = 0;
      let stars = 0;
      if (outcome === 'right') {
        s.right++; s.combo++;
        s.bestCombo = Math.max(s.bestCombo, s.combo);
        xp = base + Math.min(s.combo - 1, 5) * 2;
        stars = 1;
      } else if (outcome === 'half') {
        s.half++; s.combo = 0;
        xp = Math.round(base / 2);
      } else {
        s.wrong++; s.combo = 0;
      }
      const res = recordAnswer(word.key, outcome, game);
      if (res.mastered) s.mastered.push(word.key);
      addXP(xp);
      addStars(stars);
      s.xp += xp;
      s.stars += stars;
      s.answers.push({ key: word.key, outcome });
      const goal = checkDailyGoal();
      if (goal) { s.goal = goal; s.xp += goal.xp; s.stars += goal.stars; }
      return { xp, stars, combo: s.combo, mastered: res.mastered, goal };
    },

    finish({ rating, memoryPerfect = false } = {}) {
      if (finished) return null;
      finished = true;
      const total = s.right + s.half + s.wrong;
      const acc = total ? (s.right + s.half * 0.5) / total : 0;
      rating = rating ?? (acc >= 0.9 ? 3 : acc >= 0.6 ? 2 : 1);
      const perfect = s.wrong === 0 && s.half === 0 && total >= 4;
      const bonus = perfect ? { xp: 30, stars: 3 } : rating === 3 ? { xp: 15, stars: 1 } : { xp: 0, stars: 0 };
      addXP(bonus.xp);
      addStars(bonus.stars);
      const st = state.data.stats;
      st.rounds++;
      if (perfect) st.perfectRounds++;
      if (memoryPerfect) st.memoryPerfect++;
      st.bestCombo = Math.max(st.bestCombo, s.bestCombo);
      state.data.history.push({
        t: new Date().toISOString(), game, topic, right: s.right, total, rating, xp: s.xp + bonus.xp,
      });
      commit();
      const newBadges = grantBadges().map(b => b.id);
      return {
        game, topic, right: s.right, half: s.half, wrong: s.wrong, total, rating, perfect,
        xp: s.xp + bonus.xp, stars: s.stars + bonus.stars, bonus,
        goal: s.goal, answers: s.answers, mastered: s.mastered, newBadges,
        levelBefore: startLevel, levelAfter: levelInfo(state.data.player.xp).level,
      };
    },
  };
  return s;
}
