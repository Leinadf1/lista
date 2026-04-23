import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { password } = JSON.parse(req.body);

    try {
        const kv = createClient({
            url: process.env.KV_REST_API_URL,
            token: process.env.KV_REST_API_TOKEN,
        });

        const sessionKey = `session_${password.trim()}`;
        await kv.del(sessionKey); // CANCELLA IMMEDIATAMENTE

        res.status(200).json({ status: "logged_out" });
    } catch (error) {
        res.status(500).json({ error: "Errore logout" });
    }
}
