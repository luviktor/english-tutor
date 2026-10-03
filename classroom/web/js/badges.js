// Trophies. To add a new one, add a line to BADGES: test(c) decides when it is earned.
//   c.s      = the progress object        c.known   = words at level 3+
//   c.mastered = words at level 5 (gold card)  c.total   = number of words in the dictionary
//   c.level  = player level               c.topicMaster = a whole topic known at level 4+

import { state, commit } from './state.js';
import { dict, wordsOf } from './dict.js';
import { levelInfo } from './levels.js';
import { todayStr } from './util.js';

export const BADGES = [
  { id: 'first_round', emoji: '🚀', name: 'Első lépések', desc: 'Fejezz be egy játékot!', test: c => c.s.stats.rounds >= 1 },
  { id: 'perfect', emoji: '💯', name: 'Hibátlan!', desc: 'Játssz végig egy kört hiba nélkül.', test: c => c.s.stats.perfectRounds >= 1 },
  { id: 'perfect5', emoji: '🌟', name: 'Tökéletes ötös', desc: '5 hibátlan kör.', test: c => c.s.stats.perfectRounds >= 5 },
  { id: 'combo5', emoji: '🔥', name: 'Tűzben égek', desc: '5 jó válasz egymás után.', test: c => c.s.stats.bestCombo >= 5 },
  { id: 'combo10', emoji: '☄️', name: 'Megállíthatatlan', desc: '10 jó válasz egymás után.', test: c => c.s.stats.bestCombo >= 10 },
  { id: 'streak3', emoji: '📆', name: '3 napos sorozat', desc: 'Gyakorolj 3 napon át egymás után.', test: c => c.s.streak.best >= 3 },
  { id: 'streak7', emoji: '🗓️', name: 'Hétpróbás', desc: 'Gyakorolj 7 napon át egymás után.', test: c => c.s.streak.best >= 7 },
  { id: 'goal1', emoji: '🎁', name: 'Napi cél', desc: 'Teljesítsd a napi célt.', test: c => c.s.stats.goalDays >= 1 },
  { id: 'goal7', emoji: '🏅', name: 'Célba érő', desc: '7 napon teljesítsd a napi célt.', test: c => c.s.stats.goalDays >= 7 },
  { id: 'known10', emoji: '🌱', name: '10 szót tudok', desc: 'Tanulj meg 10 szót.', test: c => c.known >= 10 },
  { id: 'known25', emoji: '🌿', name: '25 szót tudok', desc: 'Tanulj meg 25 szót.', test: c => c.known >= 25 },
  { id: 'known50', emoji: '🌳', name: '50 szót tudok', desc: 'Tanulj meg 50 szót.', test: c => c.known >= 50 },
  { id: 'master1', emoji: '🥇', name: 'Első arany kártya', desc: 'Szerezd meg az első arany kártyát.', test: c => c.mastered >= 1 },
  { id: 'master10', emoji: '🏆', name: 'Kártyagyűjtő', desc: '10 arany kártya.', test: c => c.mastered >= 10 },
  { id: 'topic', emoji: '🎓', name: 'Témamester', desc: 'Ismerj meg egy téma minden szavát.', test: c => c.topicMaster },
  { id: 'typist', emoji: '⌨️', name: 'Gyorsgépelő', desc: '25 szót írj be hibátlanul.', test: c => c.s.stats.typedOk >= 25 },
  { id: 'typist100', emoji: '🖥️', name: 'Gépíró bajnok', desc: '100 szót írj be hibátlanul.', test: c => c.s.stats.typedOk >= 100 },
  { id: 'listener', emoji: '👂', name: 'Éles fül', desc: '30 jó válasz a hallgatós játékban.', test: c => c.s.stats.listenOk >= 30 },
  { id: 'memory', emoji: '🐘', name: 'Elefánt-memória', desc: 'Nyerj a Párkeresőben nagyon kevés lépésből.', test: c => c.s.stats.memoryPerfect >= 1 },
  { id: 'level5', emoji: '🔭', name: '5. szint', desc: 'Érj el az 5. szintre.', test: c => c.level >= 5 },
  { id: 'level10', emoji: '🧙', name: '10. szint', desc: 'Érj el a 10. szintre.', test: c => c.level >= 10 },
  { id: 'shopper', emoji: '🎭', name: 'Stílusos', desc: 'Vásárolj valamit az Avatar boltban.', test: c => c.s.shop.owned.length >= 1 },
];

function context() {
  const s = state.data;
  const lvl = w => s.words[w.key]?.lvl ?? -1;
  return {
    s,
    known: dict.words.filter(w => lvl(w) >= 3).length,
    mastered: dict.words.filter(w => lvl(w) >= 5).length,
    total: dict.words.length,
    level: levelInfo(s.player.xp).level,
    topicMaster: dict.topics.some(t => {
      const ws = wordsOf(t.name);
      return ws.length >= 5 && ws.every(w => lvl(w) >= 4);
    }),
  };
}

/** Awards every trophy that is newly deserved and returns them. */
export function grantBadges() {
  const c = context();
  const earned = [];
  for (const b of BADGES) {
    if (!state.data.badges[b.id] && b.test(c)) {
      state.data.badges[b.id] = todayStr();
      earned.push(b);
    }
  }
  if (earned.length) commit();
  return earned;
}
