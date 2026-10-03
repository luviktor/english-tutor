// Talks to EnglishTutor.Api, which Azure Static Web Apps serves on the same origin under /api.
// For now the progress is kept in this browser's localStorage.
// URLs are relative so the app also works below a sub-path.

const STORAGE_KEY = 'englishtutor-progress';

export async function getDictionary() {
  const r = await fetch('api/dictionary');
  if (!r.ok) throw new Error('dictionary ' + r.status);
  return r.json();
}

export async function loadProgress() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function saveProgress(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
