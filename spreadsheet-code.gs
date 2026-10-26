/**
 * Registro de gastos — backend en Google Apps Script
 *
 * Se pega dentro de TU planilla (Extensiones > Apps Script) y se publica como
 * "Aplicación web". La app (PWA) habla con este script; la planilla sigue siendo
 * la única fuente de verdad.
 *
 * Detecta solo la hoja de gastos buscando los encabezados
 * Date / Name / Description / Amount / Type / Account (o Fecha / Nombre /
 * Descripción / Monto / Tipo / Cuenta). Si tienes varias hojas parecidas, fija
 * el nombre en SHEET_NAME.
 */

// Clave secreta compartida con la app. Cámbiala si quieres (y cámbiala también en la app).
const TOKEN = 'CHANGE_ME';

// Vacío = detectar automáticamente la hoja de gastos.
const SHEET_NAME = '';

const CONFIG_SHEET = '_Config';
const IDS_SHEET = '_IDs';
const MAX_IDS = 3000;

const HEADER_ALIASES = {
  date: ['date', 'fecha'],
  name: ['name', 'nombre', 'comercio', 'glosa'],
  desc: ['description', 'descripcion', 'detalle'],
  amount: ['amount', 'monto', 'importe', 'valor'],
  type: ['type', 'tipo', 'categoria', 'category'],
  account: ['account', 'cuenta', 'banco', 'medio de pago']
};

class HttpError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Entradas web                                                       */
/* ------------------------------------------------------------------ */

function doGet() {
  return ContentService.createTextOutput('Registro de gastos: backend activo.');
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!req.token || req.token !== TOKEN) throw new HttpError('auth', 'Token inválido');
    out = handle(req);
  } catch (err) {
    out = {
      ok: false,
      error: err instanceof HttpError ? err.code : 'internal',
      message: String(err && err.message ? err.message : err)
    };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function handle(req) {
  switch (req.action) {
    case 'ping':
    case 'bootstrap':
      return snapshot(getContext(), req.since);
    case 'add':
      return locked(() => {
        const ctx = getContext();
        const results = addItems(ctx, req.items || []);
        const snap = snapshot(ctx, req.since);
        snap.results = results;
        return snap;
      });
    case 'update':
      return locked(() => {
        const ctx = getContext();
        updateItem(ctx, req);
        return snapshot(ctx, req.since);
      });
    case 'delete':
      return locked(() => {
        const ctx = getContext();
        deleteItem(ctx, req);
        return snapshot(ctx, req.since);
      });
    case 'saveConfig':
      return locked(() => {
        const ctx = getContext();
        writeConfig(ctx.ss, req.config);
        return snapshot(ctx, req.since);
      });
    default:
      throw new HttpError('bad_request', 'Acción desconocida: ' + req.action);
  }
}

function locked(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Detección de la hoja                                               */
/* ------------------------------------------------------------------ */

function norm(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function detectHeader(sh) {
  const lastCol = sh.getLastColumn();
  const lastRow = sh.getLastRow();
  if (!lastCol || !lastRow) return null;
  const nrows = Math.min(10, lastRow);
  const vals = sh.getRange(1, 1, nrows, lastCol).getValues();
  for (let i = 0; i < nrows; i++) {
    const col = {};
    for (let j = 0; j < lastCol; j++) {
      const h = norm(vals[i][j]);
      if (!h) continue;
      for (const key in HEADER_ALIASES) {
        if (!col[key] && HEADER_ALIASES[key].indexOf(h) !== -1) col[key] = j + 1;
      }
    }
    if (col.date && col.amount) return { headerRow: i + 1, col: col, lastCol: lastCol };
  }
  return null;
}

function getContext() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  let best = null;
  const sheets = SHEET_NAME ? [ss.getSheetByName(SHEET_NAME)] : ss.getSheets();
  for (const sh of sheets) {
    if (!sh) continue;
    const n = sh.getName();
    if (n === CONFIG_SHEET || n === IDS_SHEET) continue;
    const found = detectHeader(sh);
    if (found && (!best || sh.getLastRow() > best.sheet.getLastRow())) {
      best = { ss: ss, tz: tz, sheet: sh, headerRow: found.headerRow, col: found.col, lastCol: found.lastCol };
    }
  }
  if (!best) {
    throw new HttpError(
      'no_sheet',
      'No encontré una hoja con encabezados Date/Name/Description/Amount/Type/Account (o Fecha/Nombre/Descripción/Monto/Tipo/Cuenta).'
    );
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Lectura                                                            */
/* ------------------------------------------------------------------ */

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function toDateStr(v, tz) {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000;
    const d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  if (typeof v === 'string') {
    let m = v.trim().match(/^(\d{2})-(\d{2})-(\d{2})$/);
    if (m) return '20' + m[1] + '-' + m[2] + '-' + m[3];
    m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
  }
  return '';
}

function serialFromStr(s) {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new HttpError('bad_request', 'Fecha inválida: ' + s);
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000);
}

function toNum(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v == null ? '' : v).replace(/[$\s]/g, '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function str(v) {
  return v == null ? '' : String(v);
}

function cell(v, c) {
  return c ? v[c - 1] : '';
}

// Devuelve TODAS las filas de datos: [fila, 'yyyy-MM-dd', nombre, descripción, monto, tipo, cuenta]
function readRows(ctx) {
  const sh = ctx.sheet;
  const last = sh.getLastRow();
  if (last <= ctx.headerRow) return [];
  const vals = sh.getRange(ctx.headerRow + 1, 1, last - ctx.headerRow, ctx.lastCol).getValues();
  const c = ctx.col;
  const rows = [];
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    const d = toDateStr(cell(v, c.date), ctx.tz);
    if (!d) continue;
    rows.push([
      ctx.headerRow + 1 + i,
      d,
      str(cell(v, c.name)),
      str(cell(v, c.desc)),
      toNum(cell(v, c.amount)),
      str(cell(v, c.type)),
      str(cell(v, c.account))
    ]);
  }
  return rows;
}

function validationList(rule) {
  try {
    if (!rule) return null;
    const t = rule.getCriteriaType();
    const vals = rule.getCriteriaValues();
    if (t === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) return vals[0].map(String);
    if (t === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE) {
      return vals[0]
        .getValues()
        .reduce((a, r) => a.concat(r), [])
        .filter(x => x !== '')
        .map(String);
    }
  } catch (e) {
    /* sin lista */
  }
  return null;
}

function readLists(ctx, rows) {
  const out = {};
  const last = ctx.sheet.getLastRow();
  [['type', 5], ['account', 6]].forEach(pair => {
    const key = pair[0];
    const idx = pair[1];
    const c = ctx.col[key];
    let list = [];
    if (c && last > ctx.headerRow) {
      let rules = [];
      try {
        rules = ctx.sheet.getRange(ctx.headerRow + 1, c, last - ctx.headerRow, 1).getDataValidations();
      } catch (e) {
        rules = [];
      }
      for (let i = rules.length - 1; i >= 0; i--) {
        const l = validationList(rules[i] && rules[i][0]);
        if (l && l.length) {
          list = l;
          break;
        }
      }
    }
    const seen = {};
    const res = [];
    list.concat(rows.map(r => r[idx])).forEach(x => {
      if (x && !seen[x]) {
        seen[x] = true;
        res.push(x);
      }
    });
    out[key] = res;
  });
  return out;
}

function snapshot(ctx, since) {
  const all = readRows(ctx);
  const rows = since ? all.filter(r => r[1] >= since) : all;
  const lists = readLists(ctx, all);
  return {
    ok: true,
    sheet: ctx.sheet.getName(),
    tz: ctx.tz,
    today: Utilities.formatDate(new Date(), ctx.tz, 'yyyy-MM-dd'),
    total: all.length,
    rows: rows,
    types: lists.type,
    accounts: lists.account,
    config: readConfig(ctx.ss)
  };
}

/* ------------------------------------------------------------------ */
/* Escritura de movimientos                                           */
/* ------------------------------------------------------------------ */

function isTransfer(type) {
  return norm(type).indexOf('traspaso') !== -1;
}

function kindKey(type, amount) {
  return (isTransfer(type) ? 'T' : 'N') + (amount < 0 ? '-' : '+');
}

function safeText(s) {
  s = str(s).trim();
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function cleanItem(it) {
  if (!it || !/^\d{4}-\d{2}-\d{2}$/.test(str(it.date))) throw new HttpError('bad_request', 'Fecha inválida');
  const amount = Number(it.amount);
  if (!isFinite(amount) || amount === 0) throw new HttpError('bad_request', 'Monto inválido');
  return {
    id: str(it.id),
    date: it.date,
    name: str(it.name).trim(),
    desc: str(it.desc).trim(),
    amount: amount,
    type: str(it.type).trim(),
    account: str(it.account).trim()
  };
}

function direction(rows) {
  if (rows.length < 2) return 'asc';
  return rows[0][1] > rows[rows.length - 1][1] ? 'desc' : 'asc';
}

function rowIsEmpty(sh, r, lastCol) {
  return sh
    .getRange(r, 1, 1, lastCol)
    .getValues()[0]
    .every(v => v === '' || v == null);
}

// Escribe valores en columnas sueltas agrupando las contiguas.
function writeCells(sh, row, pairs) {
  pairs.sort((a, b) => a[0] - b[0]);
  let i = 0;
  while (i < pairs.length) {
    let j = i;
    while (j + 1 < pairs.length && pairs[j + 1][0] === pairs[j][0] + 1) j++;
    const values = [pairs.slice(i, j + 1).map(p => p[1])];
    sh.getRange(row, pairs[i][0], 1, j - i + 1).setValues(values);
    i = j + 1;
  }
}

function itemPairs(ctx, it) {
  const c = ctx.col;
  const pairs = [[c.date, serialFromStr(it.date)], [c.amount, it.amount]];
  if (c.name) pairs.push([c.name, safeText(it.name)]);
  if (c.desc) pairs.push([c.desc, safeText(it.desc)]);
  if (c.type) pairs.push([c.type, it.type]);
  if (c.account) pairs.push([c.account, it.account]);
  return pairs;
}

function insertItem(ctx, it) {
  const sh = ctx.sheet;
  const rows = readRows(ctx);
  const dir = direction(rows);
  const lastDataRow = rows.length ? rows[rows.length - 1][0] : ctx.headerRow;

  let after = ctx.headerRow;
  if (rows.length) {
    if (dir === 'asc') {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i][1] <= it.date) {
          after = rows[i][0];
          break;
        }
      }
    } else {
      after = lastDataRow;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i][1] <= it.date) {
          after = rows[i][0] - 1;
          break;
        }
      }
    }
  }

  // Fila de referencia para copiar formato y validación (mismo tipo de movimiento y signo).
  const key = kindKey(it.type, it.amount);
  let ref = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][0] <= after && kindKey(rows[i][5], rows[i][4]) === key) {
      ref = rows[i][0];
      break;
    }
  }
  if (!ref) {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] > after && kindKey(rows[i][5], rows[i][4]) === key) {
        ref = rows[i][0];
        break;
      }
    }
  }
  if (!ref) ref = after > ctx.headerRow ? after : rows.length ? rows[0][0] : 0;

  const target = after + 1;
  const reuse = after >= lastDataRow && target <= sh.getMaxRows() && rowIsEmpty(sh, target, ctx.lastCol);
  if (!reuse) {
    sh.insertRowAfter(after);
    if (ref > after) ref += 1;
  }

  if (ref) {
    const src = sh.getRange(ref, 1, 1, ctx.lastCol);
    const dst = sh.getRange(target, 1, 1, ctx.lastCol);
    src.copyTo(dst, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    src.copyTo(dst, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
  } else {
    sh.getRange(target, ctx.col.date).setNumberFormat('yy-mm-dd');
  }
  writeCells(sh, target, itemPairs(ctx, it));
  return target;
}

function seenIds(ss) {
  const sh = ss.getSheetByName(IDS_SHEET);
  const set = {};
  if (sh && sh.getLastRow() > 0) {
    sh.getRange(1, 1, sh.getLastRow(), 1)
      .getValues()
      .forEach(r => {
        if (r[0]) set[String(r[0])] = true;
      });
  }
  return set;
}

function rememberIds(ss, ids) {
  if (!ids.length) return;
  let sh = ss.getSheetByName(IDS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(IDS_SHEET);
    sh.hideSheet();
  }
  const start = sh.getLastRow() + 1;
  sh.getRange(start, 1, ids.length, 1).setValues(ids.map(i => [i]));
  const total = sh.getLastRow();
  if (total > MAX_IDS * 1.2) sh.deleteRows(1, total - MAX_IDS);
}

function addItems(ctx, items) {
  if (!items.length) throw new HttpError('bad_request', 'Sin movimientos');
  const cleaned = items.map(cleanItem);
  const seen = seenIds(ctx.ss);
  const results = [];
  const fresh = [];
  cleaned.forEach(it => {
    if (it.id && seen[it.id]) {
      results.push({ id: it.id, status: 'dup' });
      return;
    }
    insertItem(ctx, it);
    if (it.id) fresh.push(it.id);
    results.push({ id: it.id, status: 'added' });
  });
  rememberIds(ctx.ss, fresh);
  return results;
}

function sameRow(a, b) {
  return (
    a[1] === str(b.d) &&
    norm(a[2]) === norm(b.n) &&
    norm(a[3]) === norm(b.ds) &&
    Math.abs(a[4] - Number(b.a)) < 0.005 &&
    norm(a[5]) === norm(b.t) &&
    norm(a[6]) === norm(b.c)
  );
}

function locateRow(ctx, hint, orig) {
  if (!orig) throw new HttpError('bad_request', 'Falta la fila original');
  const rows = readRows(ctx);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === Number(hint) && sameRow(rows[i], orig)) return rows[i];
  }
  for (let i = 0; i < rows.length; i++) {
    if (sameRow(rows[i], orig)) return rows[i];
  }
  throw new HttpError('conflict', 'El movimiento cambió en la planilla. Actualiza e inténtalo de nuevo.');
}

function updateItem(ctx, req) {
  const found = locateRow(ctx, req.row, req.orig);
  const it = cleanItem(req.item);
  const sameKind = kindKey(found[5], found[4]) === kindKey(it.type, it.amount);
  if (found[1] === it.date && sameKind) {
    writeCells(ctx.sheet, found[0], itemPairs(ctx, it));
  } else {
    ctx.sheet.deleteRow(found[0]);
    insertItem(ctx, it);
  }
}

function deleteItem(ctx, req) {
  const found = locateRow(ctx, req.row, req.orig);
  ctx.sheet.deleteRow(found[0]);
}

/* ------------------------------------------------------------------ */
/* Configuración (hoja _Config)                                       */
/* ------------------------------------------------------------------ */

function readConfig(ss) {
  const cfg = { accounts: {}, budgets: {}, statements: {}, settings: {} };
  const sh = ss.getSheetByName(CONFIG_SHEET);
  if (!sh || sh.getLastRow() < 2) return cfg;
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  vals.forEach(v => {
    const kind = str(v[0]);
    const key = str(v[1]);
    if (!kind || !key) return;
    if (kind === 'account') {
      cfg.accounts[key] = { kind: str(v[2]) || 'debito', closeDay: Number(v[3]) || 0, dueDay: Number(v[4]) || 0 };
    } else if (kind === 'budget') {
      cfg.budgets[key] = Number(v[2]) || 0;
    } else if (kind === 'statement') {
      cfg.statements[key] = Number(v[2]) || 0;
    } else if (kind === 'setting') {
      cfg.settings[key] = str(v[2]);
    }
  });
  return cfg;
}

function writeConfig(ss, cfg) {
  if (!cfg || typeof cfg !== 'object') throw new HttpError('bad_request', 'Configuración inválida');
  let sh = ss.getSheetByName(CONFIG_SHEET);
  if (!sh) sh = ss.insertSheet(CONFIG_SHEET);
  const rows = [];
  const kinds = ['credito', 'debito', 'efectivo'];
  Object.keys(cfg.accounts || {}).forEach(k => {
    const a = cfg.accounts[k] || {};
    rows.push([
      'account',
      k,
      kinds.indexOf(a.kind) !== -1 ? a.kind : 'debito',
      Math.max(0, Math.min(31, Math.round(Number(a.closeDay) || 0))),
      Math.max(0, Math.min(31, Math.round(Number(a.dueDay) || 0)))
    ]);
  });
  Object.keys(cfg.budgets || {}).forEach(k => {
    const v = Number(cfg.budgets[k]) || 0;
    if (v > 0) rows.push(['budget', k, v, '', '']);
  });
  Object.keys(cfg.statements || {}).forEach(k => {
    const v = Number(cfg.statements[k]);
    if (isFinite(v) && v !== 0) rows.push(['statement', k, v, '', '']);
  });
  Object.keys(cfg.settings || {}).forEach(k => rows.push(['setting', k, str(cfg.settings[k]), '', '']));
  sh.clear();
  const all = [['Tipo', 'Clave', 'Valor', 'Día de cierre', 'Día de vencimiento']].concat(rows);
  sh.getRange(1, 1, all.length, 5).setValues(all);
}
