import { createClient } from '@vercel/kv';

const CANALI_FISSI = [
    { name: "EUROSPORT 4K", group_title: "EUROSPORT", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020019/tim-ouah/CHN43FN/MONOGRAM_ESP4K_WHITE_V2-BjK0", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport4k)/manifest.mpd", drm: '{"9ceae06c6ad34aada83ba86c0b511452":"406862beb4af1ef8fe04ba15d9936360","fcd924bd2e45470fa2ae50ef05e357c0":"266db84d3572bc889185274a90ff31df","dea135e33341468f8a4e8da806d8a6e6":"fb7423db39e6fab75056f8c83f415847","31911db90ee3410f8b38e45659d01fb1":"ac316ab7dfd2b50faf6d44633e4fedd5","a16f2a39adbb4974b8910cec8a651a09":"c2d55e0111af955f47214af209a2c468"}' },
    { name: "EUROSPORT 1", group_title: "EUROSPORT", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020000/tim-ouah/CHN43FN/MONOGRAM_ESP1_WHITE_V2-Lv2g", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport1)/manifest.mpd", drm: '{"610bcda111c74c97b0792b059630a10b":"b9817853538459b371f3fb56a267d55c"}' },
    { name: "EUROSPORT 2", group_title: "EUROSPORT", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020001/tim-ouah/CHN43FN/MONOGRAM_ESP2_WHITE_V2-Zp7E", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport2)/manifest.mpd", drm: '{"700b3619ccfb4c0cbd2bb26832e643cf":"b2c7c4b6f3375b8e07c42f95668dadeb"}' },
    { name: "EUROSPORT 3", group_title: "EUROSPORT", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020002/tim-ouah/CHN43FN/MONOGRAM_ESP360_WHITE_V4-yiID", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport3)/manifest.mpd", drm: '{"5fd7709359db4103ae799d5f8d79ae0b":"6d39ec4186bed97705274a6c78c69d94"}' },
    { name: "EUROSPORT 4", group_title: "EUROSPORT", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020003/tim-ouah/CHN43FN/MONOGRAM_ESP360_WHITE_V4-3YSY", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport4)/manifest.mpd", drm: '{"026e140de784409b9c437fcc0212977c":"6f5ad01fa42deede99ae7c6ccf5215d7"}' },
    { name: "EUROSPORT 5", group_title: "EUROSPORT", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020004/tim-ouah/CHN43FN/MONOGRAM_ESP360_WHITE_V4-sv5m", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport5)/manifest.mpd", drm: '{"6844bc96d46e4677a322cd4838705489":"6b483aa12ba85bad2e84efb4bc6a9893"}' },
    { name: "EUROSPORT 6", group_title: "EUROSPORT", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020005/tim-ouah/CHN43FN/MONOGRAM_ESP360_WHITE_V4-H53i", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport6)/manifest.mpd", drm: '{"69982165690d4fef90d3f4d4e245fc27":"49711e568736d9ae3ea7993571c9bcce"}' }
];

const DAZN_FISSI = [
    {
        name: "DAZN 1 WIFI",
        logo: "https://static.wikia.nocookie.net/logopedia/images/1/18/DAZN_1_2024.svg",
        group_title: "DAZN LINEARI",
        stream_headers: "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        license_type: "clearkey",
        license_key: "6164a0abaa7c53c6875fa1e7fe0bb463:271510d3e1259571dcc568a232e397eb",
        url: "https://dct-fs-live-dazn-cdn.dazn.com/@eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzkwMjg3MDMsImtpZCI6IjIwMjIxMTIzIiwicGF0aF9kIjoyLCJwYXRoIjoiOGViOTUwYjA5YmIxZjMzOTBlZDQ4ODgzN2VhZjk5ODY3MDc2OTRkMSIsInNzaWQiOiI2MjFkY2E0ZTE0M2UiLCJwcm90byI6ImRhc2giLCJnZW8iOiJpdCIsImFzbiI6WyIyMTAyNzgiXSwidWEiOiIxNGNkZmY1NTE5YjZjOTQwODUwMmE0ZDI2MmNkNzQ1NjUzODYyMzM4IiwiaWF0IjoxNzc4OTQyMzAzfQ.NjdSMX6Kv5XV2dik4qvJqYNZyjwxFS2AXyRU5_JkMlI/dash/dazn-linear-206/stream.mpd?p=web"
    }

];

function buildM3U(channel) {
    let out = '';
    out += `#EXTINF:-1 tvg-logo="${channel.logo}" group-title="${channel.group_title || 'EUROSPORT'}",${channel.name}\n`;
    out += `#KODIPROP:inputstream.adaptive.license_key=${channel.drm}\n`;
    out += channel.url + '\n';
    return out;
}

function buildDaznM3U(channel) {
    let out = '';
    out += `#EXTINF:-1 group-title="${channel.group_title}" tvg-logo="${channel.logo}" tvg-id="${channel.name.replace(/\s/g, '')}",${channel.name}\n`;
    out += `#KODIPROP:inputstream.adaptive.license_type=${channel.license_type}\n`;
    out += `#KODIPROP:inputstream.adaptive.license_key=${channel.license_key}\n`;
    out += channel.url + '\n';
    return out;
}

function parseM3U(content) {
    const lines = content.split('\n').map(l => l.trim());
    const channels = [];
    let current = { name: "", logo: "", group_title: "SKY", drm: "{}", url: "" };

    for (let line of lines) {
        if (line.startsWith('#KODIPROP:inputstream.adaptive.license_key=')) {
            const val = line.split('=')[1];
            if (val) {
                try {
                    const parsed = JSON.parse(val);
                    current.drm = JSON.stringify(parsed);
                } catch (e) {
                    const parts = val.split(':');
                    if (parts.length === 2) {
                        const key = parts[0].trim();
                        const value = parts[1].trim();
                        current.drm = JSON.stringify({ [key]: value });
                    } else {
                        current.drm = val;
                    }
                }
            }
        } else if (line.startsWith('#EXTINF:')) {
            const logo = line.match(/tvg-logo="([^"]+)"/i);
            const group = line.match(/group-title="([^"]+)"/i);
            const name = line.match(/,(.*)/);
            if (logo) current.logo = logo[1];
            if (group) current.group_title = group[1];
            if (name) current.name = name[1].trim();
        } else if (line.startsWith('http')) {
            current.url = line;
            if (current.name && current.url) {
                channels.push({ ...current });
            }
            current = { name: "", logo: "", group_title: "SKY", drm: "{}", url: "" };
        }
    }
    return channels;
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

    if (req.headers['x-heartbeat'] === 'true') {
        await kv.set(sessionKey, "active", { ex: 25 });
        return res.status(200).json({ status: "ok" });
    }

    const isOccupied = await kv.get(sessionKey);
    if (isOccupied) {
        return res.status(403).json({ error: "Accesso negato: sessione già attiva" });
    }

    await kv.set(sessionKey, "active", { ex: 25 });

    try {
        const githubResponse = await fetch(`https://raw.githubusercontent.com/Leinadf1/lista/main/lista_privata.m3u?t=${Date.now()}`, {
            headers: { 
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        const fileContent = await githubResponse.text();

        let skyChannels = [];
        try {
            const skyResponse = await fetch(`https://raw.githubusercontent.com/Leinadf1/lista/main/sky.m3u?t=${Date.now()}`, {
                headers: { 
                    'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3.raw'
                }
            });
            if (skyResponse.ok) {
                const skyContent = await skyResponse.text();
                skyChannels = parseM3U(skyContent);
            }
        } catch (e) {
            console.error("Errore nel caricamento sky.m3u:", e);
        }

        const existingNames = new Set();
        const baseLines = fileContent.split('\n');
        for (let i = 0; i < baseLines.length; i++) {
            if (baseLines[i].startsWith('#EXTINF:')) {
                const nameMatch = baseLines[i].match(/,(.*)/);
                if (nameMatch) {
                    existingNames.add(nameMatch[1].trim().toUpperCase());
                }
            }
        }

        const newSkyChannels = skyChannels.filter(ch => !existingNames.has(ch.name.toUpperCase()));

        const f1OnlyPasswords = (process.env.F1_ONLY_PASSWORD || "").split(',').map(p => p.trim().toLowerCase());
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

                filtered = filtered.split('\n').filter(line => !line.toUpperCase().includes("EUROSPORT")).join('\n');
                // Codifica Base64 anche per la risposta F1-only
                const encoded = Buffer.from(filtered, 'utf-8').toString('base64');
                return res.status(200).send(encoded);
            }

            const f1FromSky = skyChannels.find(c => c.name.toUpperCase().includes("SKY SPORT F1"));
            if (f1FromSky) {
                filtered += buildM3U(f1FromSky);
                const encoded = Buffer.from(filtered, 'utf-8').toString('base64');
                return res.status(200).send(encoded);
            }

            const encoded = Buffer.from(filtered, 'utf-8').toString('base64');
            return res.status(200).send(encoded);
        }

        let daznLineare = "";
        try {
            const daznResponse = await fetch(`https://nodrm.online/list/dz1.txt?t=${Date.now()}`);
            if (daznResponse.ok) {
                daznLineare = await daznResponse.text();
                daznLineare = daznLineare.replace("#EXTM3U", "").trim();
            }
        } catch (e) { console.error("Errore DAZN fetch"); }

        let lines = fileContent.split('\n');
        let lastChampionsIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toUpperCase().includes('GROUP-TITLE="CHAMPIONS LEAGUE"')) {
                for (let k = i + 1; k < lines.length; k++) {
                    if (lines[k].trim().startsWith('http')) {
                        lastChampionsIdx = k;
                        break;
                    }
                }
            }
        }

        let finalContent = "";
        if (lastChampionsIdx !== -1) {
            lines.splice(lastChampionsIdx + 1, 0, "\n" + daznLineare + "\n");
            finalContent = lines.join('\n');
        } else {
            finalContent = fileContent + "\n" + daznLineare;
        }

        if (newSkyChannels.length > 0) {
            const headerIdx = finalContent.split('\n').findIndex(l => l.trim() === '#EXTM3U');
            const skyBlock = newSkyChannels.map(c => buildM3U(c)).join('\n');
            if (headerIdx !== -1) {
                const contentLines = finalContent.split('\n');
                contentLines.splice(headerIdx + 1, 0, skyBlock);
                finalContent = contentLines.join('\n');
            } else {
                finalContent = "#EXTM3U\n" + skyBlock + '\n' + finalContent;
            }
        }

        const eurosportM3U = CANALI_FISSI.map(c => buildM3U(c)).join('\n');
        finalContent = finalContent.trimEnd() + "\n" + eurosportM3U;

        const daznFissiM3U = DAZN_FISSI.map(c => buildDaznM3U(c)).join('\n');
        finalContent = finalContent.trimEnd() + "\n" + daznFissiM3U;

        // Codifica Base64
        const encoded = Buffer.from(finalContent, 'utf-8').toString('base64');
        res.status(200).send(encoded);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Errore caricamento liste" });
    }
}
