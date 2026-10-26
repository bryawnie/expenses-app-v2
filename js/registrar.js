'use strict';
/* Pantalla Registrar. */

function recentHTML() {
  const rows = viewRows().filter(r => !isTransfer(r.t)).slice(0, 4);
  if (!rows.length) return '';

  const items = rows
    .map(r => `<div class="item" style="cursor:default">
      ${iconHTML(r.t)}
      <span class="mid"><b>${esc(r.n || '—')}</b><small>${esc(dayMonth(r.d))} · ${esc(r.c)}</small></span>
      ${amountHTML(r)}
    </div>`)
    .join('');
  return `<div class="card"><h2>Últimos registros</h2>${items}</div>`;
}

function renderRegistrar(view) {
  if (!S.form) S.form = newForm();
  const banner = S.settings.url
    ? ''
    : '<div class="banner">Aún no está conectada tu planilla. Ve a <b>Ajustes</b> y pega la URL y el token.</div>';

  view.innerHTML = `${banner}<div class="card" id="formCard"></div><div id="recent">${recentHTML()}</div>`;
  mountForm($('#formCard'), S.form, { mode: 'new', onSubmit: submitNew });
}

/** Valida el formulario y encola el alta. Devuelve un mensaje de error, o '' si todo salió bien. */
function submitNew(f) {
  const amount = +f.amount;
  if (!amount) return 'Ingresa un monto.';
  const date = f.date || today();

  let items;
  if (f.kind === 'traspaso') {
    // Un traspaso son dos movimientos: sale de una cuenta y entra en la otra.
    if (!f.acct || !f.to) return 'Elige la cuenta de origen y la de destino.';
    const desc = f.desc.trim() || defaultTransferDesc(f.to);
    const type = transferType();
    items = [
      { id: uid(), date, name: 'Transferencia', desc, amount: -amount, type, account: f.acct },
      { id: uid(), date, name: 'Transferencia', desc, amount: amount, type, account: f.to }
    ];
  } else {
    if (!f.name.trim()) return 'Escribe el comercio o nombre.';
    if (!f.type) return 'Elige un tipo.';
    if (!f.acct) return 'Elige una cuenta.';
    items = [{
      id: uid(),
      date,
      name: f.name.trim(),
      desc: f.desc.trim(),
      amount: f.kind === 'gasto' ? -amount : amount,
      type: f.type,
      account: f.acct
    }];
  }

  S.last.acct = f.acct;
  store.set('last', S.last);
  enqueue({ action: 'add', payload: { items } });
  toast(f.kind === 'traspaso' ? 'Traspaso guardado ✓' : 'Guardado ✓');

  S.form = newForm();
  S.form.acct = S.last.acct;
  render();
  const amountInput = $('#f-amount');
  if (amountInput) amountInput.focus();
  return '';
}
