import zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

let epgCache = null;
let lastFetch = 0;
const CACHE_TTL = 1000 * 60 * 30;

function normalizeName(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

async function getEPG() {
    const now = Date.now();
    if (epgCache && (now - lastFetch < CACHE_TTL)) return epgCache;

    const epgUrl = 'https://epgshare01.online/epgshare01/epg_ripper_IT1.xml.gz';
    const response = await fetch(epgUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const decompressed = await gunzip(buffer);
    const xmlText = decompressed.toString('utf-8');

    const channels = new Map();
    const idToName = {};

    const channelRegex = /<channel id="([^"]+)">[\s\S]*?<display-name>([^<]+)<\/display-name>/g;
    let match;
    while ((match = channelRegex.exec(xmlText)) !== null) {
        idToName[match[1]] = match[2];
    }

    const progRegex = /<programme channel="([^"]+)" start="([^"]+)" stop="([^"]+)">[\s\S]*?<title>([^<]+)<\/title>/g;
    while ((match = progRegex.exec(xmlText)) !== null) {
        const channelId = match[1];
        const start = match[2];
        const stop = match[3];
        const title = match[4];
        const displayName = idToName[channelId] || channelId;
        const key = normalizeName(displayName);

        if (!channels.has(key)) {
            channels.set(key, []);
        }
        channels.get(key).push({ start, stop, title });
    }

    epgCache = { channels, idToName };
    lastFetch = now;
    return epgCache;
}

function findChannelKey(epgChannels, requestedName) {
    const requestedNormalized = normalizeName(requestedName);
    if (epgChannels.has(requestedNormalized)) return requestedNormalized;

    const withIt = requestedNormalized + 'it';
    if (epgChannels.has(withIt)) return withIt;

    for (const key of epgChannels.keys()) {
        if (key.startsWith(requestedNormalized)) return key;
    }

    for (const key of epgChannels.keys()) {
        if (requestedNormalized.startsWith(key)) return key;
    }

    return null;
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
        const requestedNormalized = normalizeName(channelName);

        if (req.query.debug === '1') {
            const matchingKeys = [];
            for (const key of epg.channels.keys()) {
                if (key.includes(requestedNormalized) || requestedNormalized.includes(key)) {
                    matchingKeys.push(key);
                }
            }

            const displayNames = Object.values(epg.idToName).filter(name =>
                name.toLowerCase().includes(channelName.toLowerCase())
            );

            return res.status(200).json({
                requested: channelName,
                requestedNormalized,
                totalChannels: epg.channels.size,
                matchingKeys,
                displayNamesMatching: displayNames.slice(0, 10),  // massimo 10 per non esplodere
                sampleChannelKeys: Array.from(epg.channels.keys()).slice(0, 20)  // prime 20 chiavi
            });
        }

        const key = findChannelKey(epg.channels, channelName);
        const programs = key ? (epg.channels.get(key) || []) : [];

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
