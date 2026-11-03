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
  `settings.currency`, `sueldoQuincenal` (monto **por pago**, nombre legado), `frecuenciaIngreso` ('semanal'|'quincenal'|'mensual'),
  `aguinaldo` (anual, no entra al ingreso mensual), `ingresosExtras{ventas,bonos,otros}`, `metas.fondoEmergencia{objetivo,actual}`,
  y mapas `{clave: item}`: `deudas{nombre,total,pagoMensual,tasaAnual,diaPago,esMSI,mesesRestantes,esPrioridad}`
  (compra a MSI: `antesDeGuardar` pone tasa 0 y pago = total / mesesRestantes; `tasaAnual` en % anual; `null`/ausente = el usuario no la ha puesto, distinto de `0` = sin intereses), `gastosFijos{nombre,monto,diaPago}`, `gastosVariables{nombre,monto}`,
  `gastosHormiga{nombre,monto,habito?,habitoPeriodo?,reto?}` (`habito` = clave de `HABITOS`; `habitoPeriodo` = dia|semana|quincena|mes
  en que el usuario lo contestó, `monto` siempre mensual; `reto{inicio,modo,montoAntes,apartado,hito}`:
  al empezar, `monto` pasa a lo que gasta ahora y `montoAntes` guarda lo de antes; `ahorroReto()` = días × diferencia)
  (`diaPago` 1-31 o `null`; lo usa `proximosPagos()` para la tarjeta "Próximos pagos" de los siguientes 10 días),
  `metasPersonalizadas{nombre,tipo,motivo,objetivo,actual,fechaMeta,aporteQuincenal,hito}` (`motivo` = el "para qué", se muestra en la tarjeta) (`tipo` = clave de `SUENOS`: f1, casa,
  auto…; `hito` = último 25/50/75/100% celebrado) (`fechaMeta` 'YYYY-MM-DD' o `null`;
  `planMeta()` calcula el aporte por quincena o la fecha de llegada, quincenas = día 15 y último del mes), `gbm{ticker,shares,target}` (inversiones; el nombre "gbm" es legado).
- `racha{quincena:'YYYY-MM-1|2',cuenta}`: quincenas seguidas con ahorro (fondo o sueño); `registrarRacha()` al registrar,
  `rachaVigente()` la da por rota si pasó más de una quincena. Borrar un movimiento no la reduce.
- `movimientos{tipo,monto,fecha,nota,deuda?,aplicado?,meta?,reto?}`: **solo los del mes en curso** (registro rápido, botón "+").
  `tipo` = gasto|hormiga|deuda|fondo|meta|ingreso (`meta` sube `metasPersonalizadas[meta].actual` y, si viene de un reto, `reto.apartado`); un abono baja `deudas[deuda].total` (guarda `aplicado` para revertirlo al borrar),
  `fondo` sube el fondo de emergencia. Al cargar en un mes nuevo, `cerrarMesesAnteriores()` resume los viejos en
  `historial[mes].real` y los borra, para que el documento no crezca sin límite (sin subcolecciones ni cambios de reglas).
- `historial{'YYYY-MM': {ingresos,gastos,sobrante,deudaTotal,fondo,real{…}}}`: `actualizarFotoDelMes()` la refresca en
  cada `guardarAhora()`; al cambiar de mes queda congelada. Alimenta la gráfica "Tu progreso" (últimos 12 meses).
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
- Cálculos centralizados en `calcularTotales()` (ingreso mensual = sueldo × `FRECUENCIAS[frecuenciaIngreso]` + extras;
  semanal = 52/12, quincenal = 2, mensual = 1).
- `guardarEditor` **mezcla** con el item existente (`{...viejo, ...nuevo}`) para no perder campos que el modal no muestra
  (hábito, reto, hito).
- Una entrada de `LISTAS` puede tener `antesDeGuardar(item)` para ajustar el item o devolver `[mensaje, idDelCampo]` como error.

## Asesor

- **Principal, sin IA (en index.html)**: `diagnosticoLocal()` da consejos por reglas con los números del usuario
  (déficit, deudas sin pago, % en deudas, fondo de emergencia, gastos hormiga, tasa de ahorro) y `planDeudas(deudas, extra, metodo)`
  simula mes a mes con intereses (tasa/12): `'nieve'` = menor saldo primero, `'avalancha'` = mayor tasa primero; las
  marcadas como prioridad van antes en ambos. El sobrante va a la primera deuda y los pagos liberados se acumulan.
  Las compras a MSI van al final (adelantarlas no ahorra). `abonos` = pagos extraordinarios por mes; `abonosAguinaldo()`
  los pone cada diciembre y `lineaAguinaldo()` muestra cuánto antes terminas si mandas el aguinaldo a la deuda.
  `pintarPlan()` muestra ambos métodos con meses e intereses y recomienda el de menor interés. Instantáneo y gratis.
- Campos de lista tipo `'dia'` (entero 1-31 o `null`, validado al guardar) y `'numopt'` en `LISTAS`: vacío se guarda como `null` (desconocido), no como 0.
- **IA opcional** (botón "segunda opinión"): solo se llama si el usuario lo pide; si falla, el diagnóstico sigue ahí.
- Que cada usuario use "su" Gemini con su login de Google no es viable: el login de Firebase solo da identidad,
  no acceso a la API de Gemini (que requiere API key/proyecto con facturación).

## Sueños, hábitos y motivación

- Bienvenida = cuestionario de 3 pasos (`abrirCuestionario(1)`): sueldo → sueño (9 principales + "ver más" con los
  `extra: true`; "otro" pide nombre propio; motivo opcional) → hábitos con monto y periodo (`PERIODOS_HABITO`, cada
  hábito trae su periodo típico) que crean/actualizan gastos hormiga con `habito` (mensual = monto × veces por mes). Se reabre desde
  "Retos y hábitos" en el paso 2 (`abrirCuestionario(2)`). Todo opcional; aviso de privacidad en el paso 3.
- "Retos y hábitos": cada hábito muestra costo anual y cuántas quincenas antes llegarías a la meta principal
  (`efectoEnMeta`); el reto (dejar o reducir) cuenta días y dinero no gastado, y "Mandar a mi sueño" abre el registro
  rápido prellenado. Tono sin juicios: se habla de gasto, no de vicio.
- Celebraciones (`celebrar()`): hitos 25/50/75/100% de cada meta, días 7/30/90/180/365 de reto, racha de 3/6/12/24
  quincenas. Hitos alcanzados antes de existir esto se marcan al cargar sin festejar.
- Técnicas de comportamiento aplicadas: el "para qué" de cada sueño (`motivo`); costo en **horas de trabajo**
  (`horasDeTrabajo()`: ingreso mensual / 208 h, jornada de 48 h/semana); **págate primero** (`renderizarPagatePrimero()`:
  el día de pago según `frecuenciaIngreso` sugiere apartar el aporte del sueño principal o 10% del sobrante por pago al
  fondo; se oculta si ya apartó hoy o con "Hoy no", guardado en localStorage); **meta cercana** (≤ 4 quincenas o ≥ 75%).
- No hay rankings entre usuarios ni recomendaciones de inversión (datos sensibles / asesoría financiera).

## IA (`api/gemini.js`)

- Exige `Authorization: Bearer <Firebase idToken>`; se verifica con `identitytoolkit accounts:lookup` (sin dependencias).
- El cliente manda **solo números**; el servidor valida y arma el prompt (no aceptar texto libre del cliente).
  Incluye opcionalmente `gastosEsenciales` y `plan` (`planParaIA()`: el método que el usuario ve en el modal, meses,
  intereses y por deuda saldo/mínimo/tasa(null = no registrada)/mes/prioridad/msi, **sin nombres**). El prompt
  (`construirPrompt`, exportada para pruebas) le pide a la IA complementar ese plan sin contradecirlo ni inventar tasas.
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

Hecho (rama `seguridad-y-bugs`): asesor sin IA con plan avalancha/bola de nieve, próximos pagos, metas por quincena,
frecuencia de ingreso, aguinaldo, MSI, registro rápido e historial; endpoint IA autenticado y con límite, XSS corregido, API key de Gemini del usuario
eliminada, reglas de Firestore, validación de montos (sin NaN), modales que se limpian, guardado confiable,
confirmación al borrar/cerrar sesión, modo oscuro persistente, editor genérico.

Pendiente (en orden sugerido):
1. **Universalizar**: ~~frecuencia de ingreso~~ (hecho: semanal/quincenal/mensual; falta "variable") y varias fuentes de ingreso;
   más monedas + formato por locale; inversiones genéricas (tipo + valor en dinero) en vez de "GBM/títulos";
   categorías de gasto personalizables; ~~tasa de interés + avalancha~~ (hecho).
2. ~~**Historial**~~ (hecho: registro rápido + foto mensual). Siguiente: categorías en los movimientos y exportar.
3. **Cuentas y privacidad**: login con correo, modo invitado, exportar datos (CSV/JSON), borrar cuenta, aviso de privacidad (LFPDPPP).
4. **Calidad**: Tailwind por CDN no es para producción; límite de IA persistente (firebase-admin o Vercel KV); i18n.
