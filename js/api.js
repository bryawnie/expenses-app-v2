'use strict';
/* API del Apps Script y sincronización de la cola offline. */

class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const API_TIMEOUT_MS = 60000;

/** Llama al Apps Script. Devuelve el JSON de respuesta o lanza ApiError. */
async function api(action, payload = {}) {
  if (!S.settings.url || !S.settings.token) {
    throw new ApiError('config', 'Falta configurar la conexión en Ajustes.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(S.settings.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita el preflight CORS
      body: JSON.stringify(Object.assign({ token: S.settings.token, action }, payload)),
      signal: controller.signal,
      redirect: 'follow'
    });
  } catch (e) {
    throw new ApiError('network', 'Sin conexión');
  } finally {
    clearTimeout(timer);
  }

  let json;
  try {
    json = await response.json();
  } catch (e) {
    throw new ApiError(
      'bad_response',
      'Respuesta inválida. Revisa que la URL termine en /exec y que el acceso sea "Cualquier persona".'
    );
  }
  if (!json.ok) throw new ApiError(json.error || 'internal', json.message || 'Error del servidor');
  return json;
}

/** Reemplaza los datos locales con lo que devolvió el servidor. */
function applySnapshot(json) {
  // Si hay una config sin enviar, la local manda sobre la del servidor.
  const keepLocalConfig = S.queue.some(op => op.action === 'saveConfig');
  S.data = {
    rows: json.rows,
    types: json.types,
    accounts: json.accounts,
    loaded: true,
    config: keepLocalConfig ? S.data.config : Object.assign(emptyConfig(), json.config)
  };
  store.set('data', S.data);
}

function saveQueue() {
  store.set('queue', S.queue);
}

/** Agrega una operación a la cola e intenta sincronizar de inmediato. */
function enqueue(op) {
  // Solo importa la última configuración: descarta las anteriores sin enviar.
  if (op.action === 'saveConfig') S.queue = S.queue.filter(o => o.action !== 'saveConfig');
  S.queue.push(Object.assign({ qid: uid() }, op));
  saveQueue();
  setStatus();
  sync();
}

/** Envía la cola en orden y luego descarga una copia fresca de la planilla. */
async function sync() {
  if (S.syncing) return;
  if (!S.settings.url) { setStatus(); return; }

  S.syncing = true;
  setStatus('busy');
  try {
    while (S.queue.length) {
      const op = S.queue[0];
      try {
        const json = await api(op.action, op.payload);
        S.queue.shift();
        saveQueue();
        applySnapshot(json);
      } catch (e) {
        // Los errores "definitivos" descartan la operación; el resto (red, auth…) aborta y se reintenta luego.
        if (e.code !== 'conflict' && e.code !== 'bad_request') throw e;
        S.queue.shift();
        saveQueue();
        toast(
          e.code === 'conflict'
            ? 'Un cambio no se aplicó: la fila ya había cambiado en la planilla.'
            : 'Un cambio fue rechazado: ' + e.message
        );
      }
    }
    applySnapshot(await api('bootstrap'));
    S.err = '';
    S.lastSync = Date.now();
    S.status = 'ok';
  } catch (e) {
    S.err = e.message;
    S.status = e.code === 'network' ? 'offline' : 'error';
    if (e.code === 'auth') {
      S.tab = 'ajustes';
      toast('Token inválido: revísalo en Ajustes.');
    }
  } finally {
    S.syncing = false;
    setStatus();
    onData();
  }
}

/** Actualiza el botón de sincronización de la barra superior. `force = 'busy'` muestra "Sincronizando…". */
function setStatus(force) {
  const button = $('#syncBtn');
  const pending = S.queue.length;
  const pendingText = `${pending} pendiente${pending > 1 ? 's' : ''}`;
  let state = force || S.status;
  let text;

  if (force === 'busy') {
    text = 'Sincronizando…';
  } else if (pending && S.status !== 'error') {
    state = S.status === 'offline' ? 'offline' : 'pending';
    text = S.status === 'offline' ? `Sin conexión · ${pendingText}` : pendingText;
  } else if (state === 'offline') {
    text = 'Sin conexión';
  } else if (state === 'error') {
    text = 'Error · toca para reintentar';
  } else {
    text = S.settings.url ? 'Sincronizado' : 'Sin configurar';
  }

  button.dataset.s = state;
  $('#syncTxt').textContent = text;
  button.title = S.err || '';
}
