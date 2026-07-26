// AutoDecrypt.js (versione per GitHub Actions)
import crypto from 'crypto';
import fs from 'fs';

// Legge i parametri dalle variabili d'ambiente
const URLS = process.env.SKY_SOURCE_URL ? [process.env.SKY_SOURCE_URL] : ["https://skycript.blacksea2026.workers.dev/"];
const DECRYPT_PASSWORD = process.env.SKY_DECRYPT_PASSWORD;
const OUTPUT_FILE = 'sky.m3u';  // Salva direttamente nella working directory

if (!DECRYPT_PASSWORD) {
    console.error("❌ Variabile SKY_DECRYPT_PASSWORD non impostata");
    process.exit(1);
}

function decryptM3U(base64Data, password) {
    const encryptedData = Buffer.from(base64Data, 'base64');
    
    if (encryptedData.length < 32) {
        throw new Error("I dati cifrati ricevuti sono troppo corti o corrotti.");
    }

    const iv = encryptedData.subarray(0, 16);
    const ciphertext = encryptedData.subarray(16);
    const key = crypto.createHash('sha256').update(password).digest();
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
}

async function fetchBlob(url) {
    console.log(`🔗 Tentativo connessione a: ${url}`);
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    if (!response.ok) {
        throw new Error(`Il server ha risposto con status ${response.status}`);
    }

    const encryptedBlob = await response.text();
    return encryptedBlob.trim().replace(/^"|"$/g, '');
}

async function fetchAndDecrypt() {
    let cleanBlob = null;

    for (const url of URLS) {
        try {
            cleanBlob = await fetchBlob(url);
            break;
        } catch (error) {
            console.warn(`⚠️  Fallito il tentativo su ${url}: ${error.message}`);
        }
    }

    if (!cleanBlob) {
        console.error("\n❌ Tutti i tentativi di download sono falliti.");
        process.exit(1);
    }

    console.log(`📥 Payload ricevuto. Avvio decodifica crittografica...`);
    
    try {
        const decryptedPlaylist = decryptM3U(cleanBlob, DECRYPT_PASSWORD);
        
        let cleanedHeader = decryptedPlaylist.replace(/^(?:\s*#EXTM3U\s*)+/i, '');
        cleanedHeader = "#EXTM3U\n" + cleanedHeader;
        const formattedPlaylist = cleanedHeader.replace(/#EXTINF/g, '\n#EXTINF');
        
        console.log(`💾 Scrittura del file ${OUTPUT_FILE} in corso...`);
        fs.writeFileSync(OUTPUT_FILE, formattedPlaylist, 'utf8');
        console.log(`✅ File ${OUTPUT_FILE} creato con successo.`);
    } catch (error) {
        console.error("\n❌ Errore durante la decifratura o il salvataggio:");
        console.error(error.message);
        process.exit(1);
    }
}

fetchAndDecrypt();
