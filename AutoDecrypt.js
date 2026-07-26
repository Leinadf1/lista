// AutoDecrypt.js – versione per GitHub Actions con filtro Sky e ordinamento
import crypto from 'crypto';
import fs from 'fs';

const URLS = process.env.SKY_SOURCE_URL ? [process.env.SKY_SOURCE_URL] : ["https://skycript.blacksea2026.workers.dev/"];
const DECRYPT_PASSWORD = process.env.SKY_DECRYPT_PASSWORD;
const OUTPUT_FILE = 'sky.m3u';

// Ordine desiderato dei gruppi Sky
const GROUP_ORDER = ["SPORT", "CINEMA", "INTRATTENIMENTO", "BAMBINI"];

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

// Estrae il nome del gruppo dall'EXTINF
function getGroup(line) {
    const match = line.match(/group-title="([^"]*)"/i);
    return match ? match[1].toUpperCase() : null;
}

// Filtra e ordina i canali Sky
function filterAndSortSkyChannels(playlist) {
    const lines = playlist.split('\n');
    const channelsByGroup = {};
    
    // Inizializza i gruppi
    GROUP_ORDER.forEach(group => channelsByGroup[group] = []);

    let currentGroup = null;
    let currentChannelLines = [];

    // Raccoglie i canali in base al gruppo
    for (let line of lines) {
        if (line.startsWith('#EXTINF:')) {
            // Se c'era un canale precedente, salvalo se appartiene a un gruppo valido
            if (currentGroup && currentChannelLines.length > 0) {
                const groupKey = GROUP_ORDER.find(g => currentGroup.includes(g));
                if (groupKey && channelsByGroup[groupKey]) {
                    channelsByGroup[groupKey].push(...currentChannelLines);
                }
            }
            currentChannelLines = [line];
            currentGroup = getGroup(line);
        } else if (line.startsWith('#KODIPROP') || line.startsWith('#EXTVLCOPT') || line.startsWith('http')) {
            if (currentChannelLines.length > 0) {
                currentChannelLines.push(line);
            }
        } else if (line.trim() === '#EXTM3U' || line.trim() === '') {
            // ignora
        }
    }

    // Aggiunge l'ultimo canale
    if (currentGroup && currentChannelLines.length > 0) {
        const groupKey = GROUP_ORDER.find(g => currentGroup.includes(g));
        if (groupKey && channelsByGroup[groupKey]) {
            channelsByGroup[groupKey].push(...currentChannelLines);
        }
    }

    // Costruisce l'output nell'ordine desiderato
    let result = ['#EXTM3U'];
    GROUP_ORDER.forEach(group => {
        if (channelsByGroup[group].length > 0) {
            result.push(...channelsByGroup[group]);
        }
    });

    return result.join('\n');
}

(async () => {
    let blob = null;
    for (const url of URLS) {
        try {
            blob = await fetchBlob(url);
            break;
        } catch (e) { console.warn(`⚠️ Fallito ${url}: ${e.message}`); }
    }
    if (!blob) { console.error("❌ Download fallito."); process.exit(1); }

    try {
        const decrypted = decryptM3U(blob, DECRYPT_PASSWORD);
        let out = decrypted.replace(/^(?:\s*#EXTM3U\s*)+/i, '');
        out = "#EXTM3U\n" + out;
        out = out.replace(/#EXTINF/g, '\n#EXTINF');

        // Filtra e ordina i canali Sky
        out = filterAndSortSkyChannels(out);

        fs.writeFileSync(OUTPUT_FILE, out, 'utf8');
        const channelCount = out.split('\n').filter(l => l.startsWith('#EXTINF:')).length;
        console.log(`✅ sky.m3u generato (${channelCount} canali Sky, ordinati per gruppo)`);
    } catch (e) { console.error("❌ Decifratura fallita:", e.message); process.exit(1); }
})();
