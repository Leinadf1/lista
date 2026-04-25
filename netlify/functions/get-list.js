exports.handler = async (event) => {
    // 1. LOG DI DEBUG (Vedrai questo nei logs di Netlify)
    console.log("--- NUOVA RICHIESTA DI ACCESSO ---");

    let passwordRicevuta = "";
    try {
        const body = JSON.parse(event.body || "{}");
        passwordRicevuta = body.password ? body.password.trim() : "";
        console.log("Password inserita dall'utente:", passwordRicevuta);
    } catch (e) {
        console.error("Errore parsing JSON:", e);
        return { statusCode: 400, body: "Dati non validi" };
    }

    // 2. RECUPERO E PULIZIA PASSWORDS DA ENVIRONMENT
    const rawPasswords = process.env.MASTER_PASSWORD || "";
    const listaPassword = rawPasswords.split(',').map(p => p.trim()).filter(p => p !== "");
    
    console.log("Password autorizzate caricate (nomi):", listaPassword);

    // 3. CONTROLLO ACCESSO
    if (!passwordRicevuta || !listaPassword.includes(passwordRicevuta)) {
        console.warn("ACCESSO NEGATO: Password non corrispondente.");
        return { 
            statusCode: 401, 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Password errata" }) 
        };
    }

    console.log("ACCESSO GARANTITO per:", passwordRicevuta);

    // 4. RECUPERO LISTA DA GITHUB
    try {
        const response = await fetch('https://raw.githubusercontent.com/Leinadf1/lista/main/lista_privata.m3u');
        if (!response.ok) throw new Error("GitHub RAW non risponde");
        
        let fileContent = await response.text();

        // Filtro speciale per Matteo
        if (passwordRicevuta === 'Matteo') {
            console.log("Applicazione filtro F1 per Matteo");
            const lines = fileContent.split('\n');
            let filteredM3U = "#EXTM3U\n";
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes("Sky Sport F1")) {
                    filteredM3U += lines[i] + "\n" + (lines[i+1] || "") + "\n";
                }
            }
            return { 
                statusCode: 200, 
                headers: { "Content-Type": "text/plain" },
                body: filteredM3U 
            };
        }

        return { 
            statusCode: 200, 
            headers: { "Content-Type": "text/plain" },
            body: fileContent 
        };

    } catch (error) {
        console.error("Errore recupero file M3U:", error);
        return { statusCode: 500, body: "Errore nel caricamento della lista" };
    }
};
