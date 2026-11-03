# fr4finance (appFinanzas)

App web de finanzas personales: presupuesto mensual (ingresos, gastos fijos/variables/hormiga, deudas),
fondo de emergencia, metas, inversiones y un asesor con IA. Nació como herramienta personal del autor
y **se está convirtiendo en una app multiusuario** para que cualquier persona la use.

Idioma: todo (UI, código, comentarios, commits) en **español**. Público objetivo inicial: México (MXN, `es-MX`).

## Stack y estructura

Sin build ni framework. Se despliega en **Vercel** desde GitHub (`Hctore77/appFinanzas`, rama `main` = producción;
otras ramas generan preview deploys).

- `index.html` — toda la app: HTML + Tailwind por CDN + Chart.js 4.4.1 + un `<script type="module">` con la lógica.
- `api/gemini.js` — función serverless de Vercel (`POST /api/gemini`), el asesor IA.
- `firestore.rules` — reglas de seguridad de Firestore (se publican a mano en Firebase Console; ver abajo).
- `logo.png`, `package.json` (`"type": "module"`, sin dependencias).

## Datos (Firebase)

- Proyecto Firebase: `plan-maestro-2026-fea50`. Auth: solo Google (`signInWithPopup`).
- Firestore: **un documento por usuario** en `usuarios/{uid}` con todo su estado:
  `settings.currency`, `sueldoQuincenal`, `ingresosExtras{ventas,bonos,otros}`, `metas.fondoEmergencia{objetivo,actual}`,
  y mapas `{clave: item}`: `deudas{nombre,total,pagoMensual,tasaAnual,esPrioridad}`
  (`tasaAnual` en % anual; `null`/ausente = el usuario no la ha puesto, distinto de `0` = sin intereses), `gastosFijos|gastosVariables|gastosHormiga{nombre,monto}`,
  `metasPersonalizadas{nombre,objetivo,actual}`, `gbm{ticker,shares,target}` (inversiones; el nombre "gbm" es legado).
- `normalizar()` en index.html rellena campos faltantes de documentos viejos: **cualquier campo nuevo debe agregarse
  ahí y en `datosPorDefecto()`**, porque ya hay usuarios con datos guardados.
- La config web de Firebase en index.html es pública por diseño; la seguridad está en `firestore.rules`.
- Cambiar reglas: editar `firestore.rules` y publicarlas en
  https://console.firebase.google.com/project/plan-maestro-2026-fea50/firestore/rules (no hay Firebase CLI configurado).

## Convenciones del frontend (index.html)

- Listas editables: un solo editor genérico guiado por el objeto `LISTAS`. IDs por convención:
  `${tipo}-modal`, `edit-${tipo}-key`, `${tipo}-save-btn`, `${tipo}-delete-btn`, `add-${tipo}-btn`.
  El primer campo de cada lista es el nombre (obligatorio). Para una lista nueva: agregar el modal en HTML + entrada en `LISTAS` + función de render.
- Botones de editar usan `data-editar="tipo" data-key="..."` con delegación de eventos; **no usar `onclick` en línea con datos**.
- **Todo texto del usuario va por `esc()`** si se mete en `innerHTML`, o se usa `textContent`. Montos siempre por `num()` (nunca NaN).
- Guardado: `guardarAhora()` tras acciones discretas (guardar en modal); `guardarConRetraso()` para inputs por tecla
  (se fuerza al ocultar/cerrar la pestaña). Firestore tiene caché offline persistente multi-pestaña.
- Cálculos centralizados en `calcularTotales()` (ingreso mensual = sueldoQuincenal × 2 + extras).

## Asesor

- **Principal, sin IA (en index.html)**: `diagnosticoLocal()` da consejos por reglas con los números del usuario
  (déficit, deudas sin pago, % en deudas, fondo de emergencia, gastos hormiga, tasa de ahorro) y `planDeudas(deudas, extra, metodo)`
  simula mes a mes con intereses (tasa/12): `'nieve'` = menor saldo primero, `'avalancha'` = mayor tasa primero; las
  marcadas como prioridad van antes en ambos. El sobrante va a la primera deuda y los pagos liberados se acumulan.
  `pintarPlan()` muestra ambos métodos con meses e intereses y recomienda el de menor interés. Instantáneo y gratis.
- Campos de lista tipo `'numopt'` en `LISTAS`: vacío se guarda como `null` (desconocido), no como 0.
- **IA opcional** (botón "segunda opinión"): solo se llama si el usuario lo pide; si falla, el diagnóstico sigue ahí.
- Que cada usuario use "su" Gemini con su login de Google no es viable: el login de Firebase solo da identidad,
  no acceso a la API de Gemini (que requiere API key/proyecto con facturación).

## IA (`api/gemini.js`)

- Exige `Authorization: Bearer <Firebase idToken>`; se verifica con `identitytoolkit accounts:lookup` (sin dependencias).
- El cliente manda **solo números**; el servidor valida y arma el prompt (no aceptar texto libre del cliente).
- Responde `{ consejos: string[] }` en texto plano; el cliente lo pinta con `textContent`.
- Proveedores en orden con fallback: DeepSeek (`DEEPSEEK_API_KEY`) → Gemini (`GEMINI_API_KEY`), env vars en Vercel.
  Modelos de Gemini en orden con fallback (`GEMINI_MODEL`, default `gemini-3.8-flash` → `gemini-3.6-flash` →
  `gemini-3.5-flash-lite`): Google retira modelos y a veces los satura. Si el asesor dice "no disponible", revisar
  los runtime logs de Vercel (Hobby guarda solo 1 hora). Si nadie responde, la consulta no cuenta para el límite.
- Timeout de 8 s por llamada a cada proveedor/modelo (peor caso ~24 s); el cliente corta a los 30 s.
- Límite diario por usuario (`IA_LIMITE_DIARIO`, default 10) en memoria: best-effort, se reinicia por instancia.

## Cómo probar

No hay tests automatizados ni servidor local configurado. Opciones:
- `node --check api/gemini.js`; el backend se puede probar importándolo con `fetch` simulado.
- Probar de verdad en el preview deploy de Vercel de la rama. Checklist manual: login, crear/editar/borrar deuda,
  abonar/retirar del fondo, asesor IA, recargar y confirmar que todo persistió, modo oscuro persiste.

## Estado y roadmap

Hecho (rama `seguridad-y-bugs`): endpoint IA autenticado y con límite, XSS corregido, API key de Gemini del usuario
eliminada, reglas de Firestore, validación de montos (sin NaN), modales que se limpian, guardado confiable,
confirmación al borrar/cerrar sesión, modo oscuro persistente, editor genérico.

Pendiente (en orden sugerido):
1. **Universalizar**: frecuencia de ingreso (semanal/quincenal/mensual/variable) y varias fuentes de ingreso;
   más monedas + formato por locale; inversiones genéricas (tipo + valor en dinero) en vez de "GBM/títulos";
   categorías de gasto personalizables; ~~tasa de interés + avalancha~~ (hecho).
2. **Historial**: registrar movimientos o cierres mensuales para ver tendencias (hoy es una foto de un solo mes).
3. **Cuentas y privacidad**: login con correo, modo invitado, exportar datos (CSV/JSON), borrar cuenta, aviso de privacidad (LFPDPPP).
4. **Calidad**: Tailwind por CDN no es para producción; límite de IA persistente (firebase-admin o Vercel KV); i18n.
