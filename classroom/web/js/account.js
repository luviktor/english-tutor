// Logging out: important on the school's shared computers.

import * as api from './api.js';
import { state, closeSession } from './state.js';
import { confirmDialog } from './ui.js';

export async function logout() {
  const name = state.pupil?.name;
  if (!(await confirmDialog(name ? `Kilépsz, ${name}?` : 'Kilépsz?', { icon: '🚪', yes: 'Kilépek', no: 'Maradok' }))) return;
  if (state.pupil && !(await closeSession())) {
    const anyway = await confirmDialog(
      'Nem sikerült mindent elmenteni (nincs internet?). Ha most kilépsz, a hiányzó rész ezen a gépen marad, '
      + 'és a következő belépésedkor elküldöm. Kilépsz így is?',
      { icon: '📡', yes: 'Kilépek', no: 'Maradok' });
    if (!anyway) return;
  }
  api.forgetPassword();
  location.reload();
}
