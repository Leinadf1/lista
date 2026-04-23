export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: "Metodo non consentito" });

    const { password } = req.body;

    // Recupera la stringa delle password e trasformala in una lista (Array)
    // Se la variabile è "pass1,pass2", diventerà ["pass1", "pass2"]
    const PASSWORDS_STRING = process.env.MASTER_PASSWORD || "";
    const authorizedPasswords = PASSWORDS_STRING.split(',');

    // Controlla se la password inserita è tra quelle autorizzate
    if (!password || !authorizedPasswords.includes(password)) {
        return res.status(401).json({ error: "Password errata" });
    }

    try {
        const response = await fetch("https://nodrm.online/list/list2.m3u");
        const data = await response.text();
        res.status(200).send(data);
    } catch (error) {
        res.status(500).json({ error: "Errore caricamento lista" });
    }
}
