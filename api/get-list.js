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

        // --- FILTRO RIGOROSO PER MATTEO E DARIO ---
        if (psw === "Matteo" || psw === "Dario") {
            // Puliamo la lista da righe vuote per evitare errori di indice
            const lines = fileContent.split('\n').map(l => l.trim()).filter(l => l !== "");
            let filtered = "#EXTM3U\n";
            
            // Trova l'indice esatto del canale Sky Sport F1
            const targetIdx = lines.findIndex(l => 
                l.startsWith('#EXTINF') && l.toUpperCase().includes("SKY SPORT F1")
            );

            if (targetIdx !== -1) {
                // Recupera eventuali tag tecnici (es. #KODIPROP) situati subito sopra l'EXTINF
                let j = targetIdx - 1;
                let extraTags = [];
                while (j >= 0 && lines[j].startsWith('#') && !lines[j].startsWith('#EXTM3U') && !lines[j].startsWith('#EXTINF')) {
                    extraTags.unshift(lines[j]);
                    j--;
                }
                
                // Aggiunge i tag, l'EXTINF e la riga successiva (il link dello stream)
                extraTags.forEach(l => filtered += l + "\n");
                filtered += lines[targetIdx] + "\n"; 
                
                if (lines[targetIdx + 1] && !lines[targetIdx + 1].startsWith('#')) {
                    filtered += lines[targetIdx + 1] + "\n";
                }
                
                return res.status(200).send(filtered);
            }
            
            // Se non trova il canale, restituisce solo l'header vuoto
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
