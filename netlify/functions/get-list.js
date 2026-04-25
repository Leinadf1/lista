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

    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    try {
        // Usiamo l'IP dell'utente come "ID dispositivo"
        const dispositivoId = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || "anon";

        const checkRes = await fetch(`${redisUrl}/get/${passwordRicevuta}`, {
            headers: { Authorization: `Bearer ${redisToken}` }
        });
        const checkData = await checkRes.json();

        // Se la password è già usata da un IP DIVERSO, blocca
        if (checkData.result && checkData.result !== dispositivoId) {
            return { 
                statusCode: 403, 
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: "Password già in uso su un altro dispositivo." }) 
            };
        }

        // Occupiamo la password per 30 secondi
        await fetch(`${redisUrl}/set/${passwordRicevuta}/${dispositivoId}/EX/30`, {
            headers: { Authorization: `Bearer ${redisToken}` }
        });

        const urlGitHub = 'https://api.github.com/repos/Leinadf1/lista/contents/lista_privata.m3u';
        const response = await fetch(urlGitHub, {
            headers: {
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        
        let fileContent = await response.text();
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
