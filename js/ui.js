'use strict';
/* Render común: pestañas, toast, componentes compartidos. */

const TITLES = {
  registrar: 'Registrar',
  movimientos: 'Movimientos',
  resumen: 'Resumen',
  tarjetas: 'Tarjetas',
  ajustes: 'Ajustes'
};

/* Las pantallas se definen en archivos que cargan después de este, por eso se resuelven al momento de usarse. */
const RENDERERS = {
  registrar: view => renderRegistrar(view),
  movimientos: view => renderMovimientos(view),
  resumen: view => renderResumen(view),
  tarjetas: view => renderTarjetas(view),
  ajustes: view => renderAjustes(view)
};

/** Dibuja la pantalla actual completa. */
function render() {
  $('#title').textContent = TITLES[S.tab];
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  RENDERERS[S.tab]($('#view'));
  updateNames();
  setStatus();
}

/** Se llama cuando llegan datos nuevos del servidor; evita pisar lo que el usuario está escribiendo. */
function onData() {
  const focused = document.activeElement;
  const isTyping = focused && focused.closest && focused.closest('#view') && /INPUT|SELECT|TEXTAREA/.test(focused.tagName);

  if (S.tab === 'registrar') {
    updateNames();
    const recent = $('#recent');
    if (recent) recent.innerHTML = recentHTML();
    refreshForm();
  } else if (!isTyping) {
    render();
  }

  if ($('#overlay').classList.contains('on') && !S.editing) closeSheet();
}

/** Rellena el <datalist> de autocompletado con los 300 nombres más usados. */
function updateNames() {
  const frequency = {};
  S.data.rows.forEach(r => {
    if (r[2] && !isTransfer(r[5])) frequency[r[2]] = (frequency[r[2]] || 0) + 1;
  });
  const names = Object.keys(frequency).sort((a, b) => frequency[b] - frequency[a]).slice(0, 300);
  $('#names').innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('on'), 2800);
}

/** Ícono redondo de una categoría: su emoji, o la inicial si no tiene. */
function iconHTML(type) {
  const { e, txt } = splitEmoji(type);
  return `<span class="ico" style="--h:${hue(txt)}">${e || esc((txt[0] || '·').toUpperCase())}</span>`;
}

/** Monto con marca de "pendiente de sincronizar" si corresponde. */
function amountHTML(row, pendingTitle) {
  const title = pendingTitle ? ` title="${pendingTitle}"` : '';
  const pendingMark = row.pending ? `<i class="pend"${title}>⏳</i>` : '';
  return `<span class="am ${row.a > 0 ? 'pos' : ''}">${pendingMark}${money(row.a)}</span>`;
}

/** Selector "◀ Mes año ▶". */
function monthNavHTML() {
  const atCurrentMonth = S.month >= currentMonth();
  return `<div class="monthnav">
    <button data-act="mprev" aria-label="Mes anterior">◀</button>
    <b>${monthLabel(S.month)}</b>
    <button data-act="mnext" aria-label="Mes siguiente" ${atCurrentMonth ? 'disabled' : ''}>▶</button>
  </div>`;
}
