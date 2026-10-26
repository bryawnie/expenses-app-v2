'use strict';
/* Hoja de edición de un movimiento. */

/** Abre la hoja inferior (bottom sheet) y devuelve el contenedor donde montar el formulario. */
function openSheet() {
  $('#sheet').innerHTML = '<div class="grab"></div><div id="sheetBody"></div>';
  $('#overlay').classList.add('on');
  S.editing = true;
  return $('#sheetBody');
}

function closeSheet() {
  $('#overlay').classList.remove('on');
  S.editing = false;
  if (FORM && FORM.opts.mode === 'edit') FORM = null;
  if (S.tab === 'registrar') render(); // vuelve a enlazar el formulario principal
}

/** Datos de una fila tal como estaban en la planilla; el servidor los usa para verificar que no cambió. */
const originalOf = r => ({ d: r.d, n: r.n, ds: r.ds, a: r.a, t: r.t, c: r.c });

function openEdit(row) {
  if (row.pending && !row.id) {
    toast('Este cambio aún está sincronizándose. Inténtalo en unos segundos.');
    return;
  }

  const form = {
    kind: row.a < 0 ? 'gasto' : 'ingreso',
    amount: String(Math.abs(Math.round(row.a))),
    name: row.n,
    desc: row.ds,
    date: row.d,
    type: row.t,
    acct: row.c,
    to: '',
    typeTouched: true,
    acctTouched: true,
    descTouched: true
  };

  mountForm(openSheet(), form, {
    mode: 'edit',

    onSubmit(f) {
      const amount = +f.amount;
      if (!amount) return 'Ingresa un monto.';
      if (!f.name.trim() && !f.desc.trim()) return 'Escribe un nombre.';
      if (!f.type || !f.acct) return 'Elige tipo y cuenta.';

      const item = {
        id: row.id || '',
        date: f.date || today(),
        name: f.name.trim(),
        desc: f.desc.trim(),
        amount: f.kind === 'gasto' ? -amount : amount,
        type: f.type,
        account: f.acct
      };

      if (row.pending) {
        // Aún no llegó a la planilla: basta con corregir el alta en la cola.
        S.queue.forEach(op => {
          if (op.action === 'add') op.payload.items = op.payload.items.map(it => (it.id === row.id ? item : it));
        });
        saveQueue();
      } else {
        enqueue({ action: 'update', payload: { row: row.r, orig: originalOf(row), item } });
      }
      toast('Cambios guardados ✓');
      closeSheet();
      render();
      return '';
    },

    onDelete() {
      if (!confirm('¿Eliminar este movimiento de tu planilla?')) return;

      if (row.pending) {
        S.queue.forEach(op => {
          if (op.action === 'add') op.payload.items = op.payload.items.filter(it => it.id !== row.id);
        });
        S.queue = S.queue.filter(op => op.action !== 'add' || op.payload.items.length);
        saveQueue();
      } else {
        enqueue({ action: 'delete', payload: { row: row.r, orig: originalOf(row) } });
      }
      toast('Eliminado');
      closeSheet();
      render();
    }
  });
}
