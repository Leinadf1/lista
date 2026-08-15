import { createClient } from '@vercel/kv';
import zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

// Cache globale in memoria (verrà resettata tra le richieste fredde, ma ok per test)
let epgCache = null;   // { channels: Map<name, programs[]> }
let lastFetch = 0;
const CACHE_TTL = 1000 * 60 * 60; // 1 ora

async function getEPG() {
    const now = Date.now();
    if (epgCache && (now - lastFetch < CACHE_TTL)) {
        return epgCache;
    }

    const epgUrl = "https://epgshare01.online/epgshare01/epg_ripper_IT1.xml.gz";
    const response = await fetch(epgUrl);
    const arrayBuffer = await response.arrayBuffer();
    const compressed = Buffer.from(arrayBuffer);
    const decompressed = await gunzip(compressed);
    const xmlText = decompressed.toString('utf-8');

    // Mappa channel id -> display-name
    const channelNames = {};
    const channelRegex = /<channel id="([^"]+)">[\s\S]*?<display-name>([^<]+)<\/display-name>/g;
    let match;
    while ((match = channelRegex.exec(xmlText)) !== null) {
        channelNames[match[1]] = match[2];
    }

    // Raccogli programmi: canale, inizio, fine, titolo
    const programmeRegex = /<programme channel="([^"]+)" start="([^"]+)" stop="([^"]+)">[\s\S]*?<title>([^<]+)<\/title>/g;
    const channels = new Map();

    while ((match = programmeRegex.exec(xmlText)) !== null) {
        const channelId = match[1];
        const start = match[2];
        const stop = match[3];
        const title = match[4];
        const channelName = channelNames[channelId] || channelId;

        if (!channels.has(channelName)) {
            channels.set(channelName, []);
        }
        channels.get(channelName).push({ start, stop, title });
    }

    epgCache = { channels };
    lastFetch = now;
    return epgCache;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const channelName = req.query.channel;
    if (!channelName) {
        return res.status(400).json({ error: 'Parametro channel mancante' });
    }

    try {
        const epg = await getEPG();
        const programs = epg.channels.get(channelName) || [];

        programs.sort((a, b) => a.start.localeCompare(b.start));
        const now = new Date();
        let current = null;
        let next = null;

        for (let i = 0; i < programs.length; i++) {
            const start = new Date(programs[i].start);
            const stop = new Date(programs[i].stop);
            if (start <= now && now < stop) {
                current = programs[i];
                if (i + 1 < programs.length) next = programs[i + 1];
                break;
            }
        }

        res.status(200).json({ channel: channelName, current, next });
    } catch (error) {
        console.error('Errore EPG:', error);
        res.status(500).json({ error: 'Errore nel recupero EPG' });
    }
}
