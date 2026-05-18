import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
    // Protezione con password admin
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
        const activePasswords = keys.map(k => k.replace('session_', ''));
        return res.status(200).json({
            activePasswords,
            count: activePasswords.length
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
