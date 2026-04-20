export default async function handler(req, res) {
    const { url, ua } = req.query;
    try {
        const r = await fetch(decodeURIComponent(url), {
            headers: { 'User-Agent': ua || 'Mozilla/5.0' }
        });
        const buffer = await r.arrayBuffer();
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', r.headers.get('Content-Type') || 'application/dash+xml');
        return res.status(200).send(Buffer.from(buffer));
    } catch (e) {
        return res.status(500).send(e.message);
    }
}
