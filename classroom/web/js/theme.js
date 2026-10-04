// Two looks: the pupils' (css/style.css, the demo's colourful design, which the login screen uses too) and the
// teachers' (css/teacher.css, calmer). index.html loads both stylesheets; the one not in use is switched off with
// media="not all", so exactly one of them styles the page.

import { $ } from './util.js';

const LINKS = { pupil: $('#theme-pupil'), teacher: $('#theme-teacher') };

/** 'pupil' or 'teacher'. */
export function setTheme(name) {
  for (const [theme, link] of Object.entries(LINKS)) link.media = theme === name ? 'all' : 'not all';
}
