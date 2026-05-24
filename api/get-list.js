import { createClient } from '@vercel/kv';

const CANALI_FISSI = [
    { name: "EUROSPORT 4K", group_title: "EUROSPORT", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020019/tim-ouah/CHN43FN/MONOGRAM_ESP4K_WHITE_V2-BjK0", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport4k)/manifest.mpd", drm: '{"c469777656ef4360b2cdcc69a3ec947d":"4af468f4cdf193d9b22979122f978b5b","13a0671aef20465aa47a01cccafd0b3e":"6f97916e827e7ba034646077f6deca1b","3816949b06254469b01b78c548662b7b":"76c0962889fb659436657763afd1ad83","b4fd4e8a4d9c43abb582f60678999aee":"2d9db6f4a7b06660d6968de97dd5a4ea","29cc35584af44585bd4e8b5cfcd48ca7":"28dd59d20e00f48f6c39baf04fe7b3a6"}' },
    { name: "EUROSPORT 1", group_title: "EUROSPORT", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020000/tim-ouah/CHN43FN/MONOGRAM_ESP1_WHITE_V2-Lv2g", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport1)/manifest.mpd", drm: '{"163303a883824977b05d7357da82f487":"40d5e1198d23aaad9079bdc881f2ca5a"}' },
    { name: "EUROSPORT 2", group_title: "EUROSPORT", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020001/tim-ouah/CHN43FN/MONOGRAM_ESP2_WHITE_V2-Zp7E", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport2)/manifest.mpd", drm: '{"edb40da832c44957b49a30351ebccee3":"37979044fd480ae10a441c6c8547b38a"}' },
    { name: "EUROSPORT 3", group_title: "EUROSPORT", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020002/tim-ouah/CHN43FN/MONOGRAM_ESP360_WHITE_V4-yiID", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport3)/manifest.mpd", drm: '{"1f0db319a1e3492ca02d1dbcfef176ac":"ef3bc3b15caf33064d1e8f9d0b46b4b1"}' },
    { name: "EUROSPORT 4", group_title: "EUROSPORT", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020003/tim-ouah/CHN43FN/MONOGRAM_ESP360_WHITE_V4-3YSY", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport4)/manifest.mpd", drm: '{"eade7aa2314a407da820d6c81167cb90":"c6b701dae6c8bdead2cbe6ecde0769bb"}' },
    { name: "EUROSPORT 5", group_title: "EUROSPORT", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020004/tim-ouah/CHN43FN/MONOGRAM_ESP360_WHITE_V4-sv5m", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport5)/manifest.mpd", drm: '{"da9e85e0a6f4459f9344cdb544c22a4e":"6af3a1f0911da1e5f6a196872ab5fbfe"}' },
    { name: "EUROSPORT 6", group_title: "EUROSPORT", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020005/tim-ouah/CHN43FN/MONOGRAM_ESP360_WHITE_V4-H53i", url: "https://timlivetu0.cb.ticdn.it/Content/DASH/Live/channel(eurosport6)/manifest.mpd", drm: '{"7395986fd46d4d0ab472471c224621e3":"adf1f40a8db52e319a18ca00a4dbe0aa"}' },
    { name: "EUROSPORT 1", group_title: "EUROSPORT ENG/ITA", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020000/tim-ouah/CHN43FN/MONOGRAM_ESP1_WHITE_V2-Lv2g", url: "https://wp10-s-anp33343334-live-ch-prod.prod.cdn.dmdsdp.com/live/disk1/SV09320/stb-dash-fhd-avc/SV09320.mpd", drm: '{"5697867136904350861b81589b29be76":"35d43b4d23abcfe16b451d7be92ad990","c150a0dc15b73792b9ee5ada5561f793":"d5173922c2c7a8b98510650c3cdb54cd"}' },
    { name: "EUROSPORT 2", group_title: "EUROSPORT ENG/ITA", logo: "https://thumb.prod.front.tim.cptech.pro/http/unsafe/120x90/img-cdn.prod.catalog.tim.cptech.pro/p1/channel/90020001/tim-ouah/CHN43FN/MONOGRAM_ESP2_WHITE_V2-Zp7E", url: "https://wp2-s-anp31323132-live-ch-prod.prod.cdn.dmdsdp.com/live/disk1/SV09322/stb-dash-fhd-avc/SV09322.mpd", drm: '{"a1387afabdd04dfc939593cb1724e8f7":"38ecd1f7b8f248633490f6717d86e17d","72982d60457c390dbce4e8ba6aa9ff33":"5574602ec1bfeda66f459ce603dc17fd"}' },
    { name: "RSI LA 1", group_title: "RSI", logo: "https://static.wikia.nocookie.net/logopedia/images/b/be/RSI_La_1_2012.svg/revision/latest?cb=20200517122539", url: "https://wp3-s-anp31323132-live-ch-prod.prod.cdn.dmdsdp.com/live/disk1/SV09042/stb-dash-fhd-avc/SV09042.mpd", drm: '{"09af5f6eb89041ca8f5d164165142e86":"1989cc9c9ce5b2b52cb93edaaefe8420","d268d810d8a73bd8b7d54a6a087581d2":"1aaf297543168c625e05aa9e27344471"}' },
    { name: "RSI LA 2", group_title: "RSI", logo: "https://static.wikia.nocookie.net/logopedia/images/f/f4/RSI_La_2_2012.svg/revision/latest?cb=20200517122649", url: "https://wp3-s-anp31323132-live-ch-prod.prod.cdn.dmdsdp.com/live/disk1/SV09042/stb-dash-fhd-avc/SV09042.mpd", drm: '{"117d07fd98cc46ef8e09936d0d37c506":"b9528cb3f23eaad789f0f33bf6b01868","166b2f0d56fb32d9b46d4b1ca1b5bf16":"d78ee5c91eb3b9b6d37414a4f789bc9b"}' },  
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

        const daznFissiM3U = DAZN_FISSI.map(c => buildDaznM3U(c)).join('\n');
        finalContent = finalContent.trimEnd() + "\n" + daznFissiM3U;
        
        const eurosportM3U = CANALI_FISSI.map(c => buildM3U(c)).join('\n');
        finalContent = finalContent.trimEnd() + "\n" + eurosportM3U;

        // Codifica Base64
        const encoded = Buffer.from(finalContent, 'utf-8').toString('base64');
        res.status(200).send(encoded);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Errore caricamento liste" });
    }
}
