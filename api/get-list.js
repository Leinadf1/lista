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

    // --- LOGICA BLOCCO SESSIONE UNICA ---
    const sessionKey = `session_${psw}`;
    const isOccupied = await kv.get(sessionKey);
    // Se la sessione esiste E non è un battito cardiaco (heartbeat), nega l'accesso
    if (isOccupied && req.headers['x-heartbeat'] !== 'true') {
        return res.status(403).json({ error: "Accesso negato: password già in uso" });
    }
    // Aggiorna/Crea la sessione per 45 secondi
    await kv.set(sessionKey, "active", { ex: 45 });

    try {
        const githubUrl = "https://raw.githubusercontent.com/Leinadf1/lista/main/lista_privata.m3u";
        const githubResponse = await fetch(githubUrl, {
            headers: { 
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        
        const fileContent = await githubResponse.text();

        // --- LOGICA SPECIALE MATTEO ---
        if (psw === "Matteo") {
            const target = "Sky Sport F1";
            const lines = fileContent.split('\n');
            let filtered = "#EXTM3U\n";
            let found = false;

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('#EXTINF') && lines[i].toLowerCase().includes(target.toLowerCase())) {
                    // Prendi i KODIPROP sopra
                    let j = i - 1;
                    let props = [];
                    while(j >= 0 && (lines[j].includes('KODIPROP') || lines[j].includes('EXT-X-KEY'))) {
                        props.unshift(lines[j]);
                        j--;
                    }
                    props.forEach(p => filtered += p + "\n");
                    // Canale
                    filtered += lines[i] + "\n";
                    // URL sotto
                    if (lines[i+1] && lines[i+1].startsWith('http')) {
                        filtered += lines[i+1] + "\n";
                    }
                    found = true;
                    break;
                }
            }
            // Se Matteo, manda SOLO il canale trovato (i fissi li togliamo lato client)
            return res.status(200).send(found ? filtered : "#EXTM3U\n#EXTINF:-1,Canale Non Trovato\nhttp://0.0.0.0");
        }

        res.status(200).send(fileContent);
    } catch (error) {
        res.status(500).json({ error: "Errore GitHub" });
    }
}
