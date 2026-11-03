// Asesor IA de fr4finance.
// - Solo responde a usuarios autenticados con Firebase (token en "Authorization: Bearer <idToken>").
// - El prompt se arma aquí con números validados; el cliente no puede mandar texto libre.
// - Devuelve { consejos: string[] } en texto plano (el cliente lo pinta con textContent, nunca como HTML).

// La API key web de Firebase es pública por diseño (va en el index.html); se puede sobreescribir por env.
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyC6Y5_bfA2Gr-4rvLuUdRUoMzNUUpxmDuw';
const LIMITE_DIARIO = Number(process.env.IA_LIMITE_DIARIO) || 10;
// Google retira modelos viejos (gemini-2.0-flash ya no existe) y a veces satura los nuevos ("high demand").
// Se prueban en orden; el primero se puede cambiar sin tocar código con GEMINI_MODEL.
// Tiempo máximo por llamada a un proveedor: si Google se cuelga, se corta y se prueba el siguiente
// (antes una llamada colgada llegaba al límite de 300 s de Vercel y el usuario veía un 504).
const TIMEOUT_MS = 8000;
const GEMINI_MODELOS = [...new Set([process.env.GEMINI_MODEL || 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'])];

// Límite por usuario "best effort": vive en la memoria de cada instancia serverless,
// así que se reinicia si Vercel levanta una instancia nueva. Frena el abuso casual,
// no a un atacante decidido (para eso: Firestore vía firebase-admin o Upstash/KV).
const usos = new Map();

function devolverCuota(uid) {
    const u = usos.get(uid);
    if (u && u.n > 0) u.n--;
}

function consumirCuota(uid) {
    const hoy = new Date().toISOString().slice(0, 10);
    const u = usos.get(uid);
    if (!u || u.dia !== hoy) { usos.set(uid, { dia: hoy, n: 1 }); return true; }
    if (u.n >= LIMITE_DIARIO) return false;
    u.n++;
    return true;
}

async function verificarUsuario(req) {
    const m = (req.headers.authorization || '').match(/^Bearer (.+)$/);
    if (!m) return null;
    // Google valida firma, expiración y que el token sea de ESTE proyecto (por la API key).
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: m[1] })
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.users?.[0]?.localId || null;
}

function numero(v) {
    const n = Number(v);
    return Number.isFinite(n) && Math.abs(n) < 1e12 ? n : null;
}

// Plan de deudas que ya calculó la app (opcional). Solo números y banderas; las deudas van sin nombre
// ("Deuda 1", "Deuda 2"…) para que no viaje texto del usuario al modelo.
function leerPlan(p) {
    if (!p || typeof p !== 'object') return null;
    const metodo = p.metodo === 'avalancha' ? 'avalancha' : p.metodo === 'nieve' ? 'nieve' : null;
    if (!metodo || !Array.isArray(p.deudas) || !p.deudas.length) return null;
    const entero = (x) => { const n = numero(x); return n === null ? null : Math.max(0, Math.round(n)); };
    const deudas = p.deudas.slice(0, 12).map(d => ({
        saldo: numero(d?.saldo), minimo: numero(d?.minimo),
        tasa: d?.tasa === null ? null : numero(d?.tasa), // null = el usuario no la ha registrado
        mes: entero(d?.mes), prioridad: d?.prioridad === true, msi: d?.msi === true,
    }));
    if (deudas.some(d => d.saldo === null || d.minimo === null)) return null;
    return { metodo, deudas, meses: entero(p.meses), interes: numero(p.interes), mesesMinimos: entero(p.mesesMinimos), interesMinimos: numero(p.interesMinimos) };
}

function construirPrompt(body) {
    const moneda = /^[A-Z]{3}$/.test(body.moneda) ? body.moneda : 'MXN';
    const campos = ['ingresos', 'gastos', 'sobrante', 'deudaTotal', 'fondoEmergencia', 'metaFondo'];
    const v = {};
    for (const c of campos) {
        v[c] = numero(body[c]);
        if (v[c] === null) return null;
    }
    const esenciales = numero(body.gastosEsenciales); // gastos de vivir un mes sin contar deudas (opcional)
    let fmt;
    try { fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }); }
    catch { fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }); }
    const f = (n) => fmt.format(n);
    const tiempo = (m) => m === null ? 'más de 50 años' : `${m} meses`;

    const plan = leerPlan(body.plan);
    let bloquePlan = '';
    if (plan) {
        const lineas = plan.deudas.map((d, i) => `  ${i + 1}. Deuda ${i + 1}: saldo ${f(d.saldo)}, pago mínimo ${f(d.minimo)}, ` +
            `${d.tasa === null ? 'tasa NO registrada (se calculó como 0%)' : d.msi ? 'meses sin intereses' : `tasa ${d.tasa}% anual`}` +
            `${d.prioridad ? ', marcada como prioridad por el usuario' : ''}, se liquida en el mes ${d.mes ?? 'nunca (el pago no alcanza)'}`).join('\n');
        bloquePlan = `

La app YA calculó este plan de deudas (método ${plan.metodo === 'avalancha' ? 'avalancha: mayor tasa primero' : 'bola de nieve: menor saldo primero'}), mandando el sobrante a la primera deuda de la lista:
${lineas}
- Terminaría en ${tiempo(plan.meses)}${plan.interes !== null ? ` pagando ${f(plan.interes)} de intereses` : ''}.
- Solo con pagos mínimos: ${tiempo(plan.mesesMinimos)}${plan.interesMinimos !== null ? ` y ${f(plan.interesMinimos)} de intereses` : ''}.

Tus consejos COMPLEMENTAN ese plan: no lo contradigas ni propongas otro orden de pago. No inventes tasas: si alguna no está registrada, sugiere registrarla para que el cálculo sea real.`;
    }

    return `Actúa como FinAI, asesor financiero personal experto para personas en México. Analiza este perfil mensual:
- Ingresos: ${f(v.ingresos)}
- Gastos totales (incluye pagos de deuda): ${f(v.gastos)}${esenciales !== null ? `\n- Gastos para vivir sin contar deudas: ${f(esenciales)}` : ''}
- Sobrante: ${f(v.sobrante)}
- Deuda total: ${f(v.deudaTotal)}
- Fondo de emergencia: ${f(v.fondoEmergencia)} de una meta de ${f(v.metaFondo)}${bloquePlan}

Da exactamente 3 consejos prácticos, concretos y en español, de máximo 2 oraciones cada uno, con cantidades cuando ayuden.
Responde ÚNICAMENTE con JSON válido con esta forma: {"consejos": ["...", "...", "..."]}
Sin markdown, sin HTML, sin texto fuera del JSON.`;
}

function extraerConsejos(texto) {
    const limpio = String(texto || '').replace(/```(json)?/g, '').trim();
    try {
        const ini = limpio.indexOf('{');
        const fin = limpio.lastIndexOf('}');
        const obj = JSON.parse(limpio.slice(ini, fin + 1));
        if (Array.isArray(obj.consejos)) {
            const c = obj.consejos.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().slice(0, 600)).slice(0, 5);
            if (c.length) return c;
        }
    } catch { /* cae al plan B */ }
    // Plan B: el modelo no respetó el JSON; usar líneas de texto.
    const lineas = limpio.split('\n').map(l => l.replace(/^[\s\-*•\d.)]+/, '').trim()).filter(Boolean);
    return lineas.length ? lineas.slice(0, 5).map(l => l.slice(0, 600)) : null;
}

async function llamarDeepSeek(prompt, key) {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            max_tokens: 600,
            temperature: 0.7
        })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || `DeepSeek HTTP ${r.status}`);
    return data.choices?.[0]?.message?.content;
}

async function llamarGeminiModelo(modelo, prompt, key) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            // Los modelos Gemini 3 ignoran temperature y el "thinking" cuenta dentro de maxOutputTokens:
            // pensamiento bajo y margen de tokens para que el JSON no salga cortado.
            generationConfig: { maxOutputTokens: 2048, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' } }
        })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || `Gemini HTTP ${r.status}`);
    return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

// Si un modelo está saturado, retirado o responde vacío, se intenta el siguiente de GEMINI_MODELOS.
async function llamarGemini(prompt, key) {
    let ultimoError;
    for (const modelo of GEMINI_MODELOS) {
        try {
            const texto = await llamarGeminiModelo(modelo, prompt, key);
            if (extraerConsejos(texto)) return texto;
            ultimoError = new Error(`${modelo}: respuesta vacía`);
        } catch (e) {
            ultimoError = new Error(`${modelo}: ${e.message}`);
        }
        console.error('gemini', ultimoError.message);
    }
    throw ultimoError;
}

export { construirPrompt }; // para pruebas

export default async function handler(req, res) {
    // Sin cabeceras CORS: solo la propia app (mismo dominio) puede llamar a este endpoint desde un navegador.
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    try {
        const uid = await verificarUsuario(req);
        if (!uid) return res.status(401).json({ error: 'Inicia sesión para usar el asesor.' });

        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const prompt = construirPrompt(body);
        if (!prompt) return res.status(400).json({ error: 'Datos financieros inválidos.' });

        if (!consumirCuota(uid)) {
            return res.status(429).json({ error: `Llegaste al límite de ${LIMITE_DIARIO} consultas por hoy. Vuelve mañana.` });
        }

        const proveedores = [];
        if (process.env.DEEPSEEK_API_KEY) proveedores.push(['deepseek', llamarDeepSeek, process.env.DEEPSEEK_API_KEY]);
        if (process.env.GEMINI_API_KEY) proveedores.push(['gemini', llamarGemini, process.env.GEMINI_API_KEY]);
        if (!proveedores.length) {
            console.error('Falta GEMINI_API_KEY o DEEPSEEK_API_KEY');
            return res.status(503).json({ error: 'El asesor no está configurado.' });
        }

        // Fallback real: si un proveedor falla, se intenta el siguiente.
        for (const [nombre, llamar, key] of proveedores) {
            try {
                const consejos = extraerConsejos(await llamar(prompt, key));
                if (consejos) return res.status(200).json({ consejos, provider: nombre });
                console.error(`${nombre}: respuesta vacía`);
            } catch (e) {
                console.error(`${nombre} falló:`, e.message);
            }
        }
        devolverCuota(uid); // si nadie respondió, no se cobra la consulta
        return res.status(502).json({ error: 'El asesor no está disponible en este momento. Intenta más tarde.' });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}
