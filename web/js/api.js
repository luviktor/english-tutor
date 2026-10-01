// Talks to server.py. Progress lives in data/progress.json on the host machine.

const WRITE_HEADERS = { 'X-Requested-With': 'nora-tutor', 'Content-Type': 'application/json' };

export async function getDictionary() {
  const r = await fetch('/api/dictionary', { cache: 'no-store' });
  if (!r.ok) throw new Error('dictionary ' + r.status);
  return r.json();
}

export async function loadProgress() {
  const r = await fetch('/api/progress', { cache: 'no-store' });
  if (r.status === 204) return null;
  if (!r.ok) throw new Error('progress ' + r.status);
  return r.json();
}

export async function saveProgress(data, { keepalive = false } = {}) {
  const r = await fetch('/api/progress', {
    method: 'POST',
    headers: WRITE_HEADERS,
    body: JSON.stringify(data),
    keepalive,
  });
  if (!r.ok) throw new Error('save ' + r.status);
}
