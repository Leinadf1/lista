import { createClient } from '@vercel/kv';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { password } = req.body;
    const authorizedPasswords = (process.env.MASTER_PASSWORD || "").split(',').map(p => p.trim());

    if (!password || !authorizedPasswords.includes(password.trim())) {
        return res.status(401).json({ error: "Password errata" });
    }

    try {
        const kv = createClient({
            url: process.env.KV_REST_API_URL,
            token: process.env.KV_REST_API_TOKEN,
        });

        const sessionKey = `session_${password.trim()}`;
        const isOccupied = await kv.get(sessionKey);

        // Se la password è occupata E non è la mia stessa sessione (opzionale, per ora facciamo blocco totale)
        if (isOccupied && req.headers['x-heartbeat'] !== 'true') {
            return res.status(403).json({ error: "Password già in uso!" });
        }

        // AGGIORNA IL TIMER: la password scade tra 45 secondi
        await kv.set(sessionKey, "active", { ex: 45 });

        // Se è solo un battito cardiaco, non rispedire tutta la lista (risparmi banda)
        if (req.headers['x-heartbeat'] === 'true') {
            return res.status(200).json({ status: "still_alive" });
        }

        const filePath = path.join(process.cwd(), 'lista_privata.m3u');
        const data = fs.readFileSync(filePath, 'utf8');
        res.status(200).send(data);

    } catch (error) {
        res.status(500).json({ error: "Errore server" });
    }
}
