import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { password } = req.body;
    const authorizedPasswords = (process.env.MASTER_PASSWORD || "").split(',');

    if (!password || !authorizedPasswords.includes(password)) {
        return res.status(401).json({ error: "Password errata" });
    }

    try {
        // Creazione client con le variabili automatiche di Vercel
        const kv = createClient({
            url: process.env.KV_REST_API_URL,
            token: process.env.KV_REST_API_TOKEN,
        });

        const sessionKey = `session_${password}`;

        // Controlla se esiste già
        const isOccupied = await kv.get(sessionKey);
        if (isOccupied) {
            return res.status(403).json({ error: "Già in uso" });
        }

        // SCRIVE NEL DATABASE (60 secondi)
        await kv.set(sessionKey, "active", { ex: 60 });

        const response = await fetch("https://raw.githubusercontent.com/Leinadf1/lista/refs/heads/main/lista_privata.m3u");
        const data = await response.text();
        res.status(200).send(data);

    } catch (error) {
        console.error("ERRORE KV:", error);
        res.status(500).json({ error: "Errore database", details: error.message });
    }
}
