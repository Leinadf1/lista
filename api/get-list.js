import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { password } = req.body;
    const authorizedPasswords = (process.env.MASTER_PASSWORD || "").split(',').map(p => p.trim());

    // 1. Controllo Password (con pulizia spazi)
    if (!password || !authorizedPasswords.includes(password.trim())) {
        return res.status(401).json({ error: "Password errata" });
    }

    try {
        const kv = createClient({
            url: process.env.KV_REST_API_URL,
            token: process.env.KV_REST_API_TOKEN,
        });

        const sessionKey = `session_${password.trim()}`;
        
        // 2. Controllo Sessione Redis
        const isOccupied = await kv.get(sessionKey);
        if (isOccupied) {
            return res.status(403).json({ error: "Password già in uso!" });
        }

        // Blocca per 60 secondi
        await kv.set(sessionKey, "active", { ex: 60 });

        // 3. Scarica la lista dal tuo GitHub
        const response = await fetch("https://raw.githubusercontent.com/Leinadf1/lista/refs/heads/main/lista_privata.m3u");
        
        if (!response.ok) throw new Error("GitHub non risponde");

        const data = await response.text();
        res.status(200).send(data);

    } catch (error) {
        console.error("ERRORE:", error);
        res.status(500).json({ error: "Errore nel caricamento della lista" });
    }
}
