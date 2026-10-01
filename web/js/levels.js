// Player levels. XP needed to reach level n: 30 * n * (n - 1)  ->  0, 60, 180, 360, 600, 900, ...

export const LEVELS = [
  { emoji: '🥚', title: 'Szó-tojás' },
  { emoji: '🐣', title: 'Kis csibe' },
  { emoji: '🐥', title: 'Szófaló csibe' },
  { emoji: '🐰', title: 'Ugri nyuszi' },
  { emoji: '🦊', title: 'Ravasz róka' },
  { emoji: '🦉', title: 'Bölcs bagoly' },
  { emoji: '🐬', title: 'Szó-delfin' },
  { emoji: '🦄', title: 'Egyszarvú' },
  { emoji: '🐉', title: 'Szó-sárkány' },
  { emoji: '🧙', title: 'Szó-varázsló' },
  { emoji: '👑', title: 'Angol királynő' },
  { emoji: '🚀', title: 'Szuperhős' },
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
