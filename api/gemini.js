export default async function handler(req, res) {
    // 1. Solo permitir método POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método HTTP no permitido' });
    }

    try {
        // En Node.js, Vercel ya convierte automáticamente el body a JSON
        const prompt = req.body.prompt;
        const customKey = req.body.customKey;

        if (!prompt) {
            return res.status(400).json({ error: 'El prompt es requerido' });
        }

        // 2. Obtener la llave
        const apiKey = customKey || process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.error('❌ No hay API key en Vercel ni en la configuración del usuario');
            return res.status(500).json({ error: 'Falta la API Key de Gemini en el servidor' });
        }

        // 3. Preparar la llamada a Google
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 600 }
        };

        // 4. Ejecutar la llamada
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // 5. Manejar errores de Google
        if (!response.ok) {
            let errorMessage = 'Error al comunicarse con la IA';
            if (response.status === 429) errorMessage = 'Límite de uso de IA alcanzado por hoy.';
            if (response.status === 403) errorMessage = 'La API key de Google es inválida.';
            
            return res.status(response.status).json({ error: errorMessage });
        }

        // 6. Procesar y limpiar respuesta exitosa
        const data = await response.json();
        const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
        
        if (!aiText) {
            return res.status(500).json({ error: 'Google no generó texto' });
        }

        const cleanedText = aiText
            .replace(/```html/g, '')
            .replace(/```/g, '')
            .trim();

        // 7. Enviar al index.html
        return res.status(200).json({ text: cleanedText });

    } catch (error) {
        console.error('❌ Error fatal en el servidor:', error);
        return res.status(500).json({ error: 'Error interno del servidor Vercel' });
    }
}