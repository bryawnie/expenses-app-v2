'use strict';
/* Datos derivados: filas visibles (planilla + pendientes) y estadísticas.
 *
 * Forma de una fila de movimiento (la usa también el servidor, no renombrar):
 *   { r: nº de fila en la planilla, d: fecha 'YYYY-MM-DD', n: nombre/comercio,
 *     ds: descripción, a: monto (negativo = gasto), t: tipo/categoría, c: cuenta }
 */

/** ¿Dos filas son "la misma"? Se usa para ubicar una fila aunque haya cambiado de número en la planilla. */
function sameSignature(x, o) {
  return (
    x.d === o.d &&
    norm(x.n) === norm(o.n) &&
    norm(x.ds) === norm(o.ds) &&
    Math.abs(x.a - o.a) < 0.005 &&
    norm(x.t) === norm(o.t) &&
    norm(x.c) === norm(o.c)
  );
}

/** Convierte un ítem de la cola (nombres largos) a la forma corta de fila. */
function itemToRow(item, extra) {
  return Object.assign(
    { d: item.date, n: item.name, ds: item.desc, a: item.amount, t: item.type, c: item.account },
    extra
  );
}

/**
 * Todas las filas que ve el usuario: las de la planilla con las operaciones
 * pendientes ya aplicadas encima (altas, ediciones y borrados), más nuevas primero.
 */
function viewRows() {
  const rows = S.data.rows.map(r => ({ r: r[0], d: r[1], n: r[2], ds: r[3], a: r[4], t: r[5], c: r[6] }));

  S.queue.forEach(op => {
    if (op.action === 'add') {
      op.payload.items.forEach(item => {
        rows.push(itemToRow(item, { r: null, id: item.id, pending: true }));
      });
    } else if (op.action === 'update') {
      const i = rows.findIndex(x => !x.pending && sameSignature(x, op.payload.orig));
      if (i >= 0) rows[i] = itemToRow(op.payload.item, { r: rows[i].r, pending: true, upd: true });
    } else if (op.action === 'delete') {
      const i = rows.findIndex(x => !x.pending && sameSignature(x, op.payload.orig));
      if (i >= 0) rows.splice(i, 1);
    }
  });

  const rowOrder = row => (row.r == null ? 1e9 : row.r); // las pendientes (sin fila) van primero
  rows.sort((a, b) => {
    if (a.d !== b.d) return a.d < b.d ? 1 : -1;
    return rowOrder(b) - rowOrder(a);
  });
  return rows;
}

function transferType() {
  return S.data.types.find(isTransfer) || 'Traspasos Internos';
}

/** Adivina si una cuenta es efectivo, crédito o débito según su nombre. */
function guessKind(name) {
  const n = norm(name);
  if (/efectivo|cash/.test(n)) return 'efectivo';
  if (/\b(tc|tdc)\b|credito|visa|master|amex|cmr|lider|falabella|ripley|cencosud|paris/.test(n)) return 'credito';
  return 'debito';
}

/** Configuración de una cuenta: { kind, closeDay, dueDay }. */
const accountConfig = name => S.data.config.accounts[name] || { kind: guessKind(name), closeDay: 0, dueDay: 0 };

const creditCards = () => S.data.accounts.filter(a => accountConfig(a).kind === 'credito');

/**
 * Estadísticas de un mes (sin contar traspasos).
 * Los montos "netos" restan los reintegros a los gastos de la misma categoría/cuenta.
 */
function stats(monthKey, rows) {
  const monthRows = rows.filter(r => r.d.startsWith(monthKey) && !isTransfer(r.t));
  const [y, m] = monthKey.split('-').map(Number);
  const days = daysInMonth(y, m);

  const daily = Array(days + 1).fill(0); // gasto neto de cada día (índice 1..days)
  const byCat = {};                      // gasto neto por categoría
  const byAcct = {};                     // gasto neto por cuenta
  let gasto = 0;
  let ingreso = 0;

  monthRows.forEach(r => {
    if (r.a < 0) gasto += -r.a;
    else ingreso += r.a;
    byCat[r.t] = (byCat[r.t] || 0) - r.a;
    byAcct[r.c] = (byAcct[r.c] || 0) - r.a;
    daily[+r.d.slice(8)] -= r.a;
  });

  return { gasto, ingreso, byCat, byAcct, daily, days, n: monthRows.length };
}
