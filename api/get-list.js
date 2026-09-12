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

// Rimuove da un contenuto M3U tutti i canali il cui nome è presente in namesSet
function removeChannelsByName(m3uContent, namesSet) {
    const lines = m3uContent.split('\n');
    const result = [];
    let skip = false;

    for (let line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#EXTINF:')) {
            const nameMatch = trimmed.match(/,(.*)/);
            const name = nameMatch ? nameMatch[1].trim().toUpperCase() : '';
            if (namesSet.has(name)) {
                skip = true;
                continue;
            }
        }

        if (skip) {
            if (trimmed.startsWith('http')) {
                skip = false;
                continue;
            } else {
                continue;
            }
        }

        result.push(line);
    }

    return result.join('\n');
}

// === NUOVE FUNZIONI PER SPLITTARE PER group-title ===

// Divide un contenuto M3U in blocchi (uno per canale)
function splitM3UBlocks(content) {
    if (!content) return [];
    const lines = content.split('\n');
    const blocks = [];
    let current = null;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('#EXTM3U')) continue;
        if (trimmed.startsWith('#EXTINF:')) {
            if (current) blocks.push(current);
            current = [trimmed];
        } else if (current) {
            current.push(trimmed);
            if (trimmed.startsWith('http')) {
                blocks.push(current);
                current = null;
            }
        }
    }
    if (current) blocks.push(current);
    return blocks;
}

function getBlockGroup(block) {
    if (!block || block.length === 0) return '';
    const m = block[0].match(/group-title="([^"]+)"/i);
    return m ? m[1] : '';
}

function blocksToContent(blocks) {
    return blocks.map(b => b.join('\n')).join('\n\n');
}

// Ritorna { matching, others }: matching = blocchi con group-title==groupName
function splitByGroup(content, groupName) {
    const blocks = splitM3UBlocks(content);
    const matching = blocks.filter(b => getBlockGroup(b) === groupName);
    const others = blocks.filter(b => getBlockGroup(b) !== groupName);
    return {
        matching: blocksToContent(matching),
        others: blocksToContent(others)
    };
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
        // 1. Scarica la lista base dal Gist Segreto (listaprivata.m3u)
        const githubResponse = await fetch(`${process.env.GIST_RAW_URL}?t=${Date.now()}`);
        const fileContent = await githubResponse.text();
        const baseChannels = parseM3U(fileContent);

        // 2. Sky primari (sky.m3u)
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

        // 3. Sky secondari (sky2.m3u)
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

        // 4. DAZN principale (dazn.m3u) da gist dedicato
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

        // 5. DAZN Events (dazn_events.m3u)
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

        // 6. DAZN Swiss (z_dazn_swiss.m3u)
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

        // 7. Bluesport (z_bluesport.m3u)
        let bluesportContent = "";
        try {
            const gistBase = process.env.GIST_RAW_URL.replace(/\/[^\/]+$/, '');
            const bluesportUrl = `${gistBase}/z_bluesport.m3u?t=${Date.now()}`;
            const bluesportResponse = await fetch(bluesportUrl);
            if (bluesportResponse.ok) {
                let rawBluesport = await bluesportResponse.text();
                bluesportContent = rawBluesport.replace(/^#EXTM3U\s*\n?/i, '').trim();
            } else {
                console.error("[Bluesport] Fetch failed:", bluesportResponse.status);
            }
        } catch (e) { console.error("[Bluesport] Errore:", e); }

        // 8. Primevideo (z_primevideo.m3u) - URL FISSO al gist corretto
        let primevideoContent = "";
        try {
            const primevideoUrl = `https://gist.githubusercontent.com/Leinadf1/e69ce054796b18713c284a383c693fc7/raw/z_primevideo.m3u?t=${Date.now()}`;
            const primevideoResponse = await fetch(primevideoUrl);
            if (primevideoResponse.ok) {
                let rawPrimevideo = await primevideoResponse.text();
                primevideoContent = rawPrimevideo.replace(/^#EXTM3U\s*\n?/i, '').trim();
            } else {
                console.error("[Primevideo] Fetch failed:", primevideoResponse.status);
            }
        } catch (e) { console.error("[Primevideo] Errore:", e); }

        // 9. NeroZone (z_dazn_nerozone.m3u)
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

        // 10. Eurosport/RSI (z_eurosport-rsi.m3u)
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

        // === SPLIT PRIMEVIDEO: separa "DAZN PRIMEVIDEO DE" dal resto ===
        const primevideoSplit = splitByGroup(primevideoContent, "DAZN PRIMEVIDEO DE");
        const primevideoDEContent = primevideoSplit.matching;
        const primevideoOtherContent = primevideoSplit.others;

        // === LOGICA PRINCIPALE SKY ===
        let finalSkyChannels = skyChannels.map(ch => {
            if (isChannelExpired(ch)) {
                const backupFromSky2 = findBackupChannel(ch.name, backupChannels);
                if (backupFromSky2) {
                    return { ...ch, url: backupFromSky2.url, drm: backupFromSky2.drm };
                }
                const backupFromBase = findBackupChannel(ch.name, baseChannels);
                if (backupFromBase) {
                    return { ...ch, url: backupFromBase.url, drm: backupFromBase.drm };
                }
            }
            return ch;
        });

        const skyNamesSet = new Set(finalSkyChannels.map(ch => ch.name.toUpperCase()));
        const baseContentFiltered = removeChannelsByName(fileContent, skyNamesSet);

        // === COSTRUZIONE CONTENUTO FINALE ===
        let finalContent = "#EXTM3U\n";

        if (finalSkyChannels.length > 0) {
            const skyBlock = finalSkyChannels.map(c => buildM3U(c)).join('\n');
            finalContent += skyBlock + "\n";
        }

        if (baseContentFiltered.trim().length > 0) {
            finalContent += baseContentFiltered + "\n";
        }

        // ORDINE FINALE:
        // nerozone -> dazn -> daznEvents -> DAZN PRIMEVIDEO DE -> daznSwiss -> bluesport -> primevideo (resto) -> eurosportRsi
        if (nerozoneContent) finalContent = finalContent.trimEnd() + "\n" + nerozoneContent;
        if (daznContent) finalContent = finalContent.trimEnd() + "\n" + daznContent;
        if (daznEventsContent) finalContent = finalContent.trimEnd() + "\n" + daznEventsContent;
        if (primevideoDEContent) finalContent = finalContent.trimEnd() + "\n" + primevideoDEContent;
        if (daznSwissContent) finalContent = finalContent.trimEnd() + "\n" + daznSwissContent;
        if (bluesportContent) finalContent = finalContent.trimEnd() + "\n" + bluesportContent;
        if (primevideoOtherContent) finalContent = finalContent.trimEnd() + "\n" + primevideoOtherContent;
        if (eurosportRsiContent) finalContent = finalContent.trimEnd() + "\n" + eurosportRsiContent;

        // Gestione F1-only
        const f1OnlyPasswords = (process.env.F1_ONLY_PASSWORD || "").split(',').map(p => p.trim().toLowerCase());
        const isF1Only = f1OnlyPasswords.includes(psw.toLowerCase());

        if (isF1Only) {
            const f1FromSky = finalSkyChannels.find(c => c.name.toUpperCase().includes("SKY SPORT F1"));
            if (f1FromSky) {
                let filtered = "#EXTM3U\n";
                filtered += buildM3U(f1FromSky);
                const encoded = Buffer.from(filtered, 'utf-8').toString('base64');
                return res.status(200).send(encoded);
            }
            const lines = baseContentFiltered.split('\n');
            let found = false;
            let filtered = "#EXTM3U\n";
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#EXTINF') && lines[i].toUpperCase().includes("SKY SPORT F1")) {
                    filtered += lines[i] + "\n";
                    if (lines[i+1]) filtered += lines[i+1] + "\n";
                    found = true;
                    break;
                }
            }
            if (!found) {
                const f1FromBackup = backupChannels.find(c => c.name.toUpperCase().includes("SKY SPORT F1"));
                if (f1FromBackup) filtered += buildM3U(f1FromBackup);
            }
            const encoded = Buffer.from(filtered, 'utf-8').toString('base64');
            return res.status(200).send(encoded);
        }

        const encoded = Buffer.from(finalContent, 'utf-8').toString('base64');
        res.status(200).send(encoded);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Errore caricamento liste" });
    }
}
