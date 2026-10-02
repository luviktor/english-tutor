// Access gate. A code typed on the splash screen unlocks this browser; only the *fact* that the
// browser is unlocked is remembered (a cookie). No code and no name are stored.
//
// The page is static, so these codes are readable in the source: the gate keeps strangers out of
// a children's app, it is not real security. Change the codes below.

const CODES = ['ERKEL'];

const COOKIE = 'erkel_tutor_auth';
const STAY_DAYS = 365;

// Case, accents, spaces and dashes do not matter: "erkel", "Érkel" and "E-R-K-E-L" are the same code.
const normalize = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const VALID = new Set(CODES.map(normalize));

// Scoped to the app's own folder, so a GitHub Pages sub-path (/EnglishTutor/) does not leak the
// cookie to the other projects on the same github.io host.
const cookiePath = () => new URL('.', document.baseURI).pathname;

export const isAuthenticated = () => document.cookie.split('; ').includes(`${COOKIE}=1`);

/** Checks the code; if it is valid, marks this browser as authenticated. `stay` keeps the
 *  cookie for a year, otherwise it is a session cookie that goes away when the browser closes. */
export function tryLogin(code, { stay = false } = {}) {
  const typed = normalize(code);
  if (!typed || !VALID.has(typed)) return false;
  const parts = [`${COOKIE}=1`, `path=${cookiePath()}`, 'SameSite=Lax'];
  if (stay) parts.push(`max-age=${STAY_DAYS * 86400}`);
  if (location.protocol === 'https:') parts.push('Secure');
  document.cookie = parts.join('; ');
  return true;
}
