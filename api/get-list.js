import { createClient } from '@vercel/kv';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
    // Header per permettere al browser di leggere i dati
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { password } = req.body;
    const authorizedPasswords = (process.env.MASTER_PASSWORD || "").split(',').map(p => p.trim());

    // 1. Controllo Password
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

        // Blocca la password per 60 secondi
        await kv.set(sessionKey, "active", { ex: 60 });

        // 3. Lettura del file locale (Metodo più sicuro)
        // Questo cerca il file "lista_privata.m3u" nella cartella principale del tuo progetto
        const filePath = path.join(process.cwd(), 'lista_privata.m3u');
        
        if (!fs.existsSync(filePath)) {
            console.error("ERRORE: Il file lista_privata.m3u non esiste nella root!");
            return res.status(404).json({ error: "File lista non trovato sul server" });
        }

        const data = fs.readFileSync(filePath, 'utf8');
        
        // Invia la lista al browser
        res.status(200).send(data);

    } catch (error) {
        console.error("ERRORE CRITICO:", error);
        res.status(500).json({ error: "Errore interno del server" });
    }
}
