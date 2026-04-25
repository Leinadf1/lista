exports.handler = async (event) => {
    // Leggiamo la password inviata dal sito
    let password = "";
    try {
        const body = JSON.parse(event.body || "{}");
        password = body.password;
    } catch (e) {
        return { statusCode: 400, body: "Dati non validi" };
    }

    // Prendiamo le password autorizzate dalle variabili di Netlify
    const masterPasswords = (process.env.MASTER_PASSWORD || "").split(',');

    if (!masterPasswords.includes(password)) {
        return { 
            statusCode: 401, 
            body: JSON.stringify({ error: "Password errata" }) 
        };
    }

    try {
        // Recupera la lista da GitHub (Assicurati che l'URL sia il tuo "RAW")
        const response = await fetch('https://raw.githubusercontent.com/Leinadf1/lista/main/lista_privata.m3u');
        if (!response.ok) throw new Error("GitHub non risponde");
        
        let fileContent = await response.text();

        // Filtro speciale per Matteo
        if (password === 'Matteo') {
            const lines = fileContent.split('\n');
            let filteredM3U = "#EXTM3U\n";
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes("Sky Sport F1")) {
                    filteredM3U += lines[i] + "\n" + (lines[i+1] || "") + "\n";
                }
            }
            return { 
                statusCode: 200, 
                headers: { "Content-Type": "text/plain" },
                body: filteredM3U 
            };
        }

        // Per tutti gli altri, manda la lista intera
        return { 
            statusCode: 200, 
            headers: { "Content-Type": "text/plain" },
            body: fileContent 
        };

    } catch (error) {
        return { statusCode: 500, body: "Errore nel caricamento della lista" };
    }
};
