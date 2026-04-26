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
        // 1. Scarica la tua lista privata da GitHub
        const githubResponse = await fetch(`https://raw.githubusercontent.com/Leinadf1/lista/main/lista_privata.m3u?t=${Date.now()}`, {
            headers: { 
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        const fileContent = await githubResponse.text();

        // 2. SE MATTEO: Filtra solo Sky Sport F1 e chiudi (DAZN non viene aggiunto)
        if (psw === "Matteo") {
            const lines = fileContent.split('\n').map(l => l.trim());
            let filtered = "#EXTM3U\n";
            let targetIdx = -1;

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('#EXTINF') && lines[i].toUpperCase().includes("SKY SPORT F1")) {
                    targetIdx = i;
                    break;
                }
            }

            if (targetIdx !== -1) {
                let j = targetIdx - 1;
                let buffer = [];
                while (j >= 0 && lines[j].startsWith('#')) {
                    if (lines[j] !== "") buffer.unshift(lines[j]);
                    j--;
                }
                buffer.forEach(l => filtered += l + "\n");
                filtered += lines[targetIdx] + "\n";
                if (lines[targetIdx + 1]) filtered += lines[targetIdx + 1] + "\n";
                return res.status(200).send(filtered);
            }
            return res.status(200).send(filtered); // Ritorna vuoto se F1 non trovata
        }

        // 3. PER GLI ALTRI (TE): Scarica DAZN 1 dal link esterno
        let daznContent = "";
        try {
            const daznResponse = await fetch(`https://nodrm.online/list/dz1.txt?t=${Date.now()}`);
            if (daznResponse.ok) {
                daznContent = await daznResponse.text();
                // Puliamo l'eventuale intestazione #EXTM3U dal file DAZN per non duplicarla
                daznContent = daznContent.replace("#EXTM3U", "").trim();
            }
        } catch (e) {
            console.error("Errore download DAZN esterno");
        }

        // 4. Unisci DAZN 1 in cima alla tua lista
        // Inseriamo il contenuto di DAZN subito dopo la prima riga (#EXTM3U)
        let finalContent = fileContent.replace("#EXTM3U", "#EXTM3U\n" + daznContent);

        res.status(200).send(finalContent);

    } catch (error) {
        res.status(500).json({ error: "Errore GitHub o recupero liste" });
    }
}
