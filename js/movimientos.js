'use strict';
/* Pantalla Movimientos. */

function renderMovimientos(view) {
  const allPill = `<button class="pill ${S.filter.acct ? '' : 'on'}" data-act="facct" data-v="">Todas</button>`;
  const acctPills = S.data.accounts
    .map(a => `<button class="pill ${S.filter.acct === a ? 'on' : ''}" data-act="facct" data-v="${esc(a)}">${esc(a)}</button>`)
    .join('');
  const catFilter = S.filter.cat
    ? `<div><button class="pill on" data-act="fcat-clear">${esc(S.filter.cat)} ✕</button></div>`
    : '';

  view.innerHTML = `${monthNavHTML()}
  <input class="inp" id="q" type="search" placeholder="Buscar comercio, descripción…" value="${esc(S.filter.q)}" aria-label="Buscar">
  <div class="scroller" id="acctFilter">${allPill}${acctPills}</div>
  ${catFilter}
  <div class="card" id="movCard"></div>`;
  updateMovList();
}

/** Aplica mes, cuenta, categoría y búsqueda, y dibuja la lista agrupada por día. */
function updateMovList() {
  const card = $('#movCard');
  if (!card) return;

  let rows = viewRows().filter(r => r.d.startsWith(S.month));
  if (S.filter.acct) rows = rows.filter(r => r.c === S.filter.acct);
  if (S.filter.cat) rows = rows.filter(r => r.t === S.filter.cat);
  const query = norm(S.filter.q);
  if (query) rows = rows.filter(r => norm(`${r.n} ${r.ds} ${r.t} ${r.c}`).includes(query));
  S.listRows = rows;

  if (!rows.length) {
    const message = S.data.loaded ? 'No hay movimientos con estos filtros.' : 'Aún no hay datos. Conecta tu planilla en Ajustes.';
    card.innerHTML = `<div class="empty">${message}</div>`;
    return;
  }

  const st = stats(S.month, rows);
  let html = `<div class="line2"><span class="muted">Gastos</span><b>${money(st.gasto)}</b></div>`;
  if (st.ingreso) html += `<div class="line2"><span class="muted">Ingresos</span><b>${money(st.ingreso)}</b></div>`;

  // Agrupa por día conservando el índice en S.listRows (lo usa el botón "editar").
  const byDay = {};
  rows.forEach((r, i) => { (byDay[r.d] = byDay[r.d] || []).push([r, i]); });

  Object.keys(byDay).sort().reverse().forEach(day => {
    const dayTotal = byDay[day]
      .filter(([r]) => r.a < 0 && !isTransfer(r.t))
      .reduce((sum, [r]) => sum - r.a, 0);
    html += `<div class="dayhdr"><span>${dayLabel(day)}</span><span>${dayTotal ? money(-dayTotal) : ''}</span></div>`;
    html += byDay[day].map(([r, i]) => movItemHTML(r, i)).join('');
  });
  card.innerHTML = html;
}

function movItemHTML(row, index) {
  const subtitle = `${esc(row.ds)}${row.ds ? ' · ' : ''}${esc(row.c)}`;
  return `<button class="item" data-act="edit" data-i="${index}">
    ${iconHTML(row.t)}
    <span class="mid"><b>${esc(row.n || '—')}</b><small>${subtitle}</small></span>
    ${amountHTML(row, 'Pendiente de sincronizar')}
  </button>`;
}
