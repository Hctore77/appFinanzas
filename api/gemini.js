module.exports = async function (req, res) {
    // 1. Configurar CORS básico por seguridad
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Manejar preflight request (OPTIONS)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Solo permitir método POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    try {
        // En Vercel con Node.js clásico, req.body ya viene parseado como JSON
        const { prompt, customKey } = req.body;

        if (!prompt || prompt.trim() === '') {
            return res.status(400).json({ error: 'El prompt es requerido' });
        }

        // Usar la API key del usuario si la proporcionó, o la de Entorno de Vercel
        const apiKey = customKey || process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.error('❌ No hay API key configurada en Vercel');
            return res.status(500).json({ error: 'API key no configurada en el servidor' });
        }

        // URL de Gemini API
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const payload = {
            contents: [{ 
                parts: [{ text: prompt }] 
            }],
            generationConfig: {
                temperature: 0.7,      
                maxOutputTokens: 600
            }
        };

        // Llamar a Gemini API
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Error de Google (${response.status}):`, errorText);
            
            let errorMessage = 'Error al comunicarse con la IA';
            if (response.status === 429) errorMessage = 'Límite de uso de IA alcanzado por hoy.';
            if (response.status === 403) errorMessage = 'La API key de Google es inválida.';
            
            return res.status(response.status).json({ error: errorMessage });
        }

        const data = await response.json();
        const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
        
        if (!aiText) {
            return res.status(500).json({ error: 'La IA no generó una respuesta válida' });
        }

        // Limpiar la respuesta de posibles markdown
        const cleanedText = aiText
            .replace(/```html/g, '')
            .replace(/```/g, '')
            .replace(/\*\*/g, '<strong>')
            .replace(/\*/g, '')
            .trim();

        // Devolver la respuesta exitosa
        return res.status(200).json({ text: cleanedText });

    } catch (error) {
        console.error('❌ Error interno del servidor:', error);
        return res.status(500).json({ error: 'Error del servidor Vercel. Intenta de nuevo.' });
    }
};