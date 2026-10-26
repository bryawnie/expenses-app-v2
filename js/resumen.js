'use strict';
/* Pantalla Resumen: gráficos y totales del mes. */

/** Redondea hacia arriba a un valor "bonito" (1, 2, 2.5, 5, 10 × potencia de 10) para el eje de un gráfico. */
function niceMax(v) {
  if (v <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / power;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * power;
}

/** Acumula el gasto diario hasta el día `upTo`; los días posteriores quedan en null (no se dibujan). */
function cumulative(daily, upTo) {
  const out = [0];
  let sum = 0;
  for (let d = 1; d < daily.length; d++) {
    sum += daily[d];
    out.push(d <= upTo ? sum : null);
  }
  return out;
}

/* Dimensiones del gráfico de líneas (en unidades del viewBox del SVG). */
const LINE_CHART = { W: 340, H: 190, L: 50, R: 44, T: 12, B: 24 };

/** Gráfico de línea: gasto neto acumulado del mes vs. promedio de los meses anteriores. */
function lineChartHTML(current, previous, monthKey, cutoff) {
  const { W, H, L, R, T, B } = LINE_CHART;
  const days = Math.max(current.length, previous.length) - 1;

  // Escala vertical: el cero puede estar en medio si hay saldos negativos (más reintegros que gastos).
  const values = current.concat(previous).filter(x => x != null);
  const maxPositive = Math.max(0, ...values);
  const maxNegative = Math.max(0, ...values.map(v => -v));
  const top = maxPositive > 0 ? niceMax(maxPositive * 1.04) : 0;
  const bottom = maxNegative > 0 ? niceMax(maxNegative * 1.04) : 0;
  const span = top + bottom || 1;

  const x = day => L + ((day - 1) / (days - 1)) * (W - L - R);
  const y = value => T + ((top - value) / span) * (H - T - B);
  const linePath = series =>
    series
      .map((v, d) => {
        if (v == null || d === 0) return '';
        const startsSegment = d === 1 || series[d - 1] == null;
        return (startsSegment ? 'M' : 'L') + x(d).toFixed(1) + ' ' + y(v).toFixed(1);
      })
      .join('');

  const yTicks = [...new Set([top, top / 2, 0, -bottom / 2, -bottom])];
  const xTicks = [1, 8, 15, 22, days >= 29 ? 29 : days];
  const hasCurrent = cutoff >= 1;
  const cutoffDay = Math.min(cutoff, days);
  const lastCurrent = hasCurrent ? current[Math.min(cutoff, current.length - 1)] : 0;
  const lastPrevious = previous[previous.length - 1];

  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto neto acumulado de ${monthName(monthKey)} comparado con el promedio de los 6 meses anteriores">`;

  yTicks.forEach(t => {
    const zeroStyle = t === 0 ? ' style="stroke:var(--ink3)"' : '';
    svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"${zeroStyle}/>`;
    svg += `<text x="${L - 6}" y="${y(t) + 3.5}" text-anchor="end">${short(t)}</text>`;
  });
  xTicks.forEach(d => {
    svg += `<text x="${x(d)}" y="${H - 6}" text-anchor="middle">${d}</text>`;
  });

  svg += `<path d="${linePath(previous)}" fill="none" stroke="var(--prev)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  svg += `<path d="${linePath(current)}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;

  if (hasCurrent) {
    svg += `<circle cx="${x(cutoffDay)}" cy="${y(lastCurrent)}" r="4" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/>`;
  }
  if (lastPrevious != null) {
    svg += `<text x="${x(previous.length - 1) + 5}" y="${y(lastPrevious) + 3.5}">Prom.</text>`;
  }
  if (hasCurrent) {
    svg += `<text x="${x(cutoffDay) + 7}" y="${y(lastCurrent) + 3.5}" style="fill:var(--accent);font-weight:700">${monthShort(monthKey)}</text>`;
  }

  // Línea vertical y zona sensible para el tooltip (ver attachLineHover).
  svg += `<line id="cross" y1="${T}" y2="${H - B}" stroke="var(--ink3)" stroke-width="1" visibility="hidden"/>`;
  svg += `<rect id="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>`;
  return svg + '</svg>';
}

/** Muestra un tooltip con los valores del día bajo el puntero. */
function attachLineHover(wrap, current, previous, monthKey, days) {
  const { W, L, R } = LINE_CHART;
  const svg = $('svg', wrap);
  const hit = $('#hit', wrap);
  const cross = $('#cross', wrap);
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  wrap.appendChild(tip);

  const show = e => {
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const day = Math.max(1, Math.min(days, Math.round(1 + ((px - L) / (W - L - R)) * (days - 1))));
    const gx = L + ((day - 1) / (days - 1)) * (W - L - R);

    cross.setAttribute('x1', gx);
    cross.setAttribute('x2', gx);
    cross.setAttribute('visibility', 'visible');

    tip.hidden = false;
    tip.style.left = Math.max(60, Math.min(rect.width - 60, (gx / W) * rect.width)) + 'px';
    tip.style.top = '28px';
    tip.innerHTML =
      `<b>Día ${day}</b>${monthShort(monthKey)}: ${current[day] != null ? money(current[day]) : '—'}` +
      `<br>Promedio 6 meses: ${previous[day] != null ? money(previous[day]) : '—'}`;
  };

  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', () => {
    tip.hidden = true;
    cross.setAttribute('visibility', 'hidden');
  });
}

/** Gráfico de barras: gasto neto de cada mes (verde hacia abajo si el mes cerró a favor). */
function barsHTML(items, selectedKey) {
  const W = 340, H = 160, T = 20, B = 22;
  const barWidth = 34;
  const count = items.length;
  const gap = (W - count * barWidth) / (count + 1);

  const maxPositive = Math.max(0, ...items.map(i => i.v));
  const maxNegative = Math.max(0, ...items.map(i => -i.v));
  const top = maxPositive > 0 ? niceMax(maxPositive) : 0;
  const bottom = maxNegative > 0 ? niceMax(maxNegative) : 0;
  const span = top + bottom || 1;
  const plotHeight = H - T - B - (bottom > 0 ? 14 : 0);
  const zeroY = T + plotHeight * (top / span);
  const scale = plotHeight / span;

  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto neto de los últimos ${count} meses">`;
  svg += `<line class="axis" x1="0" x2="${W}" y1="${zeroY}" y2="${zeroY}" stroke-width="1"/>`;

  items.forEach((item, i) => {
    const x = gap + i * (barWidth + gap);
    const height = Math.abs(item.v) * scale;
    const selected = item.key === selectedKey;
    const radius = Math.min(4, height);
    const emphasis = selected ? 'fill:var(--ink);font-weight:700' : '';
    const tooltip = `<title>${monthLabel(item.key)}: ${money(item.v)}</title>`;

    // El rect transparente agranda el área de toque de cada barra.
    svg += `<g data-act="pickmonth" data-key="${item.key}" style="cursor:pointer"><rect x="${x - 6}" y="0" width="${barWidth + 12}" height="${H}" fill="transparent"/>`;

    if (item.v > 0) {
      const color = selected ? 'var(--accent)' : 'var(--accent-mid)';
      svg += `<path d="M${x} ${zeroY} V${zeroY - height + radius} a${radius} ${radius} 0 0 1 ${radius} -${radius} h${barWidth - 2 * radius} a${radius} ${radius} 0 0 1 ${radius} ${radius} V${zeroY} Z" fill="${color}">${tooltip}</path>`;
      svg += `<text x="${x + barWidth / 2}" y="${zeroY - height - 5}" text-anchor="middle" style="${emphasis}">${short(item.v)}</text>`;
    } else if (item.v < 0) {
      svg += `<path d="M${x} ${zeroY} V${zeroY + height - radius} a${radius} ${radius} 0 0 0 ${radius} ${radius} h${barWidth - 2 * radius} a${radius} ${radius} 0 0 0 ${radius} -${radius} V${zeroY} Z" fill="var(--good)" fill-opacity="${selected ? 1 : 0.55}">${tooltip}</path>`;
      svg += `<text x="${x + barWidth / 2}" y="${zeroY + height + 12}" text-anchor="middle" style="${emphasis}">${short(item.v)}</text>`;
    }

    svg += `<text x="${x + barWidth / 2}" y="${H - 7}" text-anchor="middle" style="${emphasis}">${monthShort(item.key)}</text></g>`;
  });
  return svg + '</svg>';
}

/** Tarjeta superior: gasto neto del mes, KPIs y diferencia contra el promedio. */
function summaryHeroHTML({ net, st, budgetTotal, budgetUsed, deltaHTML }) {
  const budgetKpi = budgetTotal
    ? `<div><small>Presupuesto usado</small><b>${Math.round((budgetUsed / budgetTotal) * 100)}%</b></div>`
    : '';
  return `<div class="card">
    <div class="muted small">Gasto neto de ${monthName(S.month).toLowerCase()}</div>
    <div class="hero">${money(net)}</div>
    <div class="muted small">Gastos menos reintegros del mes</div>
    <div class="kpis">
      <div><small>Gastos</small><b>${money(st.gasto)}</b></div>
      <div><small>Reintegros</small><b>${money(st.ingreso)}</b></div>
      ${budgetKpi}
    </div>
    ${deltaHTML ? `<div style="margin-top:8px">${deltaHTML}</div>` : ''}
  </div>`;
}

/** Fila de una categoría con su barra de progreso (contra el presupuesto, o contra la categoría mayor). */
function categoryRowHTML(category, value, budget, largest, totalNet) {
  const isOver = budget && value > budget;
  const percent = budget ? Math.min(100, (value / budget) * 100) : (value / largest) * 100;
  const share = totalNet ? Math.round((value / totalNet) * 100) : 0;

  let budgetNote = '<span></span>';
  if (budget && isOver) budgetNote = `<span class="bad">⚠ Excedido en ${money(value - budget)} (ppto. ${short(budget)})</span>`;
  else if (budget) budgetNote = `<span>Quedan ${money(budget - value)} de ${short(budget)}</span>`;

  return `<button class="cat" data-act="gocat" data-c="${esc(category)}">
    <div class="top"><span>${esc(category)}</span><span>${money(value)}</span></div>
    <div class="bar ${isOver ? 'over' : ''}"><i style="width:${percent.toFixed(1)}%"></i></div>
    <div class="sub"><span>${share}% del gasto neto</span>${budgetNote}</div>
  </button>`;
}

function renderResumen(view) {
  const rows = viewRows();
  const st = stats(S.month, rows);
  const isCurrentMonth = S.month === currentMonth();
  const cutoff = isCurrentMonth ? +today().slice(8) : st.days; // último día con datos que se dibuja

  // Referencia: promedio del acumulado de los hasta 6 meses anteriores (solo los que tienen movimientos).
  const refMonths = [];
  for (let i = 1; i <= 6; i++) {
    const refStats = stats(monthShift(S.month, -i), rows);
    if (refStats.n > 0) refMonths.push(refStats);
  }
  const refCumulatives = refMonths.map(rs => cumulative(rs.daily, rs.days));
  const nRef = refMonths.length;
  const refLabel =
    nRef >= 6 ? 'los 6 meses anteriores'
    : nRef === 1 ? 'el mes anterior con datos'
    : `los ${nRef} meses anteriores con datos`;

  const averageSeries = [0];
  for (let d = 1; d <= st.days; d++) {
    const dayAverage = nRef
      ? refCumulatives.reduce((sum, c) => sum + c[Math.min(d, c.length - 1)], 0) / nRef
      : null;
    averageSeries.push(dayAverage);
  }
  const currentSeries = cumulative(st.daily, cutoff);

  const net = st.gasto - st.ingreso;
  const budgets = S.data.config.budgets;
  const budgetTotal = Object.keys(budgets).reduce((sum, k) => sum + (budgets[k] || 0), 0);
  const budgetUsed = Object.keys(budgets).reduce((sum, k) => sum + Math.max(st.byCat[k] || 0, 0), 0);

  let deltaHTML = '';
  if (nRef && st.n) {
    const diff = currentSeries[cutoff] - averageSeries[cutoff];
    if (Math.round(diff) !== 0) {
      deltaHTML = `<div class="delta ${diff > 0 ? 'bad' : 'good'}">${diff > 0 ? '▲' : '▼'} Gasto neto ${money(Math.abs(diff))} ${diff > 0 ? 'sobre' : 'bajo'} el promedio de ${refLabel}${isCurrentMonth ? ' a esta fecha' : ''}</div>`;
    }
  }

  // Gasto neto de los últimos 6 meses terminando en el mes elegido.
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const key = monthShift(S.month, -i);
    const ms = stats(key, rows);
    months.push({ key, v: ms.gasto - ms.ingreso });
  }

  const spendCategories = Object.keys(st.byCat).filter(c => st.byCat[c] > 0).sort((a, b) => st.byCat[b] - st.byCat[a]);
  const incomeCategories = Object.keys(st.byCat).filter(c => st.byCat[c] < 0).sort((a, b) => st.byCat[a] - st.byCat[b]);
  const totalNet = spendCategories.reduce((sum, c) => sum + st.byCat[c], 0);

  let html = monthNavHTML();

  if (!st.n && !nRef) {
    const message = S.data.loaded ? 'No hay movimientos en este mes.' : 'Conecta tu planilla en Ajustes para ver el resumen.';
    html += `<div class="card empty">${message}</div>`;
  } else {
    html += summaryHeroHTML({ net, st, budgetTotal, budgetUsed, deltaHTML });

    // Gráfico de línea + tabla alternativa
    const averageLegend = nRef
      ? `<span><i style="background:var(--prev)"></i>Promedio ${nRef >= 6 ? 'de 6 meses' : `de ${nRef} ${nRef === 1 ? 'mes' : 'meses'}`}</span>`
      : '';
    const sampleDays = [1, 5, 10, 15, 20, 25, 30].filter(d => d <= st.days);
    const lineTableRows = sampleDays
      .map(d => `<tr><td>${d}</td><td>${currentSeries[d] != null ? money(currentSeries[d]) : '—'}</td><td>${averageSeries[d] != null ? money(averageSeries[d]) : '—'}</td></tr>`)
      .join('');
    html += `<div class="card"><h2>Gasto neto acumulado</h2>
      <div class="chartwrap" id="lineWrap">${lineChartHTML(currentSeries, averageSeries, S.month, cutoff)}</div>
      <div class="legend"><span><i style="background:var(--accent)"></i>${monthName(S.month)}</span>${averageLegend}</div>
      <details class="tbl"><summary>Ver tabla</summary>
        <table class="t"><tr><th>Día</th><th>${monthShort(S.month)}</th><th>Promedio</th></tr>${lineTableRows}</table>
      </details></div>`;

    // Barras de los últimos 6 meses + tabla alternativa
    const barTableRows = months.map(m => `<tr><td>${monthLabel(m.key)}</td><td>${money(m.v)}</td></tr>`).join('');
    html += `<div class="card"><h2>Gasto neto de los últimos 6 meses</h2>${barsHTML(months, S.month)}
      <details class="tbl"><summary>Ver tabla</summary><table class="t">${barTableRows}</table></details></div>`;

    // Por categoría
    const categoryRows = spendCategories.length
      ? spendCategories
          .map(c => categoryRowHTML(c, st.byCat[c], budgets[c] || 0, st.byCat[spendCategories[0]], totalNet))
          .join('')
      : '<div class="empty">Sin gastos.</div>';
    const budgetHint = budgetTotal
      ? ''
      : '<div class="muted small" style="margin-top:8px">Define presupuestos por categoría en Ajustes para ver cuánto te queda.</div>';
    html += `<div class="card"><h2>Gasto neto por categoría</h2>
      <div class="muted small" style="margin:-4px 0 6px">Descuenta los reintegros que registres en la misma categoría.</div>
      ${categoryRows}${budgetHint}</div>`;

    // Ingresos y reintegros
    if (incomeCategories.length) {
      const incomeRows = incomeCategories
        .map(c => `<button class="cat" data-act="gocat" data-c="${esc(c)}"><div class="top"><span>${esc(c)}</span><span style="color:var(--good)">+${money(-st.byCat[c])}</span></div></button>`)
        .join('');
      html += `<div class="card"><h2>Ingresos y reintegros</h2>${incomeRows}</div>`;
    }

    // Por cuenta
    const accounts = Object.keys(st.byAcct).sort((a, b) => Math.abs(st.byAcct[b]) - Math.abs(st.byAcct[a]));
    const accountRows = accounts.length
      ? accounts.map(a => `<div class="line2"><span>${esc(a)}</span><b>${money(st.byAcct[a])}</b></div>`).join('')
      : '<div class="empty">Sin movimientos.</div>';
    html += `<div class="card"><h2>Gasto neto por cuenta</h2>${accountRows}</div>`;
  }

  view.innerHTML = html;

  const lineWrap = $('#lineWrap');
  if (lineWrap) {
    attachLineHover(lineWrap, currentSeries, averageSeries, S.month, Math.max(currentSeries.length, averageSeries.length) - 1);
  }
}
