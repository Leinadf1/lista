// AutoDecrypt.js – genera sky2.m3u (backup) con lo stesso ordine di sky.m3u
import crypto from 'crypto';
import fs from 'fs';

const URLS = process.env.SKY_SOURCE_URL ? [process.env.SKY_SOURCE_URL] : ["https://skycript.blacksea2026.workers.dev/"];
const DECRYPT_PASSWORD = process.env.SKY_DECRYPT_PASSWORD;
const OUTPUT_FILE = 'sky2.m3u';  // 👈 SCRIVE SU sky2.m3u

// Stesso ordine di sky_lc.py
const GROUP_ORDER = ["INTRATTENIMENTO", "CINEMA", "SPORT", "BAMBINI"];

const CHANNEL_ORDER = {
    "INTRATTENIMENTO": [
        "Sky TG24", "Sky Uno", "Sky Uno Plus", "Sky Atlantic", "Sky Serie", "Sky Investigation",
        "Sky Collection", "Sky Documentaries", "Sky Crime", "History", "Sky Nature", "Sky Arte",
        "Sky Adventure", "MTV", "Comedy Central"
    ],
    "CINEMA": [
        "Sky Cinema Uno", "Sky Cinema Collection", "Sky Cinema Comedy", "Sky Cinema Action",
        "Sky Cinema Stories", "Sky Cinema Illumination", "Sky Cinema Drama", "Sky Cinema Romance",
        "Sky Cinema Suspense"
    ],
    "SPORT": [
        "Sky Sport 24", "Sky Sport Uno", "Sky Sport F1", "Sky Sport Calcio", "Sky Sport Tennis",
        "Sky Sport MotoGP", "Sky Sport Arena", "Sky Sport Max", "Sky Sport Basket", "Sky Sport Legend",
        "Sky Sport Mix", "Sky Sport 251", "Sky Sport 252", "Sky Sport 253", "Sky Sport 254",
        "Sky Sport 255", "Sky Sport 256", "Sky Sport 257", "Sky Sport 258", "Sky Sport 259", "Sky Sport Golf"
    ],
    "BAMBINI": [
        "Cartoon Network", "Nickelodeon", "DeAKids", "Nick Jr", "Boomerang"
    ]
};

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

    // Ordina come sky.m3u
    GROUP_ORDER.forEach(group => {
        const order = CHANNEL_ORDER[group];
        if (order && channelsByGroup[group]) {
            channelsByGroup[group].sort((a, b) => {
                const nameA = getChannelName(a[0]);
                const nameB = getChannelName(b[0]);
                const indexA = order.indexOf(nameA);
                const indexB = order.indexOf(nameB);
                if (indexA === -1) return 1;
                if (indexB === -1) return -1;
                return indexA - indexB;
            });
        }
    });

    let result = ['#EXTM3U'];
    GROUP_ORDER.forEach(group => {
        if (channelsByGroup[group]) {
            channelsByGroup[group].forEach(channelLines => result.push(...channelLines));
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
        console.log(`✅ ${OUTPUT_FILE} generato (${out.split('\n').filter(l => l.startsWith('#EXTINF:')).length} canali Sky)`);
    } catch (e) { console.error("❌ Decifratura fallita:", e.message); process.exit(1); }
})();
