import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
    // Intestazioni CORS per permettere l'accesso dal browser
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-heartbeat');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { password } = req.body;
    const psw = password ? password.trim() : "";

    // Legge le password autorizzate dalle Variabili d'Ambiente di Vercel
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
        
        // Controllo sessione (se non è un battito cardiaco)
        if (isOccupied && req.headers['x-heartbeat'] !== 'true') {
            return res.status(403).json({ error: "Sessione già attiva su un altro dispositivo" });
        }

        // Aggiorna o crea la sessione per 45 secondi
        await kv.set(sessionKey, "active", { ex: 45 });

        // Se è solo un heartbeat, rispondi OK e chiudi
        if (req.headers['x-heartbeat'] === 'true') {
            return res.status(200).json({ status: "alive" });
        }

        // SCARICA LA LISTA DA GITHUB (Nessun consumo di deployment Vercel)
        const response = await fetch("https://raw.githubusercontent.com/Leinadf1/lista/main/lista_privata.m3u");
        if (!response.ok) throw new Error("GitHub ha risposto con errore");
        const fileContent = await response.text();

        // --- LOGICA SPECIALE PER MATTEO (Solo F1 e Filtro Eurosport) ---
        if (psw === "Matteo") {
            const targetChannel = "Sky Sport F1"; 
            const lines = fileContent.split('\n').map(l => l.trim());
            let filteredM3U = "#EXTM3U\n";
            let found = false;

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toUpperCase().includes('#EXTINF') && 
                    lines[i].toUpperCase().includes(targetChannel.toUpperCase())) {
                    
                    // 1. RECUPERO DRM: Torna indietro per prendere TUTTE le righe KODIPROP
                    let j = i - 1;
                    let drmRows = [];
                    while (j >= 0 && (lines[j].startsWith('#KODIPROP') || lines[j].startsWith('#EXT-X-KEY'))) {
                        if (lines[j] !== "") drmRows.unshift(lines[j]);
                        j--;
                    }
                    drmRows.forEach(row => filteredM3U += row + "\n");

                    // 2. AGGIUNGI CANALE: La riga #EXTINF
                    filteredM3U += lines[i] + "\n";

                    // 3. RECUPERO URL: Cerca la prima riga http utile sotto il canale
                    let k = i + 1;
                    while (k < lines.length) {
                        if (lines[k].startsWith('http')) {
                            filteredM3U += lines[k] + "\n";
                            break;
                        }
                        if (lines[k].startsWith('#EXTINF')) break; // Sicurezza: evita di prendere l'URL del canale dopo
                        k++;
                    }
                    
                    found = true;
                    break; 
                }
            }

            if (found) {
                return res.status(200).send(filteredM3U);
            } else {
                return res.status(404).json({ error: "Canale non trovato nella lista" });
            }
        }

        // --- PER TUTTI GLI ALTRI (Accesso Totale) ---
        res.status(200).send(fileContent);

    } catch (error) {
        console.error("Errore API:", error);
        res.status(500).json({ error: "Errore interno del server" });
    }
}
