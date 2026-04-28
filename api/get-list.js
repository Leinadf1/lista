import { createClient } from '@vercel/kv';

const CANALI_FISSI = [
    { name: "EUROSPORT 4K", logo: "...", url: "...", drm: '{...}' },
    // ... tutti gli altri Eurosport ...
];

function buildM3U(channel) {
    let out = '';
    out += `#EXTINF:-1 tvg-logo="${channel.logo}" group-title="EUROSPORT",${channel.name}\n`;
    out += `#KODIPROP:inputstream.adaptive.license_key=${channel.drm}\n`;
    out += channel.url + '\n';
    return out;
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

    // Heartbeat: rinnova sessione e termina
    if (req.headers['x-heartbeat'] === 'true') {
        await kv.set(sessionKey, "active", { ex: 45 });
        return res.status(200).json({ status: "ok" });
    }

    // Nuovo accesso: sovrascrive sempre la sessione
    await kv.set(sessionKey, "active", { ex: 45 });

    try {
        // 1. Scarica la lista base da GitHub
        const githubResponse = await fetch(`https://raw.githubusercontent.com/Leinadf1/lista/main/lista_privata.m3u?t=${Date.now()}`, {
            headers: { 
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        const fileContent = await githubResponse.text();

        // 2. Controllo password F1-only (da variabile d'ambiente)
        const f1OnlyPasswords = (process.env.F1_ONLY_PASSWORDS || "").split(',').map(p => p.trim().toLowerCase());
        const isF1Only = f1OnlyPasswords.includes(psw.toLowerCase());

        if (isF1Only) {
            const lines = fileContent.split('\n').map(l => l.trim());
            let filtered = "#EXTM3U\n";
            let targetIdx = -1;

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#EXTINF') && lines[i].toUpperCase().includes("SKY SPORT F1")) {
                    targetIdx = i;
                    break;
                }
            }

            if (targetIdx !== -1) {
                let j = targetIdx - 1;
                let buffer = [];
                while (j >= 0 && lines[j].startsWith('#') && !lines[j].startsWith('#EXTM3U') && !lines[j].startsWith('#EXTINF')) {
                    if (lines[j] !== "") buffer.unshift(lines[j]);
                    j--;
                }
                buffer.forEach(l => filtered += l + "\n");
                filtered += lines[targetIdx] + "\n";
                if (lines[targetIdx + 1]) filtered += lines[targetIdx + 1] + "\n";

                filtered = filtered.split('\n').filter(line => !line.toUpperCase().includes("EUROSPORT")).join('\n');
                return res.status(200).send(filtered);
            }
            return res.status(200).send("#EXTM3U\n");
        }

        // 3. PER GLI ALTRI UTENTI: fetch diretto di DAZN (token fresco!)
        let daznLineare = "";
        try {
            const daznResponse = await fetch(`https://nodrm.online/list/dz1.txt?t=${Date.now()}`);
            if (daznResponse.ok) {
                daznLineare = await daznResponse.text();
                daznLineare = daznLineare.replace("#EXTM3U", "").trim();
            }
        } catch (e) { console.error("Errore DAZN fetch"); }

        // 4. Inserisce DAZN dopo l'ultimo canale Champions League
        let lines = fileContent.split('\n');
        let lastChampionsIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toUpperCase().includes('GROUP-TITLE="CHAMPIONS LEAGUE"')) {
                for (let k = i + 1; k < lines.length; k++) {
                    if (lines[k].trim().startsWith('http')) {
                        lastChampionsIdx = k;
                        break;
                    }
                }
            }
        }

        let finalContent = "";
        if (lastChampionsIdx !== -1) {
            lines.splice(lastChampionsIdx + 1, 0, "\n" + daznLineare + "\n");
            finalContent = lines.join('\n');
        } else {
            finalContent = fileContent + "\n" + daznLineare;
        }

        // 5. Aggiunge gli Eurosport in fondo
        const eurosportM3U = CANALI_FISSI.map(c => buildM3U(c)).join('\n');
        finalContent = finalContent.trimEnd() + "\n" + eurosportM3U;

        res.status(200).send(finalContent);

    } catch (error) {
        res.status(500).json({ error: "Errore caricamento liste" });
    }
}    const authorizedPasswords = (process.env.MASTER_PASSWORD || "").split(',').map(p => p.trim());

    if (!psw || !authorizedPasswords.includes(psw)) {
        return res.status(401).json({ error: "Password errata" });
    }

    const sessionKey = `session_${psw}`;

    // Heartbeat: rinnova sessione e termina
    if (req.headers['x-heartbeat'] === 'true') {
        await kv.set(sessionKey, "active", { ex: 45 });
        return res.status(200).json({ status: "ok" });
    }

    // Nuovo accesso: sovrascrive sempre la sessione
    await kv.set(sessionKey, "active", { ex: 45 });

    try {
        // 1. Scarica la lista base da GitHub
        const githubResponse = await fetch(`https://raw.githubusercontent.com/Leinadf1/lista/main/lista_privata.m3u?t=${Date.now()}`, {
            headers: { 
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        const fileContent = await githubResponse.text();

        // 2. Controllo password F1-only (da variabile d'ambiente)
        const f1OnlyPasswords = (process.env.F1_ONLY_PASSWORD || "").split(',').map(p => p.trim().toLowerCase());
        const isF1Only = f1OnlyPasswords.includes(psw.toLowerCase());

        if (isF1Only) {
            const lines = fileContent.split('\n').map(l => l.trim());
            let filtered = "#EXTM3U\n";
            let targetIdx = -1;

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#EXTINF') && lines[i].toUpperCase().includes("SKY SPORT F1")) {
                    targetIdx = i;
                    break;
                }
            }

            if (targetIdx !== -1) {
                let j = targetIdx - 1;
                let buffer = [];
                while (j >= 0 && lines[j].startsWith('#') && !lines[j].startsWith('#EXTM3U') && !lines[j].startsWith('#EXTINF')) {
                    if (lines[j] !== "") buffer.unshift(lines[j]);
                    j--;
                }
                buffer.forEach(l => filtered += l + "\n");
                filtered += lines[targetIdx] + "\n";
                if (lines[targetIdx + 1]) filtered += lines[targetIdx + 1] + "\n";

                filtered = filtered.split('\n').filter(line => !line.toUpperCase().includes("EUROSPORT")).join('\n');
                return res.status(200).send(filtered);
            }
            return res.status(200).send("#EXTM3U\n");
        }

        // 3. PER GLI ALTRI UTENTI: fetch diretto di DAZN (token fresco!)
        let daznLineare = "";
        try {
            const daznResponse = await fetch(`https://nodrm.online/list/dz1.txt?t=${Date.now()}`);
            if (daznResponse.ok) {
                daznLineare = await daznResponse.text();
                daznLineare = daznLineare.replace("#EXTM3U", "").trim();
            }
        } catch (e) { console.error("Errore DAZN fetch"); }

        // 4. Inserisce DAZN dopo l'ultimo canale Champions League
        let lines = fileContent.split('\n');
        let lastChampionsIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toUpperCase().includes('GROUP-TITLE="CHAMPIONS LEAGUE"')) {
                for (let k = i + 1; k < lines.length; k++) {
                    if (lines[k].trim().startsWith('http')) {
                        lastChampionsIdx = k;
                        break;
                    }
                }
            }
        }

        let finalContent = "";
        if (lastChampionsIdx !== -1) {
            lines.splice(lastChampionsIdx + 1, 0, "\n" + daznLineare + "\n");
            finalContent = lines.join('\n');
        } else {
            finalContent = fileContent + "\n" + daznLineare;
        }

        // 5. Aggiunge gli Eurosport in fondo
        const eurosportM3U = CANALI_FISSI.map(c => buildM3U(c)).join('\n');
        finalContent = finalContent.trimEnd() + "\n" + eurosportM3U;

        res.status(200).send(finalContent);

    } catch (error) {
        res.status(500).json({ error: "Errore caricamento liste" });
    }
}
