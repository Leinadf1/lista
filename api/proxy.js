export default async function handler(req, res) {
    const { url, ua } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'Missing URL' });
    }

    try {
        const response = await fetch(decodeURIComponent(url), {
            headers: {
                'User-Agent': ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Access-Control-Allow-Origin': '*'
            }
        });

        const contentType = response.headers.get('content-type');
        const data = await response.arrayBuffer();

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Content-Type', contentType);
        
        return res.send(Buffer.from(data));
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
