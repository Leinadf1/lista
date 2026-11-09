import { createClient } from '@vercel/kv';
import crypto from 'crypto';

// ============================================================
// SICUREZZA
// ============================================================
const AUTH_SECRET = process.env.AUTH_SECRET || 'CHANGE_ME_IN_VERCEL_ENV';
const MAX_FAILED = 10;
const RATE_WINDOW = 300; // 5 min

function hmac(s) {
    return crypto.createHmac('sha256', AUTH_SECRET).update(String(s)).digest();
}
function safePasswordCheck(input, list) {
    if (!input || !list || list.length === 0) return false;
    const h = hmac(input);
    let match = false;
    for (const p of list) {
        try { if (crypto.timingSafeEqual(h, hmac(p))) match = true; } catch {}
    }
    return match;
}
function sha256hex(s) {
    return crypto.createHash('sha256').update(String(s)).digest('hex');
}
function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string') return xff.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

// ============================================================
// PARSER / BUILDER M3U (identici all'originale)
// ============================================================
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
                        current.drm = JSON.stringify({ [parts[0].trim()]: parts[1].trim() });
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
            if (current.name && current.url) channels.push({ ...current });
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
function normalizeChannelName(name) {
    if (!name) return '';
    return name.toUpperCase().replace(/SKY/g, '').replace(/HD/g, '').replace(/[^A-Z0-9]/g, '');
}
function findBackupChannel(name, backupList) {
    const searchName = name.trim().toUpperCase();
    const normSearchName = normalizeChannelName(name);
    const exactMatch = backupList.find(ch => ch.name.trim().toUpperCase() === searchName);
    if (exactMatch) return exactMatch;
    return backupList.find(ch => normalizeChannelName(ch.name) === normSearchName);
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
            if (namesSet.has(name)) { skip = true; continue; }
        }
        if (skip) { if (trimmed.startsWith('http')) skip = false; continue; }
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
            if (trimmed.startsWith('http')) { blocks.push(current); current = null; }
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
    return { matching: blocksToContent(matching), others: blocksToContent(others) };
}
function withCacheBust(url) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}t=${Date.now()}&r=${Math.random().toString(36).slice(2)}`;
}
const DAZN1_LOGO_FIXED = "https://nowtv-live.pages.dev/logos/dazn1.png?v=2";
function applyDazn1LogoOverride(content) {
    if (!content) return content;
    return content.replace(
        /(#EXTINF:[^\n]*?tvg-name="DAZN\s+1(?:\s[^"]*)?"[^\n]*?)tvg-logo="[^"]*"/gim,
        `$1tvg-logo="${DAZN1_LOGO_FIXED}"`
    );
}

// ============================================================
// PROXY (spostato dal frontend al server)
// ============================================================
const PROXY_CATEGORIES = [
    'serie bkt', 'laliga ea sports', 'serie a enilive', 'amichevoli',
    'jupiler pro league', 'liga portugal betclic', 'nerozone', 'dazn nerozone'
];

function shouldProxy(extinf, url) {
    const gm = extinf.match(/group-title="([^"]+)"/i);
    const nm = extinf.match(/,(.*)/);
    const group = gm ? gm[1] : '';
    const name = nm ? nm[1].trim() : '';

    const gN = group.toLowerCase().replace(/[\s\-_]/g, '');
    const nN = name.toLowerCase().replace(/[\s\-_]/g, '');

    const isDazn1ST          = nN === 'dazn1' && (gN === 'st' || gN === 'daznst');
    const isDazn1Lineare     = nN === 'dazn1' && gN === 'daznlineari';
    const isDaznSvizzeri     = gN.includes('daznsvizzeri');
    const isDaznPrimeVideoDE = gN.includes('daznprimevideode');
    const isNeroZone         = gN.includes('nerozone') || nN.includes('nerozone') || gN.includes('daznnero') || nN.includes('daznnero');
    const isDaznChannel      = gN.includes('dazn') || nN.includes('dazn');
    const isProxyCategory    = PROXY_CATEGORIES.includes(group.toLowerCase().trim());
    const alreadyProxied     = url.includes('.workers.dev/');

    if (alreadyProxied || isDazn1ST) return false;
    return isProxyCategory || isNeroZone || (!isDazn1Lineare && !isDaznSvizzeri && !isDaznPrimeVideoDE && isDaznChannel);
}

function applyProxy(content, proxyUrl) {
    if (!proxyUrl || !content) return content;
    const lines = content.split('\n');
    const out = [];
    let currentExtinf = null;
    for (const raw of lines) {
        const line = raw.trim();
        if (line.startsWith('#EXTINF:')) {
            currentExtinf = line;
            out.push(raw);
            continue;
        }
        if (line.startsWith('http')) {
            if (currentExtinf && shouldProxy(currentExtinf, line)) {
                out.push(proxyUrl + line);
            } else {
                out.push(raw);
            }
            currentExtinf = null;
            continue;
        }
        out.push(raw);
    }
    return out.join('\n');
}

// ============================================================
// HANDLER
// ============================================================
export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    // ⚠️ CORS: SOLO i tuoi domini. Aggiungi altri separati da virgola se serve.
    res.setHeader('Access-Control-Allow-Origin', 'https://listaitnow.vercel.app');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-heartbeat, x-reload');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Parse body
    let body = {};
    try {
        const buffers = [];
        for await (const chunk of req) buffers.push(chunk);
        body = JSON.parse(Buffer.concat(buffers).toString() || '{}');
    } catch { body = {}; }

    const psw = String(body.password || '').trim();
    if (!psw) return res.status(400).json({ error: 'Password mancante' });

    const kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
    });

    // Rate limit per IP
    const ip = getClientIp(req);
    const rlKey = `rl:getlist:${ip}`;
    const attempts = parseInt(await kv.get(rlKey) || '0', 10);
    if (attempts >= MAX_FAILED) {
        return res.status(429).json({ error: 'Troppi tentativi falliti. Riprova più tardi.' });
    }

    // Liste password (IDENTICHE all'originale)
    const proxyMioUrl   = process.env.PROXY_MIO;
    const proxySteUrl   = process.env.PROXY_STE;
    const proxyTerzoUrl = process.env.PROXY_TERZO;

    const listaPassMio   = (process.env.PASS_PROXY_MIO   || '').split(',').map(p => p.trim()).filter(p => p !== '');
    const listaPassSte   = (process.env.PASS_PROXY_STE   || '').split(',').map(p => p.trim()).filter(p => p !== '');
    const listaPassTerzo = (process.env.PASS_PROXY_TERZO || '').split(',').map(p => p.trim()).filter(p => p !== '');
    const masterPasswords = (process.env.MASTER_PASSWORD || '').split(',').map(p => p.trim()).filter(p => p !== '');

    if (!proxyMioUrl || !proxySteUrl || !proxyTerzoUrl) {
        console.error("ERRORE CRITICO: Le variabili d'ambiente PROXY_* non sono configurate.");
        return res.status(500).json({ error: 'Configurazione server incompleta' });
    }

    // Verifica password (constant-time)
    const allValidPasswords = [...listaPassMio, ...listaPassSte, ...listaPassTerzo, ...masterPasswords];
    if (!safePasswordCheck(psw, allValidPasswords)) {
        await kv.set(rlKey, String(attempts + 1), { ex: RATE_WINDOW });
        return res.status(401).json({ error: 'Password errata' });
    }
    if (attempts > 0) await kv.del(rlKey);

    // Determina proxy (IDENTICO all'originale, ma con constant-time)
    let proxyDaUsare = null;
    if (safePasswordCheck(psw, listaPassMio)) {
        proxyDaUsare = proxyMioUrl;
    } else if (safePasswordCheck(psw, listaPassSte)) {
        proxyDaUsare = proxySteUrl;
    } else if (safePasswordCheck(psw, listaPassTerzo)) {
        proxyDaUsare = proxyTerzoUrl;
    } else if (safePasswordCheck(psw, masterPasswords)) {
        proxyDaUsare = proxyMioUrl;
        console.log(`[MASTER] Uso il Proxy Mio di default per la password ${psw}`);
    }

    if (!proxyDaUsare) {
        return res.status(500).json({ error: 'Configurazione proxy mancante' });
    }

    // Session key = HASH della password (non plaintext)
    const phash = sha256hex(psw);
    const sessionKey = `sess:${phash}`;

    // Heartbeat
    if (req.headers['x-heartbeat'] === 'true') {
        await kv.set(sessionKey, 'active', { ex: 30 });
        return res.status(200).json({ status: 'ok' });
    }

    // Anti-sharing (logica originale)
    const isReload = req.headers['x-reload'] === 'true';
    if (!isReload) {
        const isOccupied = await kv.get(sessionKey);
        if (isOccupied) {
            return res.status(403).json({ error: 'Accesso negato: sessione già attiva' });
        }
    }
    await kv.set(sessionKey, 'active', { ex: 30 });

    try {
        const gistBase = process.env.GIST_RAW_URL.replace(/\/[^\/]+$/, '');
        const githubResponse = await fetch(withCacheBust(process.env.GIST_RAW_URL));
        const fileContent = await githubResponse.text();
        const baseChannels = parseM3U(fileContent);

        let skyChannels = [];
        try {
            const skyUrl = withCacheBust(`${gistBase}/sky.m3u`);
            const skyResponse = await fetch(skyUrl);
            if (skyResponse.ok) skyChannels = parseM3U(await skyResponse.text());
        } catch (e) { console.error("Errore sky.m3u:", e); }

        let backupChannels = [];
        try {
            const backupUrl = withCacheBust(`${gistBase}/sky2.m3u`);
            const backupResponse = await fetch(backupUrl);
            if (backupResponse.ok) backupChannels = parseM3U(await backupResponse.text());
        } catch (e) { console.error("Errore sky2.m3u:", e); }

        let daznContent = "";
        try {
            const daznGistId = process.env.DAZN_GIST_ID;
            if (daznGistId) {
                const daznUrl = withCacheBust(`https://gist.githubusercontent.com/Leinadf1/${daznGistId}/raw/dazn.m3u`);
                const daznResponse = await fetch(daznUrl);
                if (daznResponse.ok) {
                    daznContent = (await daznResponse.text()).replace(/^#EXTM3U\s*\n?/i, '').trim();
                }
            }
        } catch (e) { console.error("[DAZN] Errore dazn.m3u:", e); }

        let daznEventsContent = "";
        try {
            const daznGistId = process.env.DAZN_GIST_ID;
            if (daznGistId) {
                const eventsUrl = withCacheBust(`https://gist.githubusercontent.com/Leinadf1/${daznGistId}/raw/dazn_events.m3u`);
                const eventsResponse = await fetch(eventsUrl);
                if (eventsResponse.ok) {
                    daznEventsContent = (await eventsResponse.text()).replace(/^#EXTM3U\s*\n?/i, '').trim();
                }
            }
        } catch (e) { console.error("[DAZN] Errore dazn_events.m3u:", e); }

        let daznSwissContent = "";
        let comotvContent = "";
        try {
            const swissUrl = withCacheBust(`${gistBase}/z_dazn_swiss.m3u`);
            const swissResponse = await fetch(swissUrl);
            if (swissResponse.ok) {
                const rawSwiss = (await swissResponse.text()).replace(/^#EXTM3U\s*\n?/i, '').trim();
                const swissSplit = splitByGroup(rawSwiss, "Como TV");
                comotvContent = swissSplit.matching;
                daznSwissContent = swissSplit.others;
            }
        } catch (e) { console.error("[DAZN Swiss] Errore:", e); }

        let bluesportContent = "";
        try {
            const r = await fetch(withCacheBust(`${gistBase}/z_bluesport.m3u`));
            if (r.ok) bluesportContent = (await r.text()).replace(/^#EXTM3U\s*\n?/i, '').trim();
        } catch (e) { console.error("[Bluesport] Errore:", e); }

        let primevideoContent = "";
        try {
            const r = await fetch(withCacheBust(`${gistBase}/z_primevideo.m3u`));
            if (r.ok) primevideoContent = (await r.text()).replace(/^#EXTM3U\s*\n?/i, '').trim();
        } catch (e) { console.error("[Primevideo] Errore:", e); }

        let nerozoneContent = "";
        try {
            const r = await fetch(withCacheBust(`${gistBase}/z_dazn_nerozone.m3u`));
            if (r.ok) nerozoneContent = (await r.text()).replace(/^#EXTM3U\s*\n?/i, '').trim();
        } catch (e) { console.error("[NeroZone] Errore:", e); }

        let eurosportRsiContent = "";
        try {
            const r = await fetch(withCacheBust(`${gistBase}/z_eurosport-rsi.m3u`));
            if (r.ok) eurosportRsiContent = (await r.text()).replace(/^#EXTM3U\s*\n?/i, '').trim();
        } catch (e) {}

        let dazn1Content = "";
        try {
            const r = await fetch(withCacheBust(`https://gist.githubusercontent.com/stefa-menne/607a5986fa5ddcf07639b79200a31aa4/raw/dazn1.m3u`));
            if (r.ok) dazn1Content = (await r.text()).replace(/^#EXTM3U\s*\n?/i, '').trim();
        } catch (e) { console.error("[DAZN1] Errore:", e); }

        const primevideoSplit = splitByGroup(primevideoContent, "DAZN PRIMEVIDEO DE");
        const primevideoDEContent = primevideoSplit.matching;
        const primevideoOtherContent = primevideoSplit.others;

        const dazn1SplitST = splitByGroup(dazn1Content, "DAZN ST");
        const dazn1STContent = dazn1SplitST.matching;
        const dazn1WithoutST = dazn1SplitST.others;

        const dazn1SplitEventi = splitByGroup(dazn1WithoutST, "DAZN Eventi");
        const dazn1EventiContent = dazn1SplitEventi.matching;
        const dazn1RestContent = dazn1SplitEventi.others;

        const daznContentFixed         = applyDazn1LogoOverride(daznContent);
        const dazn1STContentFixed      = applyDazn1LogoOverride(dazn1STContent);
        const daznEventsContentFixed   = applyDazn1LogoOverride(daznEventsContent);
        const dazn1EventiContentFixed  = applyDazn1LogoOverride(dazn1EventiContent);
        const dazn1RestContentFixed    = applyDazn1LogoOverride(dazn1RestContent);
        const primevideoDEContentFixed = applyDazn1LogoOverride(primevideoDEContent);
        const primevideoOtherFixed     = applyDazn1LogoOverride(primevideoOtherContent);
        const daznSwissContentFixed    = applyDazn1LogoOverride(daznSwissContent);
        const comotvContentFixed       = applyDazn1LogoOverride(comotvContent);

        let finalSkyChannels = skyChannels.map(ch => {
            if (isChannelExpired(ch)) {
                const backupFromSky2 = findBackupChannel(ch.name, backupChannels);
                if (backupFromSky2) return { ...ch, url: backupFromSky2.url, drm: backupFromSky2.drm };
                const backupFromBase = findBackupChannel(ch.name, baseChannels);
                if (backupFromBase) return { ...ch, url: backupFromBase.url, drm: backupFromBase.drm };
            }
            return ch;
        });

        const skyNamesSet = new Set(finalSkyChannels.map(ch => ch.name.toUpperCase()));
        const baseContentFiltered = removeChannelsByName(fileContent, skyNamesSet);

        let finalContent = "#EXTM3U\n";
        if (finalSkyChannels.length > 0) {
            finalContent += finalSkyChannels.map(c => buildM3U(c)).join('\n') + "\n";
        }
        if (baseContentFiltered.trim().length > 0) finalContent += baseContentFiltered + "\n";

        if (daznContentFixed)         finalContent = finalContent.trimEnd() + "\n" + daznContentFixed;
        if (daznEventsContentFixed)   finalContent = finalContent.trimEnd() + "\n" + daznEventsContentFixed;
        if (dazn1EventiContentFixed)  finalContent = finalContent.trimEnd() + "\n" + dazn1EventiContentFixed;
        if (primevideoDEContentFixed) finalContent = finalContent.trimEnd() + "\n" + primevideoDEContentFixed;
        if (nerozoneContent)          finalContent = finalContent.trimEnd() + "\n" + nerozoneContent;
        if (daznSwissContentFixed)    finalContent = finalContent.trimEnd() + "\n" + daznSwissContentFixed;
        if (primevideoOtherFixed)     finalContent = finalContent.trimEnd() + "\n" + primevideoOtherFixed;
        if (bluesportContent)         finalContent = finalContent.trimEnd() + "\n" + bluesportContent;
        if (eurosportRsiContent)      finalContent = finalContent.trimEnd() + "\n" + eurosportRsiContent;
        if (dazn1RestContentFixed)    finalContent = finalContent.trimEnd() + "\n" + dazn1RestContentFixed;
        if (comotvContentFixed)       finalContent = finalContent.trimEnd() + "\n" + comotvContentFixed;

        // F1-only (IDENTICO all'originale)
        const f1OnlyPasswords = (process.env.F1_ONLY_PASSWORD || "").split(',').map(p => p.trim().toLowerCase());
        const isF1Only = f1OnlyPasswords.includes(psw.toLowerCase());

        if (isF1Only) {
            const f1FromSky = finalSkyChannels.find(c =>
                normalizeChannelName(c.name).includes("SPORTF1") ||
                c.name.toUpperCase().includes("SKY SPORT F1"));
            if (f1FromSky) {
                let filtered = "#EXTM3U\n" + buildM3U(f1FromSky);
                const proxied = applyProxy(filtered, proxyDaUsare);
                const encoded = Buffer.from(proxied, 'utf-8').toString('base64');
                return res.status(200).json({ m3u: encoded });
            }
            const lines = baseContentFiltered.split('\n');
            let found = false;
            let filtered = "#EXTM3U\n";
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#EXTINF') &&
                    (normalizeChannelName(lines[i]).includes("SPORTF1") ||
                     lines[i].toUpperCase().includes("SKY SPORT F1"))) {
                    filtered += lines[i] + "\n";
                    if (lines[i + 1]) filtered += lines[i + 1] + "\n";
                    found = true;
                    break;
                }
            }
            if (!found) {
                const f1FromBackup = backupChannels.find(c =>
                    normalizeChannelName(c.name).includes("SPORTF1") ||
                    c.name.toUpperCase().includes("SKY SPORT F1"));
                if (f1FromBackup) filtered += buildM3U(f1FromBackup);
            }
            const proxied = applyProxy(filtered, proxyDaUsare);
            const encoded = Buffer.from(proxied, 'utf-8').toString('base64');
            return res.status(200).json({ m3u: encoded });
        }

        // Path normale: applica proxy server-side e restituisci SOLO m3u
        const proxied = applyProxy(finalContent, proxyDaUsare);
        const encoded = Buffer.from(proxied, 'utf-8').toString('base64');
        return res.status(200).json({ m3u: encoded });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Errore caricamento liste" });
    }
}
