import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-heartbeat');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
    });

    let body = {};
    try {
        const buffers = [];
        for await (const chunk of req) { buffers.push(chunk); }
        const data = Buffer.concat(buffers).toString();
        body = data ? JSON.parse(data) : {};
    } catch (e) { body = {}; }

    const psw = body.password ? body.password.trim() : "";
    const authorizedPasswords = (process.env.MASTER_PASSWORD || "").split(',').map(p => p.trim());

    if (!psw || !authorizedPasswords.includes(psw)) {
        return res.status(401).json({ error: "Password errata" });
    }

    const sessionKey = `session_${psw}`;
    const isOccupied = await kv.get(sessionKey);
    if (isOccupied && req.headers['x-heartbeat'] !== 'true') {
        return res.status(403).json({ error: "Accesso negato: sessione già attiva" });
    }
    await kv.set(sessionKey, "active", { ex: 45 });

    try {
        const githubResponse = await fetch(`https://raw.githubusercontent.com/Leinadf1/lista/main/lista_privata.m3u?t=${Date.now()}`, {
            headers: { 
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        const fileContent = await githubResponse.text();

        // --- FILTRO CHIRURGICO PER MATTEO E DARIO ---
        const checkPsw = psw.toLowerCase();
        if (checkPsw === "matteo" || checkPsw === "dario") {
            const lines = fileContent.split('\n').map(l => l.trim()).filter(l => l !== "");
            let filtered = "#EXTM3U\n";
            
            // Troviamo SOLO la riga di Sky Sport F1
            const f1Idx = lines.findIndex(l => 
                l.startsWith('#EXTINF') && l.toUpperCase().includes("SKY SPORT F1")
            );

            if (f1Idx !== -1) {
                // Aggiungiamo solo la riga INFO e la riga STREAM subito dopo
                filtered += lines[f1Idx] + "\n";
                if (lines[f1Idx + 1]) {
                    filtered += lines[f1Idx + 1] + "\n";
                }
                
                // MANDIAMO LA RISPOSTA E CHIUDIAMO TUTTO. 
                // È impossibile che Dario riceva altro dopo questo return.
                return res.status(200).send(filtered);
            }
            
            return res.status(200).send("#EXTM3U\n");
        }
        // --- FINE FILTRO ---

        // LOGICA PER TE (DAZN + RESTO DELLA LISTA)
        let daznLineare = "";
        try {
            const daznResponse = await fetch(`https://nodrm.online/list/dz1.txt?t=${Date.now()}`);
            if (daznResponse.ok) {
                daznLineare = await daznResponse.text();
                daznLineare = daznLineare.replace("#EXTM3U", "").trim();
            }
        } catch (e) { console.error("Errore DAZN"); }

        let lines = fileContent.split('\n');
        let lastChampionsIdx = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toUpperCase().includes('GROUP-TITLE="CHAMPIONS LEAGUE"')) {
                for (let k = i + 1; k < lines.length; k++) {
                    if (lines[k].trim().startsWith('http')) {
                        lastChampionsIdx = k;
                        break;
                    }
                }
            }
        }

        let finalContent = "";
        if (lastChampionsIdx !== -1) {
            lines.splice(lastChampionsIdx + 1, 0, "\n" + daznLineare + "\n");
            finalContent = lines.join('\n');
        } else {
            finalContent = fileContent + "\n" + daznLineare;
        }

        res.status(200).send(finalContent);

    } catch (error) {
        res.status(500).json({ error: "Errore caricamento liste" });
    }
}    try {
        const githubResponse = await fetch(`https://raw.githubusercontent.com/Leinadf1/lista/main/lista_privata.m3u?t=${Date.now()}`, {
            headers: { 
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        const fileContent = await githubResponse.text();

        // --- FILTRO RIGOROSO PER MATTEO E DARIO ---
        // Usiamo il minuscolo per il confronto così non sbagliamo mai
        const checkPsw = psw.toLowerCase();
        if (checkPsw === "matteo" || checkPsw === "dario") {
            const lines = fileContent.split('\n').map(l => l.trim()).filter(l => l !== "");
            let filtered = "#EXTM3U\n";
            
            // Cerchiamo l'indice di Sky Sport F1
            const targetIdx = lines.findIndex(l => 
                l.startsWith('#EXTINF') && l.toUpperCase().includes("SKY SPORT F1")
            );

            if (targetIdx !== -1) {
                // Recuperiamo tag extra tipo #KODIPROP sopra l'inf
                let j = targetIdx - 1;
                let buffer = [];
                while (j >= 0 && lines[j].startsWith('#') && !lines[j].startsWith('#EXTM3U') && !lines[j].startsWith('#EXTINF')) {
                    buffer.unshift(lines[j]);
                    j--;
                }
                
                // Costruiamo il blocco singolo
                buffer.forEach(l => filtered += l + "\n");
                filtered += lines[targetIdx] + "\n"; 
                
                // Aggiungiamo il link e chiudiamo immediatamente
                if (lines[targetIdx + 1] && !lines[targetIdx + 1].startsWith('#')) {
                    filtered += lines[targetIdx + 1] + "\n";
                }
                
                // IL RETURN QUI BLOCCA TUTTO: Dario non potrà mai vedere i canali fissi sotto
                return res.status(200).send(filtered);
            }
            
            return res.status(200).send("#EXTM3U\n");
        }
        // --- FINE FILTRO PER MATTEO/DARIO ---


        // LOGICA PER TE (DAZN + RESTO DELLA LISTA)
        let daznLineare = "";
        try {
            const daznResponse = await fetch(`https://nodrm.online/list/dz1.txt?t=${Date.now()}`);
            if (daznResponse.ok) {
                daznLineare = await daznResponse.text();
                daznLineare = daznLineare.replace("#EXTM3U", "").trim();
            }
        } catch (e) { console.error("Errore DAZN 1"); }

        let lines = fileContent.split('\n');
        let lastChampionsIdx = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toUpperCase().includes('GROUP-TITLE="CHAMPIONS LEAGUE"')) {
                for (let k = i + 1; k < lines.length; k++) {
                    if (lines[k].trim().startsWith('http')) {
                        lastChampionsIdx = k;
                        break;
                    }
                }
            }
        }

        let finalContent = "";
        if (lastChampionsIdx !== -1) {
            lines.splice(lastChampionsIdx + 1, 0, "\n" + daznLineare + "\n");
            finalContent = lines.join('\n');
        } else {
            finalContent = fileContent + "\n" + daznLineare;
        }

        res.status(200).send(finalContent);

    } catch (error) {
        res.status(500).json({ error: "Errore caricamento liste" });
    }
}
