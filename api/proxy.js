export default async function handler(req, res) {
    const { url, ua } = req.query;
    if (!url) return res.status(400).send('URL Mancante');

    try {
        const targetUrl = decodeURIComponent(url);
        const response = await fetch(targetUrl, {
            headers: { 
                'User-Agent': ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Access-Control-Allow-Origin': '*'
            }
        });

        const data = await response.arrayBuffer();
        
        // Header obbligatori per sbloccare Shaka
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Content-Type', response.headers.get('Content-Type') || 'application/dash+xml');
        
        return res.status(200).send(Buffer.from(data));
    } catch (e) {
        return res.status(500).send("Errore Proxy: " + e.message);
    }
}
