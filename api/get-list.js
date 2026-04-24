import { createClient } from '@vercel/kv';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { password } = req.body;
    const psw = password ? password.trim() : "";

    // Legge le password autorizzate dalle Env Variables
    const authorizedPasswords = (process.env.MASTER_PASSWORD || "").split(',').map(p => p.trim());

    if (!authorizedPasswords.includes(psw)) {
        return res.status(401).json({ error: "Password errata" });
    }

    try {
        const kv = createClient({
            url: process.env.KV_REST_API_URL,
            token: process.env.KV_REST_API_TOKEN,
        });

        const sessionKey = `session_${psw}`;
        const isOccupied = await kv.get(sessionKey);
        
        if (isOccupied && req.headers['x-heartbeat'] !== 'true') {
            return res.status(403).json({ error: "Sessione già attiva" });
        }

        await kv.set(sessionKey, "active", { ex: 45 });
        if (req.headers['x-heartbeat'] === 'true') return res.status(200).json({ status: "alive" });

        const filePath = path.join(process.cwd(), 'lista_privata.m3u');
        const fileContent = fs.readFileSync(filePath, 'utf8');

        // --- LOGICA SPECIALE PER MATTEO ---
        if (psw === "Matteo") {
            const targetChannel = "Sky Sport F1"; // Scrivi qui il nome esatto come appare nel file
            const lines = fileContent.split('\n');
            let filteredM3U = "#EXTM3U\n";
            let found = false;

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toUpperCase().includes('#EXTINF') && 
                    lines[i].toUpperCase().includes(targetChannel.toUpperCase())) {
                    
                    // Prende DRM sopra
                    let j = i - 1;
                    while (j >= 0 && lines[j].startsWith('#KODIPROP')) {
                        filteredM3U += lines[j] + "\n";
                        j--;
                    }
                    // Aggiunge Canale
                    filteredM3U += lines[i] + "\n";
                    // Aggiunge URL sotto
                    if (lines[i+1] && lines[i+1].startsWith('http')) {
                        filteredM3U += lines[i+1] + "\n";
                    }
                    found = true;
                    break;
                }
            }
            return res.status(200).send(filteredM3U);
        }

        // --- PER TUTTI GLI ALTRI (uno, due, Francesco, ecc.) ---
        res.status(200).send(fileContent);

    } catch (error) {
        res.status(500).json({ error: "Errore interno" });
    }
}
