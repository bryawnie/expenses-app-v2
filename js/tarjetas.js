'use strict';
/* Pantalla Tarjetas: períodos de facturación y cuadre del estado de cuenta. */

/** Fecha de cierre de una tarjeta en el mes `monthKey` (ajustada si el mes es más corto que el día de cierre). */
function closeDateFor(card, monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${monthKey}-${pad(Math.min(accountConfig(card).closeDay, daysInMonth(y, m)))}`;
}

/**
 * Período de facturación de una tarjeta. `offset` 0 = período abierto (aún sin cerrar),
 * 1 = último cerrado, 2 = el anterior, etc. Devuelve { start, end, open }.
 */
function periodFor(card, offset) {
  const now = today();
  const thisMonth = now.slice(0, 7);
  const openPeriodEnd = now <= closeDateFor(card, thisMonth)
    ? closeDateFor(card, thisMonth)
    : closeDateFor(card, monthShift(thisMonth, 1));

  const endMonth = monthShift(openPeriodEnd.slice(0, 7), -offset);
  const end = closeDateFor(card, endMonth);
  const start = addDays(closeDateFor(card, monthShift(endMonth, -1)), 1);
  return { start, end, open: offset === 0 };
}

function persistChecks() {
  store.set('checks', S.checks);
}

function renderTarjetas(view) {
  const cards = creditCards();
  if (!cards.length) {
    view.innerHTML = `<div class="card empty">No hay tarjetas de crédito marcadas.<br>Ve a <b>Ajustes → Cuentas</b>, elige “Crédito” para tus tarjetas e indica su día de cierre.<br><br><button class="ghost" data-act="tab" data-tab="ajustes">Ir a Ajustes</button></div>`;
    return;
  }
  if (!cards.includes(S.card.name)) S.card = { name: cards[0], p: 1 };

  const name = S.card.name;
  const config = accountConfig(name);
  const rows = viewRows().filter(r => r.c === name);
  const totalDebt = -rows.reduce((sum, r) => sum + r.a, 0);

  let html = `<div class="scroller">${cards
    .map(c => `<button class="pill ${c === name ? 'on' : ''}" data-act="card" data-c="${esc(c)}">${esc(c)}</button>`)
    .join('')}</div>`;

  const debtNote = totalDebt < 0
    ? `Saldo a favor de ${money(-totalDebt)}`
    : 'Suma de todos los movimientos de esta tarjeta';
  html += `<div class="card"><div class="muted small">Deuda según tu planilla</div><div class="hero">${money(Math.max(totalDebt, 0))}</div><div class="muted small">${debtNote}</div></div>`;

  if (!config.closeDay) {
    html += `<div class="banner">Indica el día de cierre de ${esc(name)} en <b>Ajustes → Cuentas</b> para cuadrar el estado de cuenta.</div>`;
    view.innerHTML = html;
    return;
  }

  const period = periodFor(name, S.card.p);
  const periodRows = rows
    .filter(r => r.d >= period.start && r.d <= period.end)
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));

  // Totales del período
  let compras = 0;   // compras normales
  let devol = 0;     // devoluciones
  let pagos = 0;     // pagos recibidos desde otra cuenta (traspaso entrante)
  let cargosTr = 0;  // traspasos salientes cargados a la tarjeta (ej. avances)
  periodRows.forEach(r => {
    if (isTransfer(r.t)) {
      if (r.a > 0) pagos += r.a;
      else cargosTr += -r.a;
    } else if (r.a < 0) {
      compras += -r.a;
    } else {
      devol += r.a;
    }
  });
  const facturado = compras + cargosTr - devol;

  // Comparación con el estado de cuenta que ingresó el usuario
  const statementKey = `${name}|${period.end}`;
  const statement = S.data.config.statements[statementKey];
  const hasStatement = typeof statement === 'number' && statement !== 0;
  const difference = hasStatement ? statement - facturado : 0;

  let badge = '<span class="badge neutral">Ingresa el total de tu estado de cuenta para cuadrar</span>';
  if (period.open) {
    badge = '<span class="badge neutral">Período abierto: aún no llega el estado de cuenta</span>';
  } else if (hasStatement) {
    if (difference === 0) badge = '<span class="badge ok">✓ Cuadra con tu estado de cuenta</span>';
    else if (difference > 0) badge = `<span class="badge warn">⚠ Faltan ${money(difference)} por registrar en la planilla</span>`;
    else badge = `<span class="badge bad">⚠ La planilla suma ${money(-difference)} más que el estado de cuenta</span>`;
  }

  // Fecha de vencimiento: en el mismo mes del cierre si el día es posterior, si no al mes siguiente.
  let dueHTML = '';
  if (config.dueDay && !period.open) {
    const closeMonth = period.end.slice(0, 7);
    const dueMonth = config.dueDay > config.closeDay ? closeMonth : monthShift(closeMonth, 1);
    const [dueYear, dueMonthNum] = dueMonth.split('-').map(Number);
    const dueDay = Math.min(config.dueDay, daysInMonth(dueYear, dueMonthNum));
    dueHTML = `<div class="line2"><span class="muted">Vence</span><b>${dayMonth(`${dueMonth}-${pad(dueDay)}`)}</b></div>`;
  }

  // Cargos que el usuario ya marcó como vistos en su estado de cuenta
  const checked = S.checks[statementKey] || {};
  const signatures = periodRows.map((r, i) => `${r.d}|${r.n}|${r.a}|${i}`);
  const markedTotal = periodRows.reduce((sum, r, i) => {
    if (!checked[signatures[i]]) return sum;
    const isPaymentReceived = isTransfer(r.t) && r.a >= 0; // los pagos recibidos no suman a lo facturado
    return sum + (isPaymentReceived ? 0 : -r.a);
  }, 0);

  const statementInput = period.open
    ? ''
    : `<label class="f" style="margin-top:10px">Total del estado de cuenta<input class="inp" id="stmt" inputmode="numeric" placeholder="Ej: ${clp.format(Math.round(facturado / 1000) * 1000 || 100000)}" value="${hasStatement ? clp.format(statement) : ''}" data-key="${esc(statementKey)}"></label>`;

  html += `<div class="card">
    <div class="monthnav">
      <button data-act="pprev" aria-label="Período anterior">◀</button>
      <b style="text-align:center">${period.open ? 'Período abierto' : 'Cierre ' + dayMonth(period.end)}<div class="muted small" style="font-weight:400">${dayMonth(period.start)} – ${dayMonth(period.end)}</div></b>
      <button data-act="pnext" aria-label="Período siguiente" ${S.card.p <= 0 ? 'disabled' : ''}>▶</button>
    </div>
    <div class="line2"><span>Compras y cargos</span><b>${money(compras + cargosTr)}</b></div>
    ${devol ? `<div class="line2"><span>Devoluciones</span><b>${money(-devol)}</b></div>` : ''}
    <div class="line2" style="border-top:1px solid var(--line);margin-top:4px;padding-top:9px"><span><b>Facturado según planilla</b></span><b>${money(facturado)}</b></div>
    ${pagos ? `<div class="line2"><span class="muted">Pagos abonados en el período</span><b>${money(pagos)}</b></div>` : ''}${dueHTML}
    ${statementInput}
    <div style="margin-top:10px">${badge}</div>
  </div>`;

  let movementsHTML = '<div class="empty">Sin movimientos en este período.</div>';
  if (periodRows.length) {
    const summary = `<div class="muted small" style="margin-bottom:4px">Marca cada cargo que veas en tu estado de cuenta. Marcado: <b>${money(markedTotal)}</b> · Sin marcar: <b>${money(facturado - markedTotal)}</b></div>`;
    const items = periodRows
      .map((r, i) => `<button class="chk ${checked[signatures[i]] ? 'done' : ''}" data-act="tick" data-k="${esc(statementKey)}" data-s="${esc(signatures[i])}">
        <span class="box">✓</span>
        <span class="mid"><b>${esc(r.n || '—')}</b><small>${esc(dayMonth(r.d))}${r.ds ? ' · ' + esc(r.ds) : ''}</small></span>
        <span class="am ${r.a > 0 ? 'pos' : ''}">${money(r.a)}</span>
      </button>`)
      .join('');
    movementsHTML = summary + items;
  }
  html += `<div class="card"><h2>Movimientos del período (${periodRows.length})</h2>${movementsHTML}</div>`;

  view.innerHTML = html;
}
