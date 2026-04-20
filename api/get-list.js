export default async function handler(req, res) {
  const SOURCE_URL = "https://nodrm.online/list/list2.m3u";
  
  try {
    const response = await fetch(SOURCE_URL, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
      }
    });
    const data = await response.text();
    
    // Questo permette al tuo index.html di leggere i dati senza blocchi CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(data);
  } catch (error) {
    res.status(500).send("Errore server: impossibile scaricare la lista");
  }
}
