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
        "Sky TG24", "Sky Uno", "Sky Uno Plus", "Sky Atlantic", "Sky Serie",
        "Sky Investigation", "Sky Collection", "Sky Documentaries", "Sky Crime",
        "History", "Sky Nature", "Sky Arte", "Sky Adventure", "MTV", "Comedy Central"
    ],
    "CINEMA": [
        "Sky Cinema Uno", "Sky Cinema Collection", "Sky Cinema Comedy", "Sky Cinema Action",
        "Sky Cinema Stories", "Sky Cinema Illumination", "Sky Cinema Drama", "Sky Cinema Romance",
        "Sky Cinema Suspense"
    ],
    "SPORT": [
        "Sky Sport 24", "Sky Sport Uno", "Sky Sport F1", "Sky Sport Calcio", "Sky Sport Tennis",
        "Sky Sport MotoGP", "Sky Sport Arena", "Sky Sport Max", "Sky Sport Basket",
        "Sky Sport Legend", "Sky Sport Mix", "Sky Sport 251", "Sky Sport 252", "Sky Sport 253",
        "Sky Sport 254", "Sky Sport 255", "Sky Sport 256", "Sky Sport 257", "Sky Sport 258",
        "Sky Sport 259", "Sky Sport Golf"
    ],
    "BAMBINI": [
        "Cartoon Network", "Nickelodeon", "DeAKids", "Nick Jr", "Boomerang"
    ]
}

# Normalizzazione dei nomi solo per uniformare l'aspetto (opzionale)
NAME_NORMALIZATION = {
    "sky tg24": "Sky TG24", "sky uno": "Sky Uno", "sky uno +": "Sky Uno Plus",
    "sky uno plus": "Sky Uno Plus", "sky atlantic": "Sky Atlantic", "sky serie": "Sky Serie",
    "sky investigation": "Sky Investigation", "sky collection": "Sky Collection",
    "sky documentaries": "Sky Documentaries", "sky crime": "Sky Crime", "history": "History",
    "sky nature": "Sky Nature", "sky arte": "Sky Arte", "sky adventure": "Sky Adventure",
    "mtv": "MTV", "comedy central": "Comedy Central", "sky cinema uno": "Sky Cinema Uno",
    "sky cinema collection": "Sky Cinema Collection", "sky cinema comedy": "Sky Cinema Comedy",
    "sky cinema action": "Sky Cinema Action", "sky cinema stories": "Sky Cinema Stories",
    "sky cinema illumination": "Sky Cinema Illumination", "sky cinema family": "Sky Cinema Illumination",
    "sky cinema drama": "Sky Cinema Drama", "sky cinema romance": "Sky Cinema Romance",
    "sky cinema suspense": "Sky Cinema Suspense", "sky sport 24": "Sky Sport 24",
    "sky sport uno": "Sky Sport Uno", "sky sport f1": "Sky Sport F1",
    "sky sport calcio": "Sky Sport Calcio", "sky sport tennis": "Sky Sport Tennis",
    "sky sport motogp": "Sky Sport MotoGP", "sky sport arena": "Sky Sport Arena",
    "sky sport max": "Sky Sport Max", "sky sport basket": "Sky Sport Basket",
    "sky sport legend": "Sky Sport Legend", "sky sport mix": "Sky Sport Mix",
    "sky sport 251": "Sky Sport 251", "sky sport 252": "Sky Sport 252",
    "sky sport 253": "Sky Sport 253", "sky sport 254": "Sky Sport 254",
    "sky sport 255": "Sky Sport 255", "sky sport 256": "Sky Sport 256",
    "sky sport 257": "Sky Sport 257", "sky sport 258": "Sky Sport 258",
    "sky sport 259": "Sky Sport 259", "sky sport golf": "Sky Sport Golf",
    "cartoon network": "Cartoon Network", "nickelodeon": "Nickelodeon",
    "deakids": "DeAKids", "nick jr": "Nick Jr", "boomerang": "Boomerang"
}

def normalize_name(name):
    """Restituisce il nome normalizzato, se presente nel dizionario."""
    key = name.strip().lower()
    return NAME_NORMALIZATION.get(key, name.strip())

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

def parse_existing_channels(filepath):
    """
    Legge il vecchio sky.m3u e restituisce un dizionario CASE‑INSENSITIVE:
    { nome_in_minuscolo: { 'logo': ..., 'group': ..., 'name': ..., 'url': ..., 'drm': ... } }
    """
    channels = {}
    if not os.path.exists(filepath):
        return channels

    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith('#EXTINF:'):
            # Estrai nome
            name_match = line.split(',', 1)
            name = name_match[1].strip() if len(name_match) > 1 else ""
            # Estrai logo
            logo = ""
            logo_match = line.find('tvg-logo="')
            if logo_match != -1:
                start = logo_match + len('tvg-logo="')
                end = line.find('"', start)
                if end != -1:
                    logo = line[start:end]
            # Estrai gruppo
            group = "INTRATTENIMENTO"
            group_match = line.find('group-title="')
            if group_match != -1:
                start = group_match + len('group-title="')
                end = line.find('"', start)
                if end != -1:
                    group = line[start:end]

            # Cerca le righe KODIPROP e l'URL
            drm = {}
            url = ""
            i += 1
            while i < len(lines) and not lines[i].strip().startswith('http'):
                kodiline = lines[i].strip()
                if kodiline.startswith('#KODIPROP:inputstream.adaptive.license_key='):
                    val = kodiline.split('=', 1)[1]
                    try:
                        drm = json.loads(val)
                    except:
                        if ':' in val:
                            k, v = val.split(':', 1)
                            drm = {k.strip(): v.strip()}
                        else:
                            drm = {}
                i += 1
            if i < len(lines) and lines[i].strip().startswith('http'):
                url = lines[i].strip()

            if name and url:
                # Chiave case‑insensitive (minuscolo)
                key = normalize_name(name).lower()
                channels[key] = {
                    'logo': logo,
                    'group': group,
                    'name': name,          # Nome originale
                    'url': url,
                    'drm': json.dumps(drm) if drm else ''
                }
        else:
            i += 1

    return channels

def determine_group(channel_name):
    name_upper = channel_name.upper()
    if any(w in name_upper for w in ['CINEMA']): return 'CINEMA'
    if any(w in name_upper for w in ['SPORT', 'F1', 'MOTOGP', 'BASKET', 'GOLF', 'LEGEND', 'ARENA', 'MAX', 'MIX', 'CALCIO', 'TENNIS']): return 'SPORT'
    if any(w in name_upper for w in ['BAMBINI', 'CARTOON', 'NICK', 'BOOMERANG', 'DEAKIDS']): return 'BAMBINI'
    return 'INTRATTENIMENTO'

def generate_sky_m3u(supabase_channels, existing_channels):
    """Crea il file sky.m3u preservando TUTTI i loghi esistenti (case‑insensitive)."""
    grouped = {g: [] for g in GROUP_ORDER}

    for ch in supabase_channels:
        title = ch.get('title', '').strip()
        if not title: continue
        normalized_title = normalize_name(title)
        group = determine_group(normalized_title)

        # Cerchiamo nel dizionario esistente in modo case‑insensitive
        existing_key = normalized_title.lower()
        if existing_key in existing_channels:
            # Canale già presente: mantieni logo, nome e gruppo originali
            old = existing_channels[existing_key]
            grouped[group].append({
                'name': old['name'],
                'logo': old['logo'],   # LOGO ORIGINALE – MAI SOSTITUITO
                'kids': ch.get('drm_key_id', ''),
                'keys': ch.get('drm_key', ''),
                'mpd': ch.get('mpd_url', '')
            })
        else:
            # Canale NUOVO: aggiungilo SENZA logo (logo vuoto)
            grouped[group].append({
                'name': normalized_title,
                'logo': '',            # NESSUN LOGO
                'kids': ch.get('drm_key_id', ''),
                'keys': ch.get('drm_key', ''),
                'mpd': ch.get('mpd_url', '')
            })

    # Ordina i canali secondo CHANNEL_ORDER
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
    supabase_channels = get_all_channels()
    if not supabase_channels:
        print("❌ Nessun canale trovato.")
        sys.exit(1)
    print(f"📌 Trovati {len(supabase_channels)} canali nella categoria '{CATEGORY_NAME}'.")
    existing_channels = parse_existing_channels(OLD_SKY_FILE)
    print(f"🔍 Canali esistenti caricati: {len(existing_channels)}")
    generate_sky_m3u(supabase_channels, existing_channels)
