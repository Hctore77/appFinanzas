export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method === 'GET') {
        return res.status(200).json({ mensaje: "¡El backend de fr4finance está VIVO!", gemini: !!process.env.GEMINI_API_KEY, deepseek: !!process.env.DEEPSEEK_API_KEY });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Falta el prompt' });

        // Intentar DeepSeek primero si está disponible, sino Gemini
        const deepseekKey = process.env.DEEPSEEK_API_KEY;
        const geminiKey = process.env.GEMINI_API_KEY;

        if (deepseekKey) {
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 600,
                    temperature: 0.7
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || `DeepSeek error ${response.status}`);

            const text = data.choices?.[0]?.message?.content;
            if (!text) throw new Error('DeepSeek no generó respuesta');

            return res.status(200).json({ text: text.replace(/```html/g, '').replace(/```/g, '').trim(), provider: 'deepseek' });
        }

        if (geminiKey) {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 600 } })
                }
            );

            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || `Gemini error ${response.status}`);

            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('Gemini no generó respuesta');

            return res.status(200).json({ text: text.replace(/```html/g, '').replace(/```/g, '').trim(), provider: 'gemini' });
        }

        return res.status(500).json({ error: 'No hay API key configurada (GEMINI_API_KEY o DEEPSEEK_API_KEY)' });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message || 'Error interno del servidor' });
    }
}
