import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send("Method not allowed");

    const { password } = req.body;
    const authorizedPasswords = (process.env.MASTER_PASSWORD || "").split(',');

    if (!password || !authorizedPasswords.includes(password)) {
        return res.status(401).json({ error: "Password errata" });
    }

    try {
        const kv = createClient({
            url: process.env.KV_REST_API_URL,
            token: process.env.KV_REST_API_TOKEN,
        });

        const sessionKey = `session_${password}`;
        const isOccupied = await kv.get(sessionKey);

        if (isOccupied) {
            return res.status(403).json({ error: "Già in uso!" });
        }

        // Blocca la sessione per 60 secondi (si resetta a ogni refresh)
        await kv.set(sessionKey, "active", { ex: 60 });

        const response = await fetch("https://nodrm.online/list/list2.m3u");
        const data = await response.text();
        res.status(200).send(data);

    } catch (error) {
        res.status(500).send("Errore Server");
    }
}
