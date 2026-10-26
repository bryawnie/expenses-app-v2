'use strict';
/* Estado global de la app (objeto S). */

const S = {
  tab: 'registrar',
  month: currentMonth(),

  // Persistido en localStorage
  settings: store.get('settings', { url: '', token: '' }),
  data: store.get('data', { rows: [], types: [], accounts: [], config: emptyConfig(), loaded: false }),
  queue: store.get('queue', []),          // operaciones pendientes de enviar a la planilla
  last: store.get('last', { acct: '' }),  // última cuenta usada
  checks: store.get('checks', {}),        // cargos marcados al cuadrar tarjetas

  // Solo en memoria
  syncing: false,
  status: 'ok',   // 'ok' | 'offline' | 'error'
  err: '',
  lastSync: 0,
  filter: { acct: '', cat: '', q: '' },   // filtros de Movimientos
  card: { name: '', p: 1 },               // tarjeta y período elegidos (p: 0 = abierto, 1 = último cerrado…)
  form: null,                             // borrador del formulario de Registrar
  listRows: []                            // filas mostradas en Movimientos (para editar por índice)
};

/** Importa URL y token desde el hash (#u=…&t=…) para configurar un dispositivo nuevo con un enlace. */
function importHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (!params.get('u') || !params.get('t')) return;
  S.settings = { url: params.get('u'), token: params.get('t') };
  store.set('settings', S.settings);
  history.replaceState(null, '', location.pathname + location.search);
  S.tab = 'registrar';
}
