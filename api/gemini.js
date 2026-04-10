export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    // Solo permitir método POST
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Método no permitido' }), { 
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // Recibir el prompt y la API key personalizada (si existe)
        const { prompt, customKey } = await req.json();

        if (!prompt || prompt.trim() === '') {
            return new Response(JSON.stringify({ error: 'El prompt es requerido' }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Usar la API key del usuario si la proporcionó, o la de Vercel
        const apiKey = customKey || process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.error('❌ No hay API key configurada en Vercel');
            return new Response(JSON.stringify({ error: 'API key no configurada en el servidor' }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // URL de Gemini API (modelo estable y rápido)
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        // Payload optimizado para respuestas cortas y concisas
        const payload = {
            contents: [{ 
                parts: [{ 
                    text: prompt 
                }] 
            }],
            generationConfig: {
                temperature: 0.7,      // Creatividad moderada
                maxOutputTokens: 600,  // Respuesta breve pero completa
                topP: 0.9,
                topK: 40
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
            ]
        };

        // Llamar a Gemini API
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        // Verificar si la respuesta es exitosa
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Gemini API error (${response.status}):`, errorText);
            
            // Mensajes de error amigables según el código
            let errorMessage = 'Error al comunicarse con la IA';
            if (response.status === 429) {
                errorMessage = 'Límite de uso de IA alcanzado. Intenta mañana o agrega tu propia API Key en Configuración.';
            } else if (response.status === 403) {
                errorMessage = 'API key inválida o sin permisos. Verifica tu clave en Configuración.';
            } else if (response.status === 400) {
                errorMessage = 'Solicitud inválida. El prompt puede ser demasiado largo.';
            }
            
            return new Response(JSON.stringify({ error: errorMessage }), { 
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const data = await response.json();
        
        // Extraer el texto de la respuesta
        const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
        
        if (!aiText) {
            console.error('❌ Respuesta vacía de Gemini:', data);
            return new Response(JSON.stringify({ error: 'La IA no generó una respuesta válida' }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Limpiar la respuesta de posibles markdown
        const cleanedText = aiText
            .replace(/```html/g, '')
            .replace(/```/g, '')
            .replace(/\*\*/g, '<strong>')
            .replace(/\*/g, '')
            .trim();

        // Devolver la respuesta exitosa
        return new Response(JSON.stringify({ text: cleanedText }), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });

    } catch (error) {
        console.error('❌ Error en Edge Function:', error);
        
        return new Response(JSON.stringify({ 
            error: 'Error interno del servidor. Intenta nuevamente más tarde.'
        }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}