import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
    const adminPsw = req.body?.adminPassword;
    if (adminPsw !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Non autorizzato" });
    }

    const kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
    });

    try {
        const keys = await kv.keys('session_*');
        const sessions = [];

        for (const key of keys) {
            const password = key.replace('session_', '');
            const rawData = await kv.get(key);
            let data = {};
            try {
                data = JSON.parse(rawData);
            } catch (e) {
                data = { ip: 'sconosciuto', userAgent: 'sconosciuto', startTime: 'sconosciuto' };
            }
            sessions.push({ password, ...data });
        }

        return res.status(200).json({ sessions, count: sessions.length });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
