// Two back ends, picked automatically:
//  * server.py (localhost): progress lives in data/progress.json on the host machine.
//  * static hosting (GitHub Pages): the dictionary is a pre-built dictionary.json and the
//    progress is kept in this browser's localStorage.
// URLs are relative so the app also works below a sub-path such as /EnglishTutor/.

const WRITE_HEADERS = { 'X-Requested-With': 'nora-tutor', 'Content-Type': 'application/json' };
const STORAGE_KEY = 'nora-tutor-progress';

let dictionary = null;

// Shared by getDictionary() and loadProgress(), which boot in parallel: the first
// answer from the server decides the mode for both.
const modeReady = (async () => {
  try {
    const r = await fetch('api/dictionary', { cache: 'no-store' });
    if (r.ok) { dictionary = await r.json(); return false; }
  } catch { /* no server - use the static files */ }
  return true;
})();

export async function getDictionary() {
  if (!(await modeReady)) return dictionary;
  const r = await fetch('dictionary.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('dictionary ' + r.status);
  return r.json();
}

export async function loadProgress() {
  if (await modeReady) {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }
  const r = await fetch('api/progress', { cache: 'no-store' });
  if (r.status === 204) return null;
  if (!r.ok) throw new Error('progress ' + r.status);
  return r.json();
}

export async function saveProgress(data, { keepalive = false } = {}) {
  if (await modeReady) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return;
  }
  const r = await fetch('api/progress', {
    method: 'POST',
    headers: WRITE_HEADERS,
    body: JSON.stringify(data),
    keepalive,
  });
  if (!r.ok) throw new Error('save ' + r.status);
}
