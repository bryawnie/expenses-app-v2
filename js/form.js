'use strict';
/* Formulario compartido por Registrar y la hoja de edición. */

/** Borrador vacío. Los flags *Touched evitan que el autocompletado pise lo que el usuario ya eligió. */
function newForm() {
  return {
    kind: 'gasto',   // 'gasto' | 'ingreso' | 'traspaso'
    amount: '',      // solo dígitos
    name: '',
    desc: '',
    date: today(),
    type: '',
    acct: S.last.acct || '',
    to: '',          // cuenta destino (solo traspasos)
    typeTouched: false,
    acctTouched: !!S.last.acct,
    descTouched: false
  };
}

function formHTML(form, isEdit) {
  const kinds = [['gasto', 'Gasto'], ['ingreso', 'Ingreso']];
  if (!isEdit) kinds.push(['traspaso', 'Traspaso']);

  return `
  <div class="seg" role="group" aria-label="Tipo de movimiento">
    ${kinds.map(([k, label]) => `<button type="button" data-fk="${k}">${label}</button>`).join('')}
  </div>
  <div class="amt-in"><span>$</span><input id="f-amount" inputmode="numeric" autocomplete="off" placeholder="0" aria-label="Monto" value="${form.amount ? clp.format(+form.amount) : ''}"></div>
  <div id="f-name-wrap"><label class="f">Comercio o nombre<input id="f-name" list="names" autocomplete="off" autocapitalize="sentences" value="${esc(form.name)}"></label></div>
  <label class="f"><span id="f-desc-lbl">Descripción</span><input id="f-desc" autocomplete="off" autocapitalize="sentences" value="${esc(form.desc)}"></label>
  <div class="row">
    <label class="f">Fecha<input type="date" id="f-date" value="${esc(form.date)}"></label>
    <div class="quick"><button type="button" data-fd="0">Hoy</button><button type="button" data-fd="-1">Ayer</button></div>
  </div>
  <div id="f-type-wrap"><label class="f">Tipo<select id="f-type"></select></label></div>
  <div><div class="lbl" id="f-acct-lbl">Cuenta</div><div class="chips" id="f-acct"></div></div>
  <div id="f-to-wrap"><div class="lbl">Destino</div><div class="chips" id="f-to"></div></div>
  <div class="err" id="f-err" role="alert"></div>
  <button class="primary" type="button" id="f-save">${isEdit ? 'Guardar cambios' : 'Guardar'}</button>
  ${isEdit ? '<button class="danger" type="button" id="f-del">Eliminar movimiento</button>' : ''}`;
}

/** Formulario activo: { root, f: borrador, opts: { mode: 'new' | 'edit', onSubmit, onDelete } }. */
let FORM = null;

function mountForm(root, form, opts) {
  FORM = { root, f: form, opts };
  root.innerHTML = formHTML(form, opts.mode === 'edit');
  refreshForm();
}

/** Botones tipo "chip" para elegir una cuenta. `attr` es el data-* que identifica al grupo. */
function chipsHTML(list, selected, attr) {
  if (!list.length) {
    return '<span class="muted small">Aún no hay opciones. Sincroniza para cargarlas desde tu planilla.</span>';
  }
  return list
    .map(x => `<button type="button" data-${attr}="${esc(x)}" class="${x === selected ? 'on' : ''}">${esc(x)}</button>`)
    .join('');
}

function defaultTransferDesc(toAccount) {
  return accountConfig(toAccount).kind === 'credito' ? 'Pago ' + toAccount : 'Traspaso a ' + toAccount;
}

/** Sincroniza la apariencia del formulario con su borrador (qué botones están activos, qué campos se ven…). */
function refreshForm() {
  if (!FORM || !document.body.contains(FORM.root)) return;
  const { root, f, opts } = FORM;
  const isEdit = opts.mode === 'edit';
  const isTransferForm = f.kind === 'traspaso';

  root.querySelectorAll('[data-fk]').forEach(b => b.classList.toggle('on', b.dataset.fk === f.kind));
  $('#f-name-wrap', root).hidden = isTransferForm;
  $('#f-type-wrap', root).hidden = isTransferForm;
  $('#f-to-wrap', root).hidden = !isTransferForm;
  $('#f-acct-lbl', root).textContent = isTransferForm ? 'Desde' : 'Cuenta';

  // Al registrar no se ofrece el tipo "traspaso" (para eso está el botón Traspaso del formulario).
  const types = isEdit ? S.data.types : S.data.types.filter(t => !isTransfer(t));
  const select = $('#f-type', root);
  const signature = types.join('\u0001');
  if (select.dataset.sig !== signature) {
    select.innerHTML =
      '<option value="">Elige un tipo…</option>' +
      types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    select.dataset.sig = signature;
  }
  select.value = types.includes(f.type) ? f.type : '';

  $('#f-acct', root).innerHTML = chipsHTML(S.data.accounts, f.acct, 'fa');
  $('#f-to', root).innerHTML = chipsHTML(S.data.accounts.filter(a => a !== f.acct), f.to, 'fo');

  const descInput = $('#f-desc', root);
  descInput.placeholder = isTransferForm ? (f.to ? defaultTransferDesc(f.to) : 'Ej: Pago tarjeta') : '';
}

/** Último movimiento (no traspaso) con ese nombre, para autocompletar tipo, cuenta y descripción. */
function lastByName(name) {
  const target = norm(name);
  if (!target) return null;
  let best = null;
  S.data.rows.forEach(r => {
    if (norm(r[2]) === target && !isTransfer(r[5]) && (!best || r[1] >= best[1])) best = r;
  });
  return best;
}

/** Maneja los eventos que ocurren dentro del formulario. Devuelve true si lo consumió. */
function formEvents(e) {
  if (!FORM) return false;
  const { root, f } = FORM;
  const target = e.target;
  if (!root.contains(target)) return false;

  if (e.type === 'click') {
    const button = target.closest('button');
    if (!button) return false;

    if (button.dataset.fk) {
      f.kind = button.dataset.fk;
      refreshForm();
      return true;
    }
    if (button.dataset.fa !== undefined) {
      f.acct = button.dataset.fa;
      f.acctTouched = true;
      if (f.to === f.acct) f.to = '';
      refreshForm();
      return true;
    }
    if (button.dataset.fo !== undefined) {
      f.to = button.dataset.fo;
      refreshForm();
      return true;
    }
    if (button.dataset.fd !== undefined) {
      f.date = addDays(today(), +button.dataset.fd);
      $('#f-date', root).value = f.date;
      return true;
    }
    if (button.id === 'f-save') {
      const error = FORM.opts.onSubmit(f);
      $('#f-err', root).textContent = error || '';
      return true;
    }
    if (button.id === 'f-del') {
      FORM.opts.onDelete();
      return true;
    }
    return false;
  }

  if (e.type === 'input') {
    if (target.id === 'f-amount') {
      const digits = target.value.replace(/\D/g, '').slice(0, 11);
      f.amount = digits;
      target.value = digits ? clp.format(+digits) : '';
      return true;
    }
    if (target.id === 'f-name') { f.name = target.value; return true; }
    if (target.id === 'f-desc') { f.desc = target.value; f.descTouched = true; return true; }
    if (target.id === 'f-date') { f.date = target.value; return true; }
  }

  if (e.type === 'change' && target.id === 'f-type') {
    f.type = target.value;
    f.typeTouched = true;
    return true;
  }

  // Al terminar de escribir un nombre conocido, sugiere lo que usaste la última vez.
  if (e.type === 'change' && target.id === 'f-name' && FORM.opts.mode === 'new' && f.kind !== 'traspaso') {
    const last = lastByName(target.value);
    if (last) {
      if (!f.typeTouched) f.type = last[5];
      if (!f.acctTouched) f.acct = last[6];
      if (!f.descTouched && !f.desc) {
        f.desc = last[3];
        $('#f-desc', root).value = f.desc;
      }
      refreshForm();
    }
    return true;
  }

  return false;
}
