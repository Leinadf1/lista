export default async function handler(req, res) {
    const { url, ua } = req.query;
    if (!url) return res.status(400).send('URL mancante');

    try {
        const decodedUrl = decodeURIComponent(url);
        const response = await fetch(decodedUrl, {
            headers: { 
                'User-Agent': ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Origin': new URL(decodedUrl).origin,
                'Referer': new URL(decodedUrl).origin + '/'
            }
        });

        const data = await response.arrayBuffer();
        
        // Header per bypassare i blocchi del browser
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Content-Type', response.headers.get('Content-Type') || 'application/dash+xml');
        
        res.status(200).send(Buffer.from(data));
    } catch (e) {
        res.status(500).send("Errore Proxy: " + e.message);
    }
}
