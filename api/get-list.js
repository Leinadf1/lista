export default async function handler(req, res) {
    // Header per la sicurezza e CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Accettiamo solo richieste POST (che nascondono la password nel corpo)
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Metodo non consentito" });
    }

    const { password } = req.body;
    const MASTER_PASSWORD = process.env.MASTER_PASSWORD; // Presa dalle impostazioni sicure di Vercel

    if (!password || password !== MASTER_PASSWORD) {
        return res.status(401).json({ error: "Password errata" });
    }

    try {
        // Scarica la lista originale solo se la password è corretta
        const response = await fetch("https://nodrm.online/list/list2.m3u");
        const data = await response.text();
        res.status(200).send(data);
    } catch (error) {
        res.status(500).json({ error: "Errore nel caricamento lista" });
    }
}
