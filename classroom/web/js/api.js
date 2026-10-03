// Talks to EnglishTutor.Api, which Azure Static Web Apps serves on the same origin under /api.
// After login every request carries the password in a header; the password is kept in this
// browser's localStorage, so a pupil types it once per device.
// URLs are relative so the app also works below a sub-path.

const PASSWORD_KEY = 'englishtutor-password';
const PASSWORD_HEADER = 'X-EnglishTutor-Password';

export class ApiError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

/** Letters and digits only, lower-case, no accents: the server compares passwords the same way. */
export const normalizePassword = s =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');

let password = (() => { try { return localStorage.getItem(PASSWORD_KEY) || ''; } catch { return ''; } })();
let onUnauthorized = () => {};

export const hasPassword = () => !!password;

/** Called when the server no longer accepts the stored password (e.g. the teacher changed it). */
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export function forgetPassword() {
  password = '';
  try { localStorage.removeItem(PASSWORD_KEY); } catch { /* private mode */ }
}

async function request(method, path, { body, keepalive = false, auth = true } = {}) {
  const headers = {};
  if (auth) headers[PASSWORD_HEADER] = password;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch('api/' + path, {
    method, headers, keepalive, cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401 && auth) onUnauthorized();
    throw new ApiError(r.status, data);
  }
  return data;
}

/** Returns { id, name, role } and remembers the password, or throws ApiError(401). */
export async function login(typed) {
  const candidate = normalizePassword(typed);
  const identity = await request('POST', 'login', { body: { password: candidate }, auth: false });
  password = candidate;
  try { localStorage.setItem(PASSWORD_KEY, candidate); } catch { /* private mode: ask again next time */ }
  return identity;
}

/** Checks the remembered password; also wakes the API up after an idle period. */
export const whoAmI = () => request('POST', 'login', { body: { password }, auth: false });

export async function getDictionary() {
  const r = await fetch('api/dictionary');
  if (!r.ok) throw new Error('dictionary ' + r.status);
  return r.json();
}

/** { revision, updatedAt, data } or null when the pupil has not saved anything yet. */
export const loadProgress = () => request('GET', 'progress');

/** Resolves to { revision, updatedAt }; a stale revision throws ApiError(409) with the newer copy as body. */
export const saveProgress = (data, revision, { keepalive = false } = {}) =>
  request('PUT', 'progress', { body: { revision, data }, keepalive });
