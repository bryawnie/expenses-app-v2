'use strict';
/* Eventos globales e inicio de la app. */

/** Acciones de los botones con data-act="…" (delegación de eventos sobre document). */
const ACTIONS = {
  tab(el) {
    S.tab = el.dataset.tab;
    if (S.tab === 'registrar') S.form = S.form || newForm();
    render();
    window.scrollTo(0, 0);
  },

  // Navegación de meses
  mprev() { S.month = monthShift(S.month, -1); render(); },
  mnext() {
    if (S.month >= currentMonth()) return;
    S.month = monthShift(S.month, 1);
    render();
  },
  pickmonth(el) { S.month = el.dataset.key; render(); },

  // Filtros de Movimientos
  facct(el) { S.filter.acct = el.dataset.v; render(); },
  'fcat-clear'() { S.filter.cat = ''; render(); },
  gocat(el) {
    S.filter.cat = el.dataset.c;
    S.tab = 'movimientos';
    render();
    window.scrollTo(0, 0);
  },
  edit(el) {
    const row = S.listRows[+el.dataset.i];
    if (row) openEdit(row);
  },

  // Tarjetas
  card(el) { S.card = { name: el.dataset.c, p: 1 }; render(); },
  pprev() { S.card.p++; render(); },
  pnext() {
    if (S.card.p <= 0) return;
    S.card.p--;
    render();
  },
  tick(el) {
    const { k, s } = el.dataset;
    S.checks[k] = S.checks[k] || {};
    S.checks[k][s] = !S.checks[k][s];
    persistChecks();
    render();
  },

  // Ajustes
  async saveconn() {
    S.settings = { url: $('#s-url').value.trim(), token: $('#s-token').value.trim() };
    store.set('settings', S.settings);
    $('#connMsg').textContent = 'Probando…';
    S.status = 'ok';
    await sync();
    if (S.tab === 'ajustes') render();
    toast(S.err ? 'No se pudo conectar' : 'Conectado ✓');
  },
  savecfg() {
    saveConfigNow(readSettingsForm());
    toast('Guardado ✓');
    render();
  },
  syncnow() { sync(); },
  discard() {
    if (!confirm('¿Descartar los cambios que aún no se envían a la planilla?')) return;
    S.queue = [];
    saveQueue();
    render();
  },
  clearlocal() {
    if (!confirm('¿Borrar la copia local? Tu planilla no se toca.')) return;
    ['data', 'queue', 'checks', 'last'].forEach(k => localStorage.removeItem('gt.' + k));
    location.reload();
  }
};

document.addEventListener('click', e => {
  if (formEvents(e)) return;
  if (e.target.id === 'overlay') { closeSheet(); return; }

  const el = e.target.closest('[data-act]');
  if (el === null) return;
  const action = ACTIONS[el.dataset.act];
  if (action) action(el);
});

document.addEventListener('input', e => {
  if (formEvents(e)) return;
  const target = e.target;

  if (target.id === 'q') {
    S.filter.q = target.value;
    updateMovList();
  }
  // Campos de monto: muestran el número con separador de miles mientras se escribe.
  if (target.id === 'stmt' || target.classList.contains('bud')) {
    const digits = target.value.replace(/\D/g, '').slice(0, 11);
    target.value = digits ? clp.format(+digits) : '';
  }
});

document.addEventListener('change', e => {
  if (formEvents(e)) return;
  const target = e.target;

  // Total del estado de cuenta de una tarjeta
  if (target.id === 'stmt') {
    const config = JSON.parse(JSON.stringify(S.data.config));
    const amount = +target.value.replace(/\D/g, '');
    if (amount) config.statements[target.dataset.key] = amount;
    else delete config.statements[target.dataset.key];
    saveConfigNow(config);
    render();
  }

  // Cambiar el tipo de una cuenta muestra u oculta sus días de cierre y vencimiento.
  if (target.matches('.cfgrow select.k')) {
    S.data.config = readSettingsForm();
    renderAjustes($('#view'));
  }
});

$('#syncBtn').addEventListener('click', () => {
  S.status = 'ok';
  sync();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.editing) closeSheet();

  // Enter en un campo del formulario = Guardar
  const inForm = FORM && FORM.root.contains(e.target);
  if (e.key === 'Enter' && e.target.tagName === 'INPUT' && inForm && e.target.type !== 'date') {
    e.preventDefault();
    const saveButton = $('#f-save', FORM.root);
    if (saveButton) saveButton.click();
  }
});

window.addEventListener('online', () => { S.status = 'ok'; sync(); });
window.addEventListener('offline', () => { S.status = 'offline'; setStatus(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() - S.lastSync > 30000) sync();
});


/* ---------------------------------- Inicio --------------------------------- */

importHash();
S.form = newForm();
render();
sync();

const isSecureContext = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if ('serviceWorker' in navigator && isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
