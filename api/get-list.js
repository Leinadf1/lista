import { createClient } from '@vercel/kv';

// Canali Eurosport (gestiti centralmente)
const CANALI_FISSI = [
    { name: "EUROSPORT 4K", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020019/tim-ouah/CHN43FN/MONOGRAM_ESP4K_WHITE_V2-BjK0", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport4k)/manifest.mpd", drm: '{"9ceae06c6ad34aada83ba86c0b511452":"406862beb4af1ef8fe04ba15d9936360","fcd924bd2e45470fa2ae50ef05e357c0":"266db84d3572bc889185274a90ff31df","dea135e33341468f8a4e8da806d8a6e6":"fb7423db39e6fab75056f8c83f415847","31911db90ee3410f8b38e45659d01fb1":"ac316ab7dfd2b50faf6d44633e4fedd5","a16f2a39adbb4974b8910cec8a651a09":"c2d55e0111af955f47214af209a2c468"}' },
    { name: "EUROSPORT 1", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020000/tim-ouah/CHN43FN/MONOGRAM_ESP1_WHITE_V2-Lv2g", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport1)/manifest.mpd", drm: '{"46e559c2f9f645ce8d80c7fa20446bdb":"597d214d66342ee042bccffeb165e750"}' },
    { name: "EUROSPORT 2", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020001/tim-ouah/CHN43FN/MONOGRAM_ESP2_WHITE_V2-Zp7E", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport2)/manifest.mpd", drm: '{"e8372283a523444c84646c4172b1bc0f":"969a90e1a1a6424a68fe4b5d776368ec"}' },
    { name: "EUROSPORT 3", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020002/tim-ouah/CHN43FN/MONOGRAM_ESP360_WHITE_V4-yiID", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport3)/manifest.mpd", drm: '{"1e2398b0eeb04829b4711e14b4a91244":"11e26659ebfecf6a22ed56da340448cd"}' },
    { name: "EUROSPORT 4", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020003/tim-ouah/CHN43FN/MONOGRAM_ESP360_WHITE_V4-3YSY", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport4)/manifest.mpd", drm: '{"9dd7be79e44f4d08a91ec5d1553f17b8":"8a62369f81a4b6e5f2d4846f7bd5e7d1"}' },
    { name: "EUROSPORT 5", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020004/tim-ouah/CHN43FN/MONOGRAM_ESP360_WHITE_V4-sv5m", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport5)/manifest.mpd", drm: '{"b48e7e6d96da479da65e435ce65faeb1":"48c703879ce4deedb5a2124a30a13bc4"}' },
    { name: "EUROSPORT 6", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020005/tim-ouah/CHN43FN/MONOGRAM_ESP360_WHITE_V4-H53i", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport6)/manifest.mpd", drm: '{"ead1c567a3df48619799b2e78b18fdfa":"1de9d9af5651296aa67913979ad8c694"}' }
];

function buildM3U(channel) {
    let out = '';
    out += `#EXTINF:-1 tvg-logo="${channel.logo}" group-title="EUROSPORT",${channel.name}\n`;
    out += `#KODIPROP:inputstream.adaptive.license_key=${channel.drm}\n`;
    out += channel.url + '\n';
    return out;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-heartbeat');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
    });

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

    const sessionKey = `session_${psw}`;

    // Gestione heartbeat: rinnova la sessione e termina
    if (req.headers['x-heartbeat'] === 'true') {
        await kv.set(sessionKey, "active", { ex: 45 });
        return res.status(200).json({ status: "ok" });
    }

    // Per richieste normali: sovrascriviamo sempre la sessione (nuovo accesso)
    // In questo modo non blocchiamo più l'utente se la sessione precedente non è ancora scaduta
    await kv.set(sessionKey, "active", { ex: 45 });

    try {
        const githubResponse = await fetch(`https://raw.githubusercontent.com/Leinadf1/lista/main/lista_privata.m3u?t=${Date.now()}`, {
            headers: { 
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        const fileContent = await githubResponse.text();

        // Password che devono vedere solo Sky Sport F1 (da variabile d'ambiente)
        const f1OnlyPasswords = (process.env.F1_ONLY_PASSWORDS || "").split(',').map(p => p.trim().toLowerCase());
        const isF1Only = f1OnlyPasswords.includes(psw.toLowerCase());

        if (isF1Only) {
            const lines = fileContent.split('\n').map(l => l.trim());
            let filtered = "#EXTM3U\n";
            let targetIdx = -1;

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#EXTINF') && lines[i].toUpperCase().includes("SKY SPORT F1")) {
                    targetIdx = i;
                    break;
                }
            }

            if (targetIdx !== -1) {
                let j = targetIdx - 1;
                let buffer = [];
                while (j >= 0 && lines[j].startsWith('#') && !lines[j].startsWith('#EXTM3U') && !lines[j].startsWith('#EXTINF')) {
                    if (lines[j] !== "") buffer.unshift(lines[j]);
                    j--;
                }
                buffer.forEach(l => filtered += l + "\n");
                filtered += lines[targetIdx] + "\n";
                if (lines[targetIdx + 1]) filtered += lines[targetIdx + 1] + "\n";

                // Rimozione finale di eventuali righe Eurosport residue
                filtered = filtered.split('\n').filter(line => !line.toUpperCase().includes("EUROSPORT")).join('\n');
                return res.status(200).send(filtered);
            }

            return res.status(200).send("#EXTM3U\n");
        }

        // Per tutti gli altri: lista completa + Eurosport in coda
        let finalContent = fileContent;
        const eurosportM3U = CANALI_FISSI.map(c => buildM3U(c)).join('\n');
        finalContent = finalContent.trimEnd() + "\n" + eurosportM3U;

        res.status(200).send(finalContent);

    } catch (error) {
        res.status(500).json({ error: "Errore caricamento liste" });
    }
}
