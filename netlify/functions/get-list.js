const { createClient } = require('@vercel/kv');

exports.handler = async (event) => {
    // Netlify riceve i dati in event.body
    const { password } = JSON.parse(event.body || "{}");

    const kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
    });

    const masterPasswords = (process.env.MASTER_PASSWORD || "").split(',');

    if (!masterPasswords.includes(password)) {
        return { 
            statusCode: 401, 
            body: JSON.stringify({ error: "Password errata" }) 
        };
    }

    try {
        // Recupera la lista da GitHub (Raw URL)
        const response = await fetch('https://raw.githubusercontent.com/Leinadf1/lista/main/lista_privata.m3u');
        let fileContent = await response.text();

        // Filtro per Matteo
        if (password === 'Matteo') {
            const lines = fileContent.split('\n');
            let filteredM3U = "#EXTM3U\n";
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes("Sky Sport F1")) {
                    filteredM3U += lines[i] + "\n" + lines[i+1] + "\n";
                }
            }
            return { statusCode: 200, body: filteredM3U };
        }

        return { statusCode: 200, body: fileContent };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: "Errore caricamento lista" }) };
    }
};
