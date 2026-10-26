'use strict';
/* Utilidades: texto, dinero, fechas y almacenamiento local. */

const $ = (selector, parent = document) => parent.querySelector(selector);

/* ---- Texto ---- */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto para insertarlo de forma segura dentro de HTML. */
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);

/** Normaliza para comparar: minúsculas, sin tildes y sin espacios sobrantes. */
const norm = value =>
  String(value == null ? '' : value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

/** Separa un emoji inicial del resto del texto: "🍔 Comida" → { e: '🍔', txt: 'Comida' }. */
function splitEmoji(value) {
  const text = String(value || '');
  const match = text.match(/^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*(.*)$/u);
  return match ? { e: match[1], txt: match[2] } : { e: '', txt: text };
}

/** Número estable (0-359) a partir de un texto, para dar color a cada categoría. */
function hue(value) {
  let h = 0;
  for (const ch of String(value)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/* ---- Dinero (pesos chilenos) ---- */

const clp = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

/** $12.345 (con signo menos delante si es negativo). */
const money = n => (n < 0 ? '-' : '') + '$' + clp.format(Math.abs(Math.round(n)));

/** Versión compacta para ejes de gráficos: $1,5 M, $320 mil, $900. */
function short(n) {
  const abs = Math.abs(n);
  let text;
  if (abs >= 1e6) text = '$' + (abs / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' M';
  else if (abs >= 1e3) text = '$' + Math.round(abs / 1e3) + ' mil';
  else text = '$' + Math.round(abs);
  return (n < 0 ? '-' : '') + text;
}

/* ---- Fechas ----
 * Las fechas viajan como texto 'YYYY-MM-DD' y los meses como 'YYYY-MM'. */

const pad = n => String(n).padStart(2, '0');

const ymd = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const today = () => ymd(new Date());

const currentMonth = () => today().slice(0, 7);

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(str, n) {
  const date = parseDate(str);
  date.setDate(date.getDate() + n);
  return ymd(date);
}

/** Cantidad de días del mes `m` (1-12) del año `y`. */
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

/** Desplaza un mes 'YYYY-MM' en `n` meses (puede ser negativo). */
function monthShift(key, n) {
  const [y, m] = key.split('-').map(Number);
  const date = new Date(y, m - 1 + n, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** Formatea una fecha con Intl en español; `stripDots` quita el punto de las abreviaturas ("oct."). */
function formatDate(str, options, stripDots) {
  const text = new Intl.DateTimeFormat('es-CL', options).format(parseDate(str));
  return stripDots ? text.replace(/\./g, '') : text;
}

const monthName = key => capitalize(formatDate(key + '-01', { month: 'long' }));
const monthShort = key => capitalize(formatDate(key + '-01', { month: 'short' }, true));
const monthLabel = key => monthName(key) + ' ' + key.slice(0, 4);
const dayLabel = str => capitalize(formatDate(str, { weekday: 'short', day: 'numeric', month: 'short' }, true));
const dayMonth = str => formatDate(str, { day: 'numeric', month: 'short' }, true);

/* ---- Dominio ---- */

/** ¿Es un traspaso entre cuentas propias? (no cuenta como gasto ni ingreso) */
const isTransfer = type => norm(type).includes('traspaso');

/* ---- Almacenamiento local (prefijo "gt.") ---- */

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('gt.' + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('gt.' + key, JSON.stringify(value));
    } catch (e) {
      /* cuota llena */
    }
  }
};

const emptyConfig = () => ({ accounts: {}, budgets: {}, statements: {}, settings: {} });
