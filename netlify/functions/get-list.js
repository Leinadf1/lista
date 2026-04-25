exports.handler = async (event) => {
    // 1. Recupero Password dall'utente
    let passwordRicevuta = "";
    try {
        const body = JSON.parse(event.body || "{}");
        passwordRicevuta = body.password ? body.password.trim() : "";
    } catch (e) {
        return { statusCode: 400, body: "Dati non validi" };
    }

    // 2. Verifica Password autorizzate su Netlify
    const rawPasswords = process.env.MASTER_PASSWORD || "";
    const listaPassword = rawPasswords.split(',').map(p => p.trim()).filter(p => p !== "");
    
    if (!passwordRicevuta || !listaPassword.includes(passwordRicevuta)) {
        return { 
            statusCode: 401, 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Password errata" }) 
        };
    }

    // 3. Recupero file privato da GitHub usando il Token
    try {
        // Indirizzo API per i file contenuti nel repo
        const urlGitHub = 'https://api.github.com/repos/Leinadf1/lista/contents/lista_privata.m3u';
        
        const response = await fetch(urlGitHub, {
            headers: {
                'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw' // Fondamentale per leggere il testo del file
            }
        });
        
        if (!response.ok) {
            console.error("Errore GitHub:", response.status);
            throw new Error("Token non valido o file non trovato");
        }
        
        let fileContent = await response.text();

        // 4. Filtro per Matteo (Solo Sky Sport F1)
        if (passwordRicevuta === 'Matteo') {
            const lines = fileContent.split('\n');
            let filteredM3U = "#EXTM3U\n";
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes("Sky Sport F1")) {
                    // Aggiunge la riga del nome e quella successiva con il link
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

        // 5. Risposta standard per gli altri utenti
        return { 
            statusCode: 200, 
            headers: { 
                "Content-Type": "text/plain",
                "Access-Control-Allow-Origin": "*" 
            },
            body: fileContent 
        };

    } catch (error) {
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Errore caricamento lista", dettagli: error.message }) 
        };
    }
};
