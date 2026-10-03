// Player levels. XP needed to reach level n: 30 * n * (n - 1)  ->  0, 60, 180, 360, 600, 900, ...

export const LEVELS = [
  { emoji: '🌱', title: 'Kezdő' },
  { emoji: '🧭', title: 'Felfedező' },
  { emoji: '🎒', title: 'Utazó' },
  { emoji: '🗺️', title: 'Kalandor' },
  { emoji: '🔭', title: 'Kutató' },
  { emoji: '🛡️', title: 'Lovag' },
  { emoji: '⚔️', title: 'Hős' },
  { emoji: '🦉', title: 'Bölcs' },
  { emoji: '🐉', title: 'Sárkányidomár' },
  { emoji: '🧙', title: 'Varázsló' },
  { emoji: '👑', title: 'Bajnok' },
  { emoji: '🚀', title: 'Legenda' },
];

export const levelStart = n => 30 * n * (n - 1);

export function levelInfo(xp) {
  let level = 1;
  while (levelStart(level + 1) <= xp) level++;
  const from = levelStart(level);
  const to = levelStart(level + 1);
  const def = LEVELS[Math.min(level, LEVELS.length) - 1];
  return { level, from, to, pct: (xp - from) / (to - from), emoji: def.emoji, title: def.title };
}
