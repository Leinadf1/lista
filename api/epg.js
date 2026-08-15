import zlib from 'zlib';
import { promisify } from 'util';
import { XMLParser } from 'fast-xml-parser';

const gunzip = promisify(zlib.gunzip);

let epgCache = null;
let lastFetch = 0;
const CACHE_TTL = 1000 * 60 * 30; // 30 minuti

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
    if (!response.ok) {
        throw new Error(`EPG download failed: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const decompressed = await gunzip(Buffer.from(arrayBuffer));
    const xmlText = decompressed.toString('utf-8');

    // Parsing robusto con fast-xml-parser
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        textNodeName: 'text'
    });
    const json = parser.parse(xmlText);

    const channels = new Map();
    const channelList = json.tv?.channel || [];
    const programmes = json.tv?.programme || [];

    // Mappa id -> display-name
    const idToName = {};
    for (const ch of channelList) {
        const id = ch.id;
        if (!id) continue;
        let displayName = '';
        if (typeof ch['display-name'] === 'string') {
            displayName = ch['display-name'];
        } else if (Array.isArray(ch['display-name'])) {
            displayName = ch['display-name'][0]?.text || '';
        } else if (ch['display-name']?.text) {
            displayName = ch['display-name'].text;
        }
        idToName[id] = displayName || id;
    }

    // Popola i programmi
    for (const prog of programmes) {
        const channelId = prog.channel;
        const start = prog.start;
        const stop = prog.stop;
        const title = typeof prog.title === 'string' ? prog.title : (prog.title?.text || 'Senza titolo');

        if (!channelId || !start || !stop) continue;

        const displayName = idToName[channelId] || channelId;
        const key = normalizeName(displayName);

        if (!channels.has(key)) {
            channels.set(key, []);
        }
        channels.get(key).push({ start, stop, title });
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
        const normalizedRequest = normalizeName(channelName);

        // Cerca la chiave migliore
        let key = null;
        if (epg.channels.has(normalizedRequest)) {
            key = normalizedRequest;
        } else {
            const withIt = normalizedRequest + 'it';
            if (epg.channels.has(withIt)) key = withIt;
            else {
                for (const k of epg.channels.keys()) {
                    if (k.startsWith(normalizedRequest)) {
                        key = k;
                        break;
                    }
                }
            }
        }

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
