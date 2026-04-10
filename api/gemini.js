export const config = {
  runtime: 'edge', // Esto le dice a Vercel que use su motor ultra rápido sin dependencias
};

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Método no permitido' }), { status: 405 });
    }

    try {
        // Recibimos el prompt desde nuestro frontend
        const { prompt, customKey } = await req.json();

        // Usamos la API Key del usuario si existe, o la segura de Vercel
        const apiKey = customKey || process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return new Response(JSON.stringify({ error: 'Falta la API Key en Vercel' }), { status: 500 });
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 600 }
        };

        // Llamamos a Google desde los servidores de Vercel (Seguro)
        const apiResponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            return new Response(JSON.stringify({ error: `Error de Gemini: ${errorText}` }), { status: apiResponse.status });
        }

        const data = await apiResponse.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        return new Response(JSON.stringify({ text }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error en Edge Function:', error);
        return new Response(JSON.stringify({ error: 'Error interno del servidor' }), { status: 500 });
    }
}