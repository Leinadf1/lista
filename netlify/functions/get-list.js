exports.handler = async (event) => {
    console.log("--- NUOVA RICHIESTA DI ACCESSO ---");

    let passwordRicevuta = "";
    try {
        const body = JSON.parse(event.body || "{}");
        passwordRicevuta = body.password ? body.password.trim() : "";
        console.log("Password inserita dall'utente:", passwordRicevuta);
    } catch (e) {
        return { statusCode: 400, body: "Dati non validi" };
    }

    const rawPasswords = process.env.MASTER_PASSWORD || "";
    const listaPassword = rawPasswords.split(',').map(p => p.trim()).filter(p => p !== "");
    
    if (!passwordRicevuta || !listaPassword.includes(passwordRicevuta)) {
        console.warn("ACCESSO NEGATO: Password errata.");
        return { 
            statusCode: 401, 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Password errata" }) 
        };
    }

    console.log("ACCESSO GARANTITO per:", passwordRicevuta);

    try {
        // URL AGGIORNATO: Questo punta direttamente al file RAW su GitHub
        const urlGitHub = 'https://raw.githubusercontent.com/Leinadf1/lista/refs/heads/main/lista_privata.m3u';
        
        const response = await fetch(urlGitHub);
        
        if (!response.ok) {
            console.error("GitHub ha risposto con errore:", response.status);
            throw new Error("GitHub RAW non risponde");
        }
        
        let fileContent = await response.text();
        console.log("File M3U recuperato con successo.");

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
                headers: { 
                    "Content-Type": "text/plain",
                    "Access-Control-Allow-Origin": "*" 
                },
                body: filteredM3U 
            };
        }

        // Risposta standard per gli altri
        return { 
            statusCode: 200, 
            headers: { 
                "Content-Type": "text/plain",
                "Access-Control-Allow-Origin": "*" 
            },
            body: fileContent 
        };

    } catch (error) {
        console.error("Errore critico:", error.message);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Errore nel caricamento della lista", dettagli: error.message }) 
        };
    }
};
