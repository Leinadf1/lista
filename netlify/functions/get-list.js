exports.handler = async (event) => {
    let passwordRicevuta = "";
    try {
        const body = JSON.parse(event.body || "{}");
        passwordRicevuta = body.password ? body.password.trim() : "";
    } catch (e) {
        return { statusCode: 400, body: "Dati non validi" };
    }

    const rawPasswords = process.env.MASTER_PASSWORD || "";
    const listaPassword = rawPasswords.split(',').map(p => p.trim()).filter(p => p !== "");
    
    if (!passwordRicevuta || !listaPassword.includes(passwordRicevuta)) {
        return { statusCode: 401, body: JSON.stringify({ error: "Password errata" }) };
    }

    // --- LOGICA 1 DISPOSITIVO ALLA VOLTA (UPSTASH) ---
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    try {
        // Controlliamo se la password è già in uso
        const checkRes = await fetch(`${redisUrl}/get/${passwordRicevuta}`, {
            headers: { Authorization: `Bearer ${redisToken}` }
        });
        const checkData = await checkRes.json();

        if (checkData.result) {
            // Se esiste già una "sessione" attiva, blocchiamo l'accesso
            return { 
                statusCode: 403, 
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: "Password già in uso su un altro dispositivo. Riprova tra 15 minuti." }) 
            };
        }

        // Se è libera, la "occupiamo" per 900 secondi (15 minuti)
        await fetch(`${redisUrl}/set/${passwordRicevuta}/active/EX/900`, {
            headers: { Authorization: `Bearer ${redisToken}` }
        });

        // --- RECUPERO LISTA DA GITHUB ---
        const urlGitHub = 'https://api.github.com/repos/Leinadf1/lista/contents/lista_privata.m3u';
        const response = await fetch(urlGitHub, {
            headers: {
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        
        if (!response.ok) throw new Error("Errore GitHub");
        let fileContent = await response.text();

        // Filtro Matteo
        let finalBody = fileContent;
        if (passwordRicevuta === 'Matteo') {
            const lines = fileContent.split('\n');
            let filteredM3U = "#EXTM3U\n";
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes("Sky Sport F1")) {
                    filteredM3U += lines[i] + "\n" + (lines[i+1] || "") + "\n";
                }
            }
            finalBody = filteredM3U;
        }

        return { 
            statusCode: 200, 
            headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" },
            body: finalBody 
        };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
