# Expenses App v2

PWA para registrar gastos desde el teléfono. Usa **tu propia planilla de Google Sheets como base de datos**: la app habla con un Google Apps Script publicado desde esa planilla, y la planilla sigue siendo la única fuente de verdad. La app guarda una copia local para funcionar sin conexión y envía los cambios pendientes cuando vuelve la red.

## Cómo funciona

```
PWA (este repo)  ──POST JSON + token──▶  Apps Script (spreadsheet-code.gs)  ──▶  tu Google Sheet
```

## Qué necesita la planilla

### 1. Una hoja con los movimientos

El script detecta solo la hoja de gastos: busca, en las primeras 10 filas de cada hoja, una fila de encabezados. Si hay varias hojas parecidas se queda con la que tiene más filas (o fija el nombre en `SHEET_NAME`, ver más abajo).

| Columna | Encabezados aceptados | ¿Obligatoria? | Contenido |
| --- | --- | --- | --- |
| Fecha | `Date`, `Fecha` | **Sí** | Fecha del movimiento |
| Monto | `Amount`, `Monto`, `Importe`, `Valor` | **Sí** | Número. **Negativo = gasto, positivo = ingreso/reintegro** |
| Nombre | `Name`, `Nombre`, `Comercio`, `Glosa` | No | Comercio o nombre |
| Descripción | `Description`, `Descripción`, `Detalle` | No | Detalle libre |
| Tipo | `Type`, `Tipo`, `Categoría`, `Category` | No* | Categoría del movimiento |
| Cuenta | `Account`, `Cuenta`, `Banco`, `Medio de pago` | No* | Cuenta o tarjeta usada |

\* Sin estas columnas la app no tiene categorías ni cuentas que ofrecer, así que en la práctica las necesitas.

Los encabezados no distinguen mayúsculas ni tildes, y las columnas pueden estar en cualquier orden. Las demás columnas de la hoja (fórmulas, notas, etc.) se respetan y no se tocan.

**Formato de los datos**

- **Fechas:** celdas de fecha reales. También se leen textos `aaaa-mm-dd` y `aa-mm-dd` (este último se interpreta como 20aa). Las filas sin fecha válida se ignoran.
- **Montos:** usa celdas numéricas. Si un monto viene como texto, solo se le quitan `$`, espacios y comas; un texto con punto de miles (`1.234`) se leería mal.
- **Orden:** puede ir de la más antigua a la más reciente o al revés. Al agregar un movimiento, el script lo inserta en el lugar que le corresponde por fecha, y copia formato y validación de una fila parecida.

### 2. Listas de tipos y cuentas (validación de datos)

La app arma sus opciones de **Tipo** y **Cuenta** a partir de:

1. La **validación de datos** de esas columnas (lista desplegable, ya sea una lista escrita a mano o un rango). Se usa la lista de la última fila que tenga validación.
2. Los valores que ya aparecen en las filas de esa columna.

Lo más cómodo es tener un desplegable en las columnas Tipo y Cuenta con todas tus opciones.

### 3. Traspasos entre cuentas

Un traspaso es un movimiento cuyo **Tipo contiene la palabra "traspaso"** (por ejemplo `Traspasos Internos`). Se guarda como **dos filas**: una negativa en la cuenta de origen y otra positiva en la de destino. Los traspasos no cuentan como gasto ni ingreso en el Resumen, y sirven para registrar el pago de una tarjeta. Conviene tener ese tipo en tu lista; si no existe, la app usa `Traspasos Internos` como nombre por defecto.

### 4. Hojas que crea el script

No hace falta crearlas; aparecen solas y no deberías editarlas a mano:

- **`_Config`**: cuentas (tipo, día de cierre y de vencimiento), presupuestos por categoría y totales de estados de cuenta de las tarjetas. Los guarda la app desde **Ajustes**.
- **`_IDs`** (oculta): últimos identificadores enviados, para no duplicar un movimiento si la app reintenta un envío.

El script ignora estas dos hojas al buscar la hoja de gastos.

## Instalación

### Backend (Apps Script)

1. Abre tu planilla → **Extensiones → Apps Script**.
2. Pega el contenido de [`spreadsheet-code.gs`](spreadsheet-code.gs) (reemplaza lo que haya).
3. Cambia `TOKEN` (`'CHANGE_ME'`) por una clave larga y privada. Opcional: pon el nombre de tu hoja en `SHEET_NAME`.
4. **Implementar → Nueva implementación → Aplicación web**
   - Ejecutar como: **yo**
   - Quién tiene acceso: **Cualquier persona**
5. Autoriza los permisos que pide Google y copia la **URL de la aplicación web** (termina en `/exec`).

> Quien tenga la URL **y** el token puede leer y modificar tu planilla. Mantén el token en secreto.
>
> Si más adelante editas el script, hay que publicar una **nueva versión** (Implementar → Administrar implementaciones → editar → Nueva versión); si no, la URL sigue ejecutando el código anterior.

### App (PWA)

Sirve esta carpeta como sitio estático (la PWA requiere HTTPS, salvo en `localhost`). Todas las rutas son relativas, así que funciona tanto en la raíz de un dominio como en un subdirectorio.

**Despliegue en GitHub Pages**

1. En el repositorio: **Settings → Pages → Build and deployment**, *Source*: **Deploy from a branch**, rama `main`, carpeta `/ (root)`. (Pages requiere que el repo sea público, salvo en planes de pago.)
2. Tras el primer despliegue, la app queda en `https://bryawnie.github.io/expenses-app-v2/`.
3. Cada `git push` a `main` la actualiza. Si cambias archivos de `js/` o `css/`, sube también el número de `CACHE` en `sw.js` para que el teléfono descargue la versión nueva.

Luego, en la app, abre **Ajustes → Conexión con tu planilla**, pega la URL y el token y toca **Guardar y probar conexión**.

Para configurar otro dispositivo sin teclear, abre la app con `#u=<URL codificada>&t=<token>` al final de la dirección: se importan los datos y se borran de la barra.

### Instalar en el teléfono

Abre la app en el navegador y usa **Agregar a pantalla de inicio / Instalar app**. Si cambias el ícono más adelante, desinstala y vuelve a agregarla para verlo.

## Estructura del proyecto

```
index.html              estructura de la app
css/styles.css          estilos
js/                     código, un archivo por área (utils, state, api, data, ui, form, pantallas, main)
sw.js                   service worker (caché para uso sin conexión)
manifest.webmanifest    datos de instalación de la PWA
icon-*.png              íconos
spreadsheet-code.gs     backend que se pega en la planilla
```

Si agregas o renombras archivos de `js/` o `css/`, actualiza también la lista `SHELL` de `sw.js` y sube el número de `CACHE`, para que los dispositivos descarguen los cambios.
