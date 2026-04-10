module.exports = async function (req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    try {
        const prompt = req.body.prompt;
        const customKey = req.body.customKey;
        const apiKey = customKey || process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.error('❌ API Key no encontrada');
            return res.status(500).json({ error: 'API key no configurada en el servidor' });
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
            let errorMessage = 'Error al comunicarse con la IA';
            if (response.status === 429) errorMessage = 'Límite de uso de IA alcanzado por hoy.';
            if (response.status === 403) errorMessage = 'API key inválida.';
            return res.status(response.status).json({ error: errorMessage });
        }

        const data = await response.json();
        const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
        
        if (!aiText) return res.status(500).json({ error: 'La IA no generó texto' });

        const cleanedText = aiText.replace(/```html/g, '').replace(/```/g, '').trim();
        return res.status(200).json({ text: cleanedText });

    } catch (error) {
        console.error('❌ Error del servidor:', error);
        return res.status(500).json({ error: 'Error interno del servidor Vercel' });
    }
};