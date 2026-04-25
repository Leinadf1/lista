import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
    // Intestazioni CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-heartbeat');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // --- NUOVA LOGICA PER LEGGERE IL BODY ---
    let body = {};
    if (req.body) {
        body = req.body;
    } else {
        // Forza la lettura se Vercel non ha parsato il JSON
        const buffers = [];
        for await (const chunk of req) { buffers.push(chunk); }
        const data = Buffer.concat(buffers).toString();
        try { body = JSON.parse(data); } catch (e) { body = {}; }
    }
    // ----------------------------------------

    const passwordRicevuta = body.password ? body.password.trim() : "";
    const authorizedPasswords = (process.env.MASTER_PASSWORD || "").split(',').map(p => p.trim());

    if (!passwordRicevuta || !authorizedPasswords.includes(passwordRicevuta)) {
        console.log("Accesso negato per:", passwordRicevuta);
        return res.status(401).json({ error: "Password errata" });
    }

    // ... Resto del codice (il try/catch che avevi già scritto va bene)
