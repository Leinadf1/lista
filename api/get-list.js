export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    let body = {};
    try {
        const buffers = [];
        for await (const chunk of req) { buffers.push(chunk); }
        const data = Buffer.concat(buffers).toString();
        body = data ? JSON.parse(data) : {};
    } catch (e) { body = {}; }

    const psw = body.password ? body.password.trim() : "";
    const authorizedPasswords = (process.env.MASTER_PASSWORD || "").split(',').map(p => p.trim());

    if (!psw || !authorizedPasswords.includes(psw)) {
        return res.status(401).json({ error: "Password errata" });
    }

    try {
        // NOTA: Per i file privati l'URL raw richiede il token nell'header
        const githubUrl = "https://raw.githubusercontent.com/Leinadf1/lista/main/lista_privata.m3u";
        
        const githubResponse = await fetch(githubUrl, {
            headers: { 
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw',
                'User-Agent': 'Vercel-App'
            }
        });
        
        if (!githubResponse.ok) {
            console.error("Errore GitHub:", githubResponse.status);
            return res.status(500).json({ error: "GitHub ha negato l'accesso al file privato" });
        }
        
        const fileContent = await githubResponse.text();

        if (psw === "Matteo") {
            const targetChannel = "Sky Sport F1"; 
            const lines = fileContent.split('\n').map(l => l.trim());
            let filteredM3U = "#EXTM3U\n";
            let found = false;

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toUpperCase().includes('#EXTINF') && 
                    lines[i].toUpperCase().includes(targetChannel.toUpperCase())) {
                    
                    let j = i - 1;
                    while (j >= 0 && (lines[j].startsWith('#KODIPROP') || lines[j].startsWith('#EXT-X-KEY'))) {
                        if (lines[j] !== "") filteredM3U += lines[j] + "\n";
                        j--;
                    }
                    filteredM3U += lines[i] + "\n";
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
            return res.status(200).send(found ? filteredM3U : fileContent);
        }

        res.status(200).send(fileContent);

    } catch (error) {
        res.status(500).json({ error: "Errore durante il recupero della lista privata" });
    }
}
