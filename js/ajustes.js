'use strict';
/* Pantalla Ajustes: conexión, cuentas y presupuestos. */

/** Guarda la configuración localmente y la encola para la planilla. */
function saveConfigNow(config) {
  S.data.config = config;
  store.set('data', S.data);
  enqueue({ action: 'saveConfig', payload: { config } });
}

function accountSettingsRowHTML(account) {
  const config = accountConfig(account);
  const kindOption = (value, label) =>
    `<option value="${value}" ${config.kind === value ? 'selected' : ''}>${label}</option>`;
  const creditDays = config.kind === 'credito'
    ? `<div class="sub">Cierre día <input class="day cd" inputmode="numeric" value="${config.closeDay || ''}" aria-label="Día de cierre"> Vence día <input class="day dd" inputmode="numeric" value="${config.dueDay || ''}" aria-label="Día de vencimiento"></div>`
    : '';

  return `<div class="cfgrow" data-acct="${esc(account)}"><span class="nm">${esc(account)}</span>
    <select class="k" aria-label="Tipo de cuenta ${esc(account)}">
      ${kindOption('debito', 'Débito / cuenta')}${kindOption('credito', 'Tarjeta de crédito')}${kindOption('efectivo', 'Efectivo')}
    </select>
    ${creditDays}</div>`;
}

function budgetSettingsRowHTML(type, budgets) {
  return `<div class="cfgrow" data-type="${esc(type)}"><span class="nm">${esc(type)}</span><input class="num bud" inputmode="numeric" placeholder="Sin límite" value="${budgets[type] ? clp.format(budgets[type]) : ''}" aria-label="Presupuesto ${esc(type)}"></div>`;
}

function renderAjustes(view) {
  const config = S.data.config;
  const types = S.data.types.filter(t => !isTransfer(t));

  const connectionMessage = S.err
    ? '⚠ ' + esc(S.err)
    : S.data.loaded ? `Conectado · ${S.data.rows.length} movimientos cargados.` : '';
  const accountsHTML = S.data.accounts.length
    ? S.data.accounts.map(accountSettingsRowHTML).join('')
    : '<div class="muted small">Sincroniza para cargar tus cuentas.</div>';
  const budgetsHTML = types.length
    ? types.map(t => budgetSettingsRowHTML(t, config.budgets)).join('')
    : '<div class="muted small">Sincroniza para cargar tus categorías.</div>';
  const lastSyncText = S.lastSync
    ? new Date(S.lastSync).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    : '—';

  view.innerHTML = `
  <div class="card"><h2>Conexión con tu planilla</h2>
    <label class="f">URL de la aplicación web (Apps Script)<input id="s-url" value="${esc(S.settings.url)}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
    <label class="f">Token<input id="s-token" type="password" value="${esc(S.settings.token)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
    <button class="primary" data-act="saveconn" style="margin-top:8px">Guardar y probar conexión</button>
    <div class="muted small" id="connMsg" style="margin-top:8px">${connectionMessage}</div></div>
  <div class="card"><h2>Cuentas</h2>${accountsHTML}</div>
  <div class="card"><h2>Presupuesto mensual por categoría</h2>${budgetsHTML}
    <button class="primary" data-act="savecfg">Guardar cuentas y presupuestos</button></div>
  <div class="card"><h2>Sincronización</h2>
    <div class="line2"><span>Cambios pendientes</span><b>${S.queue.length}</b></div>
    <div class="line2"><span>Última sincronización</span><b>${lastSyncText}</b></div>
    <div style="display:flex;gap:8px;margin-top:8px"><button class="ghost" data-act="syncnow">Sincronizar ahora</button>${S.queue.length ? '<button class="ghost" data-act="discard">Descartar pendientes</button>' : ''}</div></div>
  <div class="card"><h2>Este dispositivo</h2><div class="muted small">Tus datos viven en tu planilla de Google. Aquí solo se guarda una copia para usar la app sin conexión.</div>
    <button class="ghost" data-act="clearlocal" style="margin-top:10px">Borrar copia local</button></div>`;
}

/** Lee los campos de cuentas y presupuestos de Ajustes y devuelve la configuración resultante. */
function readSettingsForm() {
  const config = JSON.parse(JSON.stringify(S.data.config));
  const dayFrom = input => (input ? Math.min(31, +input.value.replace(/\D/g, '') || 0) : 0);

  config.accounts = {};
  document.querySelectorAll('.cfgrow[data-acct]').forEach(row => {
    const kind = $('select.k', row).value;
    const isCredit = kind === 'credito';
    config.accounts[row.dataset.acct] = {
      kind,
      closeDay: isCredit ? dayFrom($('.cd', row)) : 0,
      dueDay: isCredit ? dayFrom($('.dd', row)) : 0
    };
  });

  config.budgets = {};
  document.querySelectorAll('.cfgrow[data-type]').forEach(row => {
    const amount = +$('.bud', row).value.replace(/\D/g, '');
    if (amount > 0) config.budgets[row.dataset.type] = amount;
  });
  return config;
}
