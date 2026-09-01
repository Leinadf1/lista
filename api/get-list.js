import { createClient } from '@vercel/kv';

function buildM3U(channel) {
    let out = '';
    out += `#EXTINF:-1 tvg-logo="${channel.logo}" group-title="${channel.group_title || 'EUROSPORT'}",${channel.name}\n`;
    out += `#KODIPROP:inputstream.adaptive.license_key=${channel.drm}\n`;
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

// --- Helper per gestione scadenza Sky ---
function getExpiryTimestampFromUrl(url) {
    const match = url.match(/e~(\d+)/);
    return match ? parseInt(match[1]) * 1000 : null;
}

function isChannelExpired(channel) {
    const exp = getExpiryTimestampFromUrl(channel.url);
    if (!exp) return false;
    return Date.now() > exp;
}

function findBackupChannel(name, backupList) {
    const searchName = name.trim().toUpperCase();
    return backupList.find(ch => ch.name.trim().toUpperCase() === searchName);
}
// ---------------------------------------

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
        // 1. Scarica la lista base dal Gist Segreto
        const githubResponse = await fetch(`${process.env.GIST_RAW_URL}?t=${Date.now()}`);
        const fileContent = await githubResponse.text();

        // 2. Carica canali Sky primari (sky.m3u) dallo stesso Gist
        let skyChannels = [];
        try {
            const gistBase = process.env.GIST_RAW_URL.replace(/\/[^\/]+$/, '');
            const skyUrl = `${gistBase}/sky.m3u?t=${Date.now()}`;
            const skyResponse = await fetch(skyUrl);
            if (skyResponse.ok) {
                const skyContent = await skyResponse.text();
                skyChannels = parseM3U(skyContent);
            }
        } catch (e) {
            console.error("Errore nel caricamento sky.m3u:", e);
        }

        // 3. Carica canali Sky secondari (sky2.m3u) per backup
        let backupChannels = [];
        try {
            const gistBase = process.env.GIST_RAW_URL.replace(/\/[^\/]+$/, '');
            const backupUrl = `${gistBase}/sky2.m3u?t=${Date.now()}`;
            const backupResponse = await fetch(backupUrl);
            if (backupResponse.ok) {
                const backupContent = await backupResponse.text();
                backupChannels = parseM3U(backupContent);
            }
        } catch (e) { console.error("Errore nel caricamento sky2.m3u:", e); }

        // 4. DAZN principale (dazn.m3u) dallo stesso Gist
        let daznContent = "";
        try {
            const daznGistId = process.env.DAZN_GIST_ID;
            if (daznGistId) {
                const daznUrl = `https://gist.githubusercontent.com/Leinadf1/${daznGistId}/raw/dazn.m3u?t=${Date.now()}`;
                const daznResponse = await fetch(daznUrl);
                if (daznResponse.ok) {
                    let rawDazn = await daznResponse.text();
                    daznContent = rawDazn.replace(/^#EXTM3U\s*\n?/i, '').trim();
                } else {
                    console.error("[DAZN] Fetch dazn.m3u failed:", daznResponse.status);
                }
            }
        } catch (e) { console.error("[DAZN] Errore dazn.m3u:", e); }

        // 5. DAZN Events (dazn_events.m3u) dallo stesso Gist
        let daznEventsContent = "";
        try {
            const daznGistId = process.env.DAZN_GIST_ID;
            if (daznGistId) {
                const eventsUrl = `https://gist.githubusercontent.com/Leinadf1/${daznGistId}/raw/dazn_events.m3u?t=${Date.now()}`;
                const eventsResponse = await fetch(eventsUrl);
                if (eventsResponse.ok) {
                    let rawEvents = await eventsResponse.text();
                    daznEventsContent = rawEvents.replace(/^#EXTM3U\s*\n?/i, '').trim();
                } else {
                    console.error("[DAZN] Fetch dazn_events.m3u failed:", eventsResponse.status);
                }
            }
        } catch (e) { console.error("[DAZN] Errore dazn_events.m3u:", e); }

        // 6. DAZN Swiss (z_dazn_swiss.m3u) dallo stesso Gist di Sky
        let daznSwissContent = "";
        try {
            const gistBase = process.env.GIST_RAW_URL.replace(/\/[^\/]+$/, '');
            const swissUrl = `${gistBase}/z_dazn_swiss.m3u?t=${Date.now()}`;
            const swissResponse = await fetch(swissUrl);
            if (swissResponse.ok) {
                let rawSwiss = await swissResponse.text();
                daznSwissContent = rawSwiss.replace(/^#EXTM3U\s*\n?/i, '').trim();
            } else {
                console.error("[DAZN Swiss] Fetch failed:", swissResponse.status);
            }
        } catch (e) { console.error("[DAZN Swiss] Errore:", e); }

        // 7. Primevideo (z_primevideo.m3u) dallo stesso Gist
        let primevideoContent = "";
        try {
            const gistBase = process.env.GIST_RAW_URL.replace(/\/[^\/]+$/, '');
            const primevideoUrl = `${gistBase}/z_primevideo.m3u?t=${Date.now()}`;
            const primevideoResponse = await fetch(primevideoUrl);
            if (primevideoResponse.ok) {
                let rawPrimevideo = await primevideoResponse.text();
                primevideoContent = rawPrimevideo.replace(/^#EXTM3U\s*\n?/i, '').trim();
            } else {
                console.error("[Primevideo] Fetch failed:", primevideoResponse.status);
            }
        } catch (e) { console.error("[Primevideo] Errore:", e); }

        // 8. NeroZone (z_dazn_nerozone.m3u) dallo stesso Gist principale
        let nerozoneContent = "";
        try {
            const gistBase = process.env.GIST_RAW_URL.replace(/\/[^\/]+$/, '');
            const nerozoneUrl = `${gistBase}/z_dazn_nerozone.m3u?t=${Date.now()}`;
            const nerozoneResponse = await fetch(nerozoneUrl);
            if (nerozoneResponse.ok) {
                let rawNerozone = await nerozoneResponse.text();
                nerozoneContent = rawNerozone.replace(/^#EXTM3U\s*\n?/i, '').trim();
            } else {
                console.error("[NeroZone] Fetch failed:", nerozoneResponse.status);
            }
        } catch (e) { console.error("[NeroZone] Errore:", e); }

        // 9. Eurosport e RSI (z_eurosport-rsi.m3u) dallo stesso Gist principale
        let eurosportRsiContent = "";
        try {
            const gistBase = process.env.GIST_RAW_URL.replace(/\/[^\/]+$/, '');
            const eurosportRsiUrl = `${gistBase}/z_eurosport-rsi.m3u?t=${Date.now()}`;
            const eurosportRsiResponse = await fetch(eurosportRsiUrl);
            if (eurosportRsiResponse.ok) {
                let rawEurosportRsi = await eurosportRsiResponse.text();
                eurosportRsiContent = rawEurosportRsi.replace(/^#EXTM3U\s*\n?/i, '').trim();
            } else {
                console.error("[Eurosport/RSI] Fetch failed:", eurosportRsiResponse.status);
            }
        } catch (e) { console.error("[Eurosport/RSI] Errore:", e); }

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

        let newSkyChannels = skyChannels.filter(ch => !existingNames.has(ch.name.toUpperCase()));

        newSkyChannels = newSkyChannels.map(ch => {
            if (isChannelExpired(ch)) {
                const backup = findBackupChannel(ch.name, backupChannels);
                if (backup) {
                    return { ...ch, url: backup.url, drm: backup.drm };
                }
            }
            return ch;
        });

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

        let finalContent = fileContent;

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

        // Aggiunge NeroZone appena prima dei DAZN lineari (dazn.m3u)
        if (nerozoneContent) {
            finalContent = finalContent.trimEnd() + "\n" + nerozoneContent;
        }

        // Aggiunge entrambi i DAZN (prima dazn.m3u, poi dazn_events.m3u)
        if (daznContent) {
            finalContent = finalContent.trimEnd() + "\n" + daznContent;
        }
        if (daznEventsContent) {
            finalContent = finalContent.trimEnd() + "\n" + daznEventsContent;
        }

        // Aggiunge DAZN Swiss e Primevideo
        if (daznSwissContent) {
            finalContent = finalContent.trimEnd() + "\n" + daznSwissContent;
        }
        if (primevideoContent) {
            finalContent = finalContent.trimEnd() + "\n" + primevideoContent;
        }

        // Aggiunge Eurosport e RSI dal file esterno
        if (eurosportRsiContent) {
            finalContent = finalContent.trimEnd() + "\n" + eurosportRsiContent;
        }

        const encoded = Buffer.from(finalContent, 'utf-8').toString('base64');
        res.status(200).send(encoded);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Errore caricamento liste" });
    }
}
