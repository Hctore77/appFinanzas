export default async function handler(req, res) {
    // 1. Permisos CORS para evitar bloqueos del navegador
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 2. PRUEBA DE VIDA: Esto nos dirá si Vercel detectó el archivo
    if (req.method === 'GET') {
        return res.status(200).json({ mensaje: "¡El backend de fr4finance está VIVO y funcionando!" });
    }

    // 3. Lógica principal de la IA
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    try {
        const prompt = req.body.prompt;
        const customKey = req.body.customKey;
        const apiKey = customKey || process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'API key no configurada en Vercel' });
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 600 }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            if (response.status === 403) return res.status(403).json({ error: 'API Key inválida' });
            return res.status(response.status).json({ error: 'Error al comunicarse con Google AI' });
        }

        const data = await response.json();
        const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
        
        if (!aiText) return res.status(500).json({ error: 'La IA no generó texto' });

        const cleanedText = aiText.replace(/```html/g, '').replace(/```/g, '').trim();
        return res.status(200).json({ text: cleanedText });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}