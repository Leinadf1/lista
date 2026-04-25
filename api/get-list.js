export default async function handler(req, res) {
    // Intestazioni CORS per permettere l'accesso dal browser
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Gestione preflight request
    if (req.method === 'OPTIONS') return res.status(200).end();

    // --- LOGICA PER LEGGERE IL BODY (Necessaria per Vercel Functions) ---
    let body = {};
    try {
        const buffers = [];
        for await (const chunk of req) {
            buffers.push(chunk);
        }
        const data = Buffer.concat(buffers).toString();
        body = data ? JSON.parse(data) : {};
    } catch (e) {
        body = {};
    }

    const psw = body.password ? body.password.trim() : "";
    const authorizedPasswords = (process.env.MASTER_PASSWORD || "").split(',').map(p => p.trim());

    // 1. Controllo Password
    if (!psw || !authorizedPasswords.includes(psw)) {
        console.log("Password errata o mancante:", psw);
        return res.status(401).json({ error: "Password errata" });
    }

    try {
        // 2. Scarica la lista originale da GitHub
        const githubResponse = await fetch("https://raw.githubusercontent.com/Leinadf1/lista/main/lista_privata.m3u");
        
        if (!githubResponse.ok) {
            throw new Error("Impossibile recuperare la lista da GitHub");
        }
        
        const fileContent = await githubResponse.text();

        // 3. LOGICA SPECIALE PER "MATTEO" (Filtro Sky Sport F1)
        if (psw === "Matteo") {
            const targetChannel = "Sky Sport F1"; 
            const lines = fileContent.split('\n').map(l => l.trim());
            let filteredM3U = "#EXTM3U\n";
            let found = false;

            for (let i = 0; i < lines.length; i++) {
                // Se troviamo il canale target
                if (lines[i].toUpperCase().includes('#EXTINF') && 
                    lines[i].toUpperCase().includes(targetChannel.toUpperCase())) {
                    
                    // Recupero righe DRM (KODIPROP) sopra il canale
                    let j = i - 1;
                    let drmRows = [];
                    while (j >= 0 && (lines[j].startsWith('#KODIPROP') || lines[j].startsWith('#EXT-X-KEY'))) {
                        if (lines[j] !== "") drmRows.unshift(lines[j]);
                        j--;
                    }
                    drmRows.forEach(row => filteredM3U += row + "\n");
                    
                    // Aggiungo la riga #EXTINF
                    filteredM3U += lines[i] + "\n";

                    // Recupero l'URL (la prima riga che inizia con http sotto l'INF)
                    let k = i + 1;
                    while (k < lines.length) {
                        if (lines[k].startsWith('http')) {
                            filteredM3U += lines[k] + "\n";
                            break;
                        }
                        if (lines[k].startsWith('#EXTINF')) break;
                        k++;
                    }
                    found = true;
                    break; 
                }
            }
            // Se Matteo viene trovato, mando la lista filtrata, altrimenti quella intera
            return res.status(200).send(found ? filteredM3U : fileContent);
        }

        // 4. Per tutti gli altri utenti: manda la lista completa
        res.status(200).send(fileContent);

    } catch (error) {
        console.error("Errore interno:", error);
        res.status(500).json({ error: "Errore nel caricamento della lista" });
    }
}
