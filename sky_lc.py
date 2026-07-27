import requests
import sys
import os
import json

# === CONFIGURAZIONE SUPABASE ===
SUPABASE_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxaGFzZXZneWxmdGx2cWVzbW9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NDQ4ODMsImV4cCI6MjA4ODMyMDg4M30.VpVgQ0x7tCxKRwyqqVW5szEPUUGW0BLEHBh0KAJf7oc"
SUPABASE_URL = "https://liveac.net/sb/rest/v1/events"
CATEGORY_NAME = "SKY ITALIA"          # Categoria da cui prendere i canali
OLD_SKY_FILE = "sky.m3u"             # File già esistente (per preservare i loghi)
OUTPUT_FILE = "sky.m3u"

# Ordine desiderato delle categorie e dei canali
GROUP_ORDER = ["INTRATTENIMENTO", "CINEMA", "SPORT", "BAMBINI"]

CHANNEL_ORDER = {
    "INTRATTENIMENTO": [
        "Sky TG24",
        "Sky Uno",
        "Sky Uno Plus",
        "Sky Atlantic",
        "Sky Serie",
        "Sky Investigation",
        "Sky Collection",
        "Sky Documentaries",
        "Sky Crime",
        "History",
        "Sky Nature",
        "Sky Arte",
        "Sky Adventure",
        "MTV",
        "Comedy Central"
    ],
    "CINEMA": [
        "Sky Cinema Uno",
        "Sky Cinema Collection",
        "Sky Cinema Comedy",
        "Sky Cinema Action",
        "Sky Cinema Stories",
        "Sky Cinema Illumination",
        "Sky Cinema Drama",
        "Sky Cinema Romance",
        "Sky Cinema Suspense"
    ],
    "SPORT": [
        "Sky Sport 24",
        "Sky Sport Uno",
        "Sky Sport F1",
        "Sky Sport Calcio",
        "Sky Sport Tennis",
        "Sky Sport MotoGP",
        "Sky Sport Arena",
        "Sky Sport Max",
        "Sky Sport Basket",
        "Sky Sport Legend",
        "Sky Sport Mix",
        "Sky Sport 251",
        "Sky Sport 252",
        "Sky Sport 253",
        "Sky Sport 254",
        "Sky Sport 255",
        "Sky Sport 256",
        "Sky Sport 257",
        "Sky Sport 258",
        "Sky Sport 259",
        "Sky Sport Golf"
    ],
    "BAMBINI": [
        "Cartoon Network",
        "Nickelodeon",
        "DeAKids",
        "Nick Jr",
        "Boomerang"
    ]
}

def get_all_channels():
    """Recupera tutti i canali da Supabase e restituisce quelli della categoria scelta."""
    headers = {
        "user-agent": "Mozilla/5.0",
        'x-client-info': 'supabase-js-web/2.99.3',
        'apikey': SUPABASE_TOKEN,
        'authorization': 'Bearer ' + SUPABASE_TOKEN
    }
    params = {"select": "*", "order": "title.asc"}
    try:
        r = requests.get(SUPABASE_URL, headers=headers, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"❌ Errore nel recupero canali: {e}", file=sys.stderr)
        sys.exit(1)

    # Filtra per categoria esatta (case‑insensitive)
    filtered = [c for c in data if c.get('category', '').strip().lower() == CATEGORY_NAME.lower()]
    return filtered

def parse_existing_logos(filepath):
    """Legge il vecchio sky.m3u e restituisce un dizionario {nome_canale: logo_url}."""
    logos = {}
    if not os.path.exists(filepath):
        return logos

    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    current_name = None
    for line in lines:
        if line.startswith('#EXTINF:'):
            # Estrae il nome dopo la virgola
            parts = line.split(',', 1)
            if len(parts) == 2:
                current_name = parts[1].strip()
            # Estrae il logo
            match = line.find('tvg-logo="')
            if match != -1:
                start = match + len('tvg-logo="')
                end = line.find('"', start)
                if end != -1:
                    logo = line[start:end]
                    logos[current_name] = logo
    return logos

def determine_group(channel_name):
    """Decide a quale gruppo appartiene un canale in base al nome."""
    name_upper = channel_name.upper()
    if any(w in name_upper for w in ['CINEMA']):
        return 'CINEMA'
    if any(w in name_upper for w in ['SPORT', 'F1', 'MOTOGP', 'BASKET', 'GOLF', 'LEGEND', 'ARENA', 'MAX', 'MIX', 'CALCIO', 'TENNIS']):
        return 'SPORT'
    if any(w in name_upper for w in ['BAMBINI', 'CARTOON', 'NICK', 'BOOMERANG', 'DEAKIDS']):
        return 'BAMBINI'
    return 'INTRATTENIMENTO'

def generate_sky_m3u(channels, old_logos):
    """Crea il file sky.m3u con l'ordine e i loghi corretti."""
    # Raggruppa
    grouped = {g: [] for g in GROUP_ORDER}
    for ch in channels:
        title = ch.get('title', '').strip()
        if not title:
            continue
        group = determine_group(title)
        if group not in grouped:
            group = 'INTRATTENIMENTO'  # fallback
        # Logo: **priorità al logo esistente**, altrimenti usa il nuovo da Supabase
        logo = old_logos.get(title) or ch.get('thumbnail_url', '')
        kids = ch.get('drm_key_id', '')
        keys = ch.get('drm_key', '')
        mpd = ch.get('mpd_url', '')
        grouped[group].append({
            'name': title,
            'logo': logo,
            'kids': kids,
            'keys': keys,
            'mpd': mpd
        })

    # Ordina i canali all'interno di ogni gruppo secondo CHANNEL_ORDER
    for group, order_list in CHANNEL_ORDER.items():
        if group in grouped:
            ordered = []
            for name in order_list:
                for ch in grouped[group]:
                    if ch['name'] == name:
                        ordered.append(ch)
                        break
            grouped[group] = ordered

    # Scrive il file
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write("#EXTM3U\n")
        for group in GROUP_ORDER:
            for ch in grouped.get(group, []):
                f.write(f'#EXTINF:-1 tvg-logo="{ch["logo"]}" group-title="{group}",{ch["name"]}\n')
                if ch['kids'] and ch['keys']:
                    kids_list = [k.strip() for k in ch['kids'].split(',') if k.strip()]
                    keys_list = [k.strip() for k in ch['keys'].split(',') if k.strip()]
                    if len(kids_list) == len(keys_list):
                        license_key = ','.join(f"{kid}:{key}" for kid, key in zip(kids_list, keys_list))
                    else:
                        license_key = f"{ch['kids']}:{ch['keys']}"
                    f.write('#KODIPROP:inputstream.adaptive.manifest_type=mpd\n')
                    f.write('#KODIPROP:inputstream.adaptive.license_type=clearkey\n')
                    f.write(f'#KODIPROP:inputstream.adaptive.license_key={license_key}\n')
                f.write(f'{ch["mpd"]}\n\n')
    print(f"✅ {OUTPUT_FILE} generato con {sum(len(v) for v in grouped.values())} canali.")

if __name__ == "__main__":
    print("📡 Recupero canali da Supabase...")
    channels = get_all_channels()
    if not channels:
        print("❌ Nessun canale trovato.")
        sys.exit(1)
    print(f"📌 Trovati {len(channels)} canali nella categoria '{CATEGORY_NAME}'.")
    old_logos = parse_existing_logos(OLD_SKY_FILE)
    print(f"🔍 Loghi esistenti caricati: {len(old_logos)}")
    generate_sky_m3u(channels, old_logos)
