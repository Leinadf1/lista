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

function splitByGroup(content, groupName) {
    const blocks = splitM3UBlocks(content);
    const matching = blocks.filter(b => getBlockGroup(b) === groupName);
    const others = blocks.filter(b => getBlockGroup(b) !== groupName);
    return {
        matching: blocksToContent(matching),
        others: blocksToContent(others)
    };
}

function withCacheBust(url) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}t=${Date.now()}&r=${Math.random().toString(36).slice(2)}`;
}

// === OVERRIDE LOGO "DAZN 1" (matcha "DAZN 1", "DAZN 1 WARP", "DAZN 1 (...)", ecc.) ===
// NB: NON applicato a NeroZone (lo gestisce il suo script dedicato).
const DAZN1_LOGO_FIXED = "https://nowtv-seven.vercel.app/logos/dazn1.png?v=2";

function applyDazn1LogoOverride(content) {
    if (!content) return content;
    return content.replace(
        /(#EXTINF:[^\n]*?tvg-name="DAZN\s+1(?:\s[^"]*)?"[^\n]*?)tvg-logo="[^"]*"/gim,
        `$1tvg-logo="${DAZN1_LOGO_FIXED}"`
    );
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-heartbeat, x-reload');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

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

    const isReload = req.headers['x-reload'] === 'true';

    if (!isReload) {
        const isOccupied = await kv.get(sessionKey);
        if (isOccupied) {
            return res.status(403).json({ error: "Accesso negato: sessione già attiva" });
        }
    }

    await kv.set(sessionKey, "active", { ex: 25 });

    try {
        const gistBase = process.env.GIST_RAW_URL.replace(/\/[^\/]+$/, '');

        // 1. Lista base
        const githubResponse = await fetch(withCacheBust(process.env.GIST_RAW_URL));
        const fileContent = await githubResponse.text();
        const baseChannels = parseM3U(fileContent);

        // 2. Sky primari
        let skyChannels = [];
        try {
            const skyUrl = withCacheBust(`${gistBase}/sky.m3u`);
            const skyResponse = await fetch(skyUrl);
            if (skyResponse.ok) {
                const skyContent = await skyResponse.text();
                skyChannels = parseM3U(skyContent);
            }
        } catch (e) {
            console.error("Errore nel caricamento sky.m3u:", e);
        }

        // 3. Sky secondari
        let backupChannels = [];
        try {
            const backupUrl = withCacheBust(`${gistBase}/sky2.m3u`);
            const backupResponse = await fetch(backupUrl);
            if (backupResponse.ok) {
                const backupContent = await backupResponse.text();
                backupChannels = parseM3U(backupContent);
            }
        } catch (e) { console.error("Errore nel caricamento sky2.m3u:", e); }

        // 4. DAZN lineari
        let daznContent = "";
        try {
            const daznGistId = process.env.DAZN_GIST_ID;
            if (daznGistId) {
                const daznUrl = withCacheBust(`https://gist.githubusercontent.com/Leinadf1/${daznGistId}/raw/dazn.m3u`);
                const daznResponse = await fetch(daznUrl);
                if (daznResponse.ok) {
                    let rawDazn = await daznResponse.text();
                    daznContent = rawDazn.replace(/^#EXTM3U\s*\n?/i, '').trim();
                } else {
                    console.error("[DAZN] Fetch dazn.m3u failed:", daznResponse.status);
                }
            }
        } catch (e) { console.error("[DAZN] Errore dazn.m3u:", e); }

        // 5. DAZN Events
        let daznEventsContent = "";
        try {
            const daznGistId = process.env.DAZN_GIST_ID;
            if (daznGistId) {
                const eventsUrl = withCacheBust(`https://gist.githubusercontent.com/Leinadf1/${daznGistId}/raw/dazn_events.m3u`);
                const eventsResponse = await fetch(eventsUrl);
                if (eventsResponse.ok) {
                    let rawEvents = await eventsResponse.text();
                    daznEventsContent = rawEvents.replace(/^#EXTM3U\s*\n?/i, '').trim();
                } else {
                    console.error("[DAZN] Fetch dazn_events.m3u failed:", eventsResponse.status);
                }
            }
        } catch (e) { console.error("[DAZN] Errore dazn_events.m3u:", e); }

        // 6. DAZN Swiss + Como TV
        let daznSwissContent = "";
        let comotvContent = "";
        try {
            const swissUrl = withCacheBust(`${gistBase}/z_dazn_swiss.m3u`);
            const swissResponse = await fetch(swissUrl);
            if (swissResponse.ok) {
                let rawSwiss = await swissResponse.text();
                rawSwiss = rawSwiss.replace(/^#EXTM3U\s*\n?/i, '').trim();
                const swissSplit = splitByGroup(rawSwiss, "Como TV");
                comotvContent = swissSplit.matching;
                daznSwissContent = swissSplit.others;
            } else {
                console.error("[DAZN Swiss] Fetch failed:", swissResponse.status);
            }
        } catch (e) { console.error("[DAZN Swiss] Errore:", e); }

        // 7. Bluesport
        let bluesportContent = "";
        try {
            const bluesportUrl = withCacheBust(`${gistBase}/z_bluesport.m3u`);
            const bluesportResponse = await fetch(bluesportUrl);
            if (bluesportResponse.ok) {
                let rawBluesport = await bluesportResponse.text();
                bluesportContent = rawBluesport.replace(/^#EXTM3U\s*\n?/i, '').trim();
            } else {
                console.error("[Bluesport] Fetch failed:", bluesportResponse.status);
            }
        } catch (e) { console.error("[Bluesport] Errore:", e); }

        // 8. Primevideo
        let primevideoContent = "";
        try {
            const primevideoUrl = withCacheBust(`${gistBase}/z_primevideo.m3u`);
            const primevideoResponse = await fetch(primevideoUrl);
            if (primevideoResponse.ok) {
                let rawPrimevideo = await primevideoResponse.text();
                primevideoContent = rawPrimevideo.replace(/^#EXTM3U\s*\n?/i, '').trim();
            } else {
                console.error("[Primevideo] Fetch failed:", primevideoResponse.status);
            }
        } catch (e) { console.error("[Primevideo] Errore:", e); }

        // 9. NeroZone
        let nerozoneContent = "";
        try {
            const nerozoneUrl = withCacheBust(`${gistBase}/z_dazn_nerozone.m3u`);
            const nerozoneResponse = await fetch(nerozoneUrl);
            if (nerozoneResponse.ok) {
                let rawNerozone = await nerozoneResponse.text();
                nerozoneContent = rawNerozone.replace(/^#EXTM3U\s*\n?/i, '').trim();
            } else {
                console.error("[NeroZone] Fetch failed:", nerozoneResponse.status);
            }
        } catch (e) { console.error("[NeroZone] Errore:", e); }

        // 10. Eurosport/RSI (opzionale)
        let eurosportRsiContent = "";
        try {
            const eurosportRsiUrl = withCacheBust(`${gistBase}/z_eurosport-rsi.m3u`);
            const eurosportRsiResponse = await fetch(eurosportRsiUrl);
            if (eurosportRsiResponse.ok) {
                let rawEurosportRsi = await eurosportRsiResponse.text();
                eurosportRsiContent = rawEurosportRsi.replace(/^#EXTM3U\s*\n?/i, '').trim();
            }
        } catch (e) { /* opzionale */ }

        // 11. DAZN1 (da stefa-menne)
        let dazn1Content = "";
        try {
            const dazn1Url = withCacheBust(`https://gist.githubusercontent.com/stefa-menne/607a5986fa5ddcf07639b79200a31aa4/raw/dazn1.m3u`);
            const dazn1Response = await fetch(dazn1Url);
            if (dazn1Response.ok) {
                let rawDazn1 = await dazn1Response.text();
                dazn1Content = rawDazn1.replace(/^#EXTM3U\s*\n?/i, '').trim();
            } else {
                console.error("[DAZN1] Fetch failed:", dazn1Response.status);
            }
        } catch (e) { console.error("[DAZN1] Errore:", e); }

        // === SPLIT PRIMEVIDEO ===
        const primevideoSplit = splitByGroup(primevideoContent, "DAZN PRIMEVIDEO DE");
        const primevideoDEContent = primevideoSplit.matching;
        const primevideoOtherContent = primevideoSplit.others;

        // === SPLIT DAZN1 ===
        const dazn1SplitST = splitByGroup(dazn1Content, "DAZN ST");
        const dazn1STContent = dazn1SplitST.matching;
        const dazn1WithoutST = dazn1SplitST.others;

        const dazn1SplitEventi = splitByGroup(dazn1WithoutST, "DAZN Eventi");
        const dazn1EventiContent = dazn1SplitEventi.matching;
        const dazn1RestContent = dazn1SplitEventi.others;

        // === APPLICA OVERRIDE LOGO "DAZN 1" SULLE SORGENTI (NON su NeroZone) ===
        const daznContentFixed          = applyDazn1LogoOverride(daznContent);
        const dazn1STContentFixed       = applyDazn1LogoOverride(dazn1STContent);
        const daznEventsContentFixed    = applyDazn1LogoOverride(daznEventsContent);
        const dazn1EventiContentFixed   = applyDazn1LogoOverride(dazn1EventiContent);
        const dazn1RestContentFixed     = applyDazn1LogoOverride(dazn1RestContent);
        // NOTA: nerozoneContent NON viene passato nell'override — il logo lo gestisce dazn_nerozone.py
        const primevideoDEContentFixed  = applyDazn1LogoOverride(primevideoDEContent);
        const primevideoOtherFixed      = applyDazn1LogoOverride(primevideoOtherContent);
        const daznSwissContentFixed     = applyDazn1LogoOverride(daznSwissContent);
        const comotvContentFixed        = applyDazn1LogoOverride(comotvContent);

        // === LOGICA SKY ===
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
        // Ordine:
        //   Sky + base
        //   DAZN lineari
        //   DAZN ST
        //   DAZN Events (dazn_events.m3u)
        //   DAZN Eventi (dazn1.m3u)
        //   DAZN Primevideo DE
        //   DAZN NeroZone
        //   DAZN Svizzeri
        //   Prime Video
        //   Bluesport
        //   (extra: eurosport-rsi, resto dazn1, Como TV)
        let finalContent = "#EXTM3U\n";

        if (finalSkyChannels.length > 0) {
            const skyBlock = finalSkyChannels.map(c => buildM3U(c)).join('\n');
            finalContent += skyBlock + "\n";
        }

        if (baseContentFiltered.trim().length > 0) {
            finalContent += baseContentFiltered + "\n";
        }

        if (daznContentFixed)           finalContent = finalContent.trimEnd() + "\n" + daznContentFixed;           // DAZN lineari
        if (dazn1STContentFixed)        finalContent = finalContent.trimEnd() + "\n" + dazn1STContentFixed;        // DAZN ST
        if (daznEventsContentFixed)     finalContent = finalContent.trimEnd() + "\n" + daznEventsContentFixed;     // DAZN Events (dazn_events.m3u)
        if (dazn1EventiContentFixed)    finalContent = finalContent.trimEnd() + "\n" + dazn1EventiContentFixed;    // DAZN Eventi (dazn1.m3u)
        if (primevideoDEContentFixed)   finalContent = finalContent.trimEnd() + "\n" + primevideoDEContentFixed;   // DAZN Primevideo DE
        if (nerozoneContent)            finalContent = finalContent.trimEnd() + "\n" + nerozoneContent;            // DAZN NeroZone (logo gestito dallo script)
        if (daznSwissContentFixed)      finalContent = finalContent.trimEnd() + "\n" + daznSwissContentFixed;      // DAZN Svizzeri
        if (primevideoOtherFixed)       finalContent = finalContent.trimEnd() + "\n" + primevideoOtherFixed;       // Prime Video
        if (bluesportContent)           finalContent = finalContent.trimEnd() + "\n" + bluesportContent;           // Bluesport
        if (eurosportRsiContent)        finalContent = finalContent.trimEnd() + "\n" + eurosportRsiContent;
        if (dazn1RestContentFixed)      finalContent = finalContent.trimEnd() + "\n" + dazn1RestContentFixed;
        if (comotvContentFixed)         finalContent = finalContent.trimEnd() + "\n" + comotvContentFixed;

        // F1-only
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
