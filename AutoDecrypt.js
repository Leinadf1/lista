// AutoDecrypt.js – genera sky2.m3u (backup) con ordine e nomi allineati a sky.m3u
import crypto from 'crypto';
import fs from 'fs';

const URLS = process.env.SKY_SOURCE_URL ? [process.env.SKY_SOURCE_URL] : ["https://skycript.blacksea2026.workers.dev/"];
const DECRYPT_PASSWORD = process.env.SKY_DECRYPT_PASSWORD;
const OUTPUT_FILE = 'sky2.m3u';

// Ordine categorie e canali (esattamente come sky.m3u)
const GROUP_ORDER = ["INTRATTENIMENTO", "CINEMA", "SPORT", "BAMBINI"];

const CHANNEL_ORDER = {
    "INTRATTENIMENTO": [
        "Sky TG24",
        "Sky Uno",
        "Sky Uno Plus",
        "Sky Atlantic",
        "Sky Serie",
        "Sky Investigation",
        "Sky Collection",
        "Sky Documentaries",
        "Sky Crime",
        "History",
        "Sky Nature",
        "Sky Arte",
        "Sky Adventure",
        "MTV",
        "Comedy Central"
    ],
    "CINEMA": [
        "Sky Cinema Uno",
        "Sky Cinema Collection",
        "Sky Cinema Comedy",
        "Sky Cinema Action",
        "Sky Cinema Stories",
        "Sky Cinema Illumination",
        "Sky Cinema Drama",
        "Sky Cinema Romance",
        "Sky Cinema Suspense"
    ],
    "SPORT": [
        "Sky Sport 24",
        "Sky Sport Uno",
        "Sky Sport F1",
        "Sky Sport Calcio",
        "Sky Sport Tennis",
        "Sky Sport MotoGP",
        "Sky Sport Arena",
        "Sky Sport Max",
        "Sky Sport Basket",
        "Sky Sport Legend",
        "Sky Sport Mix",
        "Sky Sport 251",
        "Sky Sport 252",
        "Sky Sport 253",
        "Sky Sport 254",
        "Sky Sport 255",
        "Sky Sport 256",
        "Sky Sport 257",
        "Sky Sport 258",
        "Sky Sport 259",
        "Sky Sport Golf"
    ],
    "BAMBINI": [
        "Cartoon Network",
        "Nickelodeon",
        "DeAKids",
        "Nick Jr",
        "Boomerang"
    ]
};

// Normalizzazione dei nomi per uniformarli a sky.m3u
const NAME_NORMALIZATION = {
    "sky tg24": "Sky TG24",
    "sky uno": "Sky Uno",
    "sky uno +": "Sky Uno Plus",
    "sky uno plus": "Sky Uno Plus",
    "sky atlantic": "Sky Atlantic",
    "sky serie": "Sky Serie",
    "sky investigation": "Sky Investigation",
    "sky collection": "Sky Collection",
    "sky documentaries": "Sky Documentaries",
    "sky crime": "Sky Crime",
    "history": "History",
    "sky nature": "Sky Nature",
    "sky arte": "Sky Arte",
    "sky adventure": "Sky Adventure",
    "mtv": "MTV",
    "comedy central": "Comedy Central",
    "sky cinema uno": "Sky Cinema Uno",
    "sky cinema collection": "Sky Cinema Collection",
    "sky cinema comedy": "Sky Cinema Comedy",
    "sky cinema action": "Sky Cinema Action",
    "sky cinema stories": "Sky Cinema Stories",
    "sky cinema illumination": "Sky Cinema Illumination",
    "sky cinema family": "Sky Cinema Illumination",   // mappa il nome alternativo
    "sky cinema drama": "Sky Cinema Drama",
    "sky cinema romance": "Sky Cinema Romance",
    "sky cinema suspense": "Sky Cinema Suspense",
    "sky sport 24": "Sky Sport 24",
    "sky sport uno": "Sky Sport Uno",
    "sky sport f1": "Sky Sport F1",
    "sky sport calcio": "Sky Sport Calcio",
    "sky sport tennis": "Sky Sport Tennis",
    "sky sport motogp": "Sky Sport MotoGP",
    "sky sport arena": "Sky Sport Arena",
    "sky sport max": "Sky Sport Max",
    "sky sport basket": "Sky Sport Basket",
    "sky sport legend": "Sky Sport Legend",
    "sky sport mix": "Sky Sport Mix",
    "sky sport 251": "Sky Sport 251",
    "sky sport 252": "Sky Sport 252",
    "sky sport 253": "Sky Sport 253",
    "sky sport 254": "Sky Sport 254",
    "sky sport 255": "Sky Sport 255",
    "sky sport 256": "Sky Sport 256",
    "sky sport 257": "Sky Sport 257",
    "sky sport 258": "Sky Sport 258",
    "sky sport 259": "Sky Sport 259",
    "sky sport golf": "Sky Sport Golf",
    "cartoon network": "Cartoon Network",
    "nickelodeon": "Nickelodeon",
    "deakids": "DeAKids",
    "nick jr": "Nick Jr",
    "boomerang": "Boomerang"
};

function normalizeChannelName(name) {
    const key = name.trim().toLowerCase();
    return NAME_NORMALIZATION[key] || name;   // se non trovato, mantiene l'originale
}

if (!DECRYPT_PASSWORD) {
    console.error("❌ Variabile SKY_DECRYPT_PASSWORD non impostata");
    process.exit(1);
}

function decryptM3U(base64Data, password) {
    const encryptedData = Buffer.from(base64Data, 'base64');
    if (encryptedData.length < 32) throw new Error("Dati cifrati troppo corti.");
    const iv = encryptedData.subarray(0, 16);
    const ciphertext = encryptedData.subarray(16);
    const key = crypto.createHash('sha256').update(password).digest();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
}

async function fetchBlob(url) {
    console.log(`🔗 Connessione a: ${url}`);
    const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const text = await response.text();
    return text.trim().replace(/^"|"$/g, '');
}

function getGroup(line) {
    const match = line.match(/group-title="([^"]*)"/i);
    return match ? match[1].toUpperCase() : null;
}

function getChannelName(line) {
    const match = line.match(/,(.*)$/);
    return match ? match[1].trim() : "";
}

function filterAndSortSkyChannels(playlist) {
    const lines = playlist.split('\n');
    const channelsByGroup = {};
    GROUP_ORDER.forEach(group => channelsByGroup[group] = []);

    let currentGroup = null;
    let currentChannelLines = [];

    for (let line of lines) {
        if (line.startsWith('#EXTINF:')) {
            if (currentGroup && currentChannelLines.length > 0) {
                const groupKey = GROUP_ORDER.find(g => currentGroup.includes(g));
                if (groupKey && channelsByGroup[groupKey]) {
                    channelsByGroup[groupKey].push([...currentChannelLines]);
                }
            }
            currentChannelLines = [line];
            currentGroup = getGroup(line);
        } else if (line.startsWith('#KODIPROP') || line.startsWith('#EXTVLCOPT') || line.startsWith('http')) {
            if (currentChannelLines.length > 0) currentChannelLines.push(line);
        }
    }

    if (currentGroup && currentChannelLines.length > 0) {
        const groupKey = GROUP_ORDER.find(g => currentGroup.includes(g));
        if (groupKey && channelsByGroup[groupKey]) channelsByGroup[groupKey].push([...currentChannelLines]);
    }

    // Ordina secondo CHANNEL_ORDER (dopo aver normalizzato il nome)
    GROUP_ORDER.forEach(group => {
        const order = CHANNEL_ORDER[group];
        if (order && channelsByGroup[group]) {
            channelsByGroup[group].sort((a, b) => {
                const rawNameA = getChannelName(a[0]);
                const rawNameB = getChannelName(b[0]);
                const nameA = normalizeChannelName(rawNameA);
                const nameB = normalizeChannelName(rawNameB);
                const indexA = order.indexOf(nameA);
                const indexB = order.indexOf(nameB);
                if (indexA === -1) return 1;
                if (indexB === -1) return -1;
                return indexA - indexB;
            });
        }
    });

    // Ricostruisce l'output sostituendo i nomi con quelli normalizzati
    let result = ['#EXTM3U'];
    GROUP_ORDER.forEach(group => {
        if (channelsByGroup[group]) {
            channelsByGroup[group].forEach(channelLines => {
                // Modifica la riga EXTINF per usare il nome normalizzato
                const extinfLine = channelLines[0];
                const nameMatch = extinfLine.match(/,(.*)$/);
                if (nameMatch) {
                    const originalName = nameMatch[1].trim();
                    const normalized = normalizeChannelName(originalName);
                    if (normalized !== originalName) {
                        channelLines[0] = extinfLine.replace(/,.*$/, `,${normalized}`);
                    }
                }
                result.push(...channelLines);
            });
        }
    });

    return result.join('\n');
}

(async () => {
    let blob = null;
    for (const url of URLS) {
        try { blob = await fetchBlob(url); break; } catch (e) { console.warn(`⚠️ Fallito ${url}: ${e.message}`); }
    }
    if (!blob) { console.error("❌ Download fallito."); process.exit(1); }

    try {
        const decrypted = decryptM3U(blob, DECRYPT_PASSWORD);
        let out = decrypted.replace(/^(?:\s*#EXTM3U\s*)+/i, '');
        out = "#EXTM3U\n" + out;
        out = out.replace(/#EXTINF/g, '\n#EXTINF');

        out = filterAndSortSkyChannels(out);

        fs.writeFileSync(OUTPUT_FILE, out, 'utf8');
        const channelCount = out.split('\n').filter(l => l.startsWith('#EXTINF:')).length;
        console.log(`✅ ${OUTPUT_FILE} generato (${channelCount} canali Sky, ordine e nomi allineati a sky.m3u)`);
    } catch (e) { console.error("❌ Decifratura fallita:", e.message); process.exit(1); }
})();
