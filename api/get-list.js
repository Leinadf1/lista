export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { password } = req.body;
    const passwordRicevuta = password ? password.trim() : "";
    const rawPasswords = process.env.MASTER_PASSWORD || "";
    const listaPassword = rawPasswords.split(',').map(p => p.trim());

    if (!passwordRicevuta || !listaPassword.includes(passwordRicevuta)) {
        return res.status(401).json({ error: "Password errata" });
    }

    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    const dispositivoId = req.headers['x-forwarded-for'] || "anon";

    try {
        // Controllo sessione su Upstash
        const checkRes = await fetch(`${redisUrl}/get/${passwordRicevuta}`, {
            headers: { Authorization: `Bearer ${redisToken}` }
        });
        const checkData = await checkRes.json();

        if (checkData.result && checkData.result !== dispositivoId) {
            return res.status(403).json({ error: "Password in uso altrove" });
        }

        // Set blocco con scadenza 120 secondi (2 minuti)
        await fetch(`${redisUrl}/set/${passwordRicevuta}/${dispositivoId}/EX/120`, {
            headers: { Authorization: `Bearer ${redisToken}` }
        });

        // Recupero lista da GitHub
        const response = await fetch('https://api.github.com/repos/Leinadf1/lista/contents/lista_privata.m3u', {
            headers: {
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        
        let fileContent = await response.text();

        // Filtro speciale per Matteo
        if (passwordRicevuta === 'Matteo') {
            const lines = fileContent.split('\n');
            let filteredM3U = "#EXTM3U\n";
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toUpperCase().includes("SKY SPORT F1")) {
                    filteredM3U += lines[i] + "\n" + (lines[i+1] || "") + "\n";
                }
            }
            fileContent = filteredM3U;
        }

        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(fileContent);

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
