# Norsk → Italiensk oversetter med audio

Enkel webapp for å oversette norske setninger til italiensk og lage en MP3-fil for språkinnlæring.

---

## Kom i gang

### Steg 1 — Installer Node.js

Gå til [nodejs.org](https://nodejs.org) og last ned LTS-versjonen. Installer den.

Sjekk at det fungerte:
```
node --version
```

### Steg 2 — Installer pnpm

Åpne Terminal og kjør:
```
npm install -g pnpm
```

### Steg 3 — Installer avhengigheter

Naviger til prosjektmappen og kjør:
```
pnpm install
```

### Steg 4 — Legg inn OpenAI API-nøkkel

Åpne filen `.env.local` og lim inn nøkkelen din:
```
OPENAI_API_KEY=sk-din-nøkkel-her
```

Har du ikke en nøkkel? Gå til [platform.openai.com](https://platform.openai.com) og lag en.

### Steg 5 — Start appen

```
pnpm dev
```

### Steg 6 — Åpne i nettleseren

Gå til: [http://localhost:3000](http://localhost:3000)

---

## Bruk fra iPhone

1. Åpne **Notes-appen** på iPhone
2. Kopier norske setninger (én per linje)
3. Åpne appen i **Safari**
4. Lim inn setningene i tekstfeltet
5. Trykk **Generate**
6. Vent mens appen oversetter og lager audio (ca. 15–30 sekunder)
7. Last ned:
   - `italiano.wav` — lydfil for offline bruk
   - `italiensk.txt` — tekstfil med alle oversettelser

**Tips for nedlasting på iPhone:**
- Trykk og hold på nedlastingsknappen → velg "Last ned koblet fil"
- Filen lagres i Filer-appen under Nedlastinger

---

## Slik fungerer audiofilen

For hver setning spilles dette av:
1. Italiensk setning
2. Kort pause
3. Norsk setning
4. Kort pause
5. Italiensk setning igjen
6. Lengre pause

Perfekt for å lære uttale og forståelse.

---

## Deploy til Vercel (gratis)

1. Lag en konto på [vercel.com](https://vercel.com)
2. Installer Vercel CLI:
   ```
   npm install -g vercel
   ```
3. Kjør i prosjektmappen:
   ```
   vercel
   ```
4. Følg instruksjonene i terminalen
5. Legg til miljøvariabel i Vercel-dashboardet:
   - Gå til prosjektet → Settings → Environment Variables
   - Legg til `OPENAI_API_KEY` med verdien din

**Merk:** Gratis Vercel-plan har 10 sekunders timeout på API-kall. Holder for ~5 setninger. For mer, bruk Vercel Pro (ca. $20/mnd) eller kjør lokalt.

### Åpne på iPhone etter deploy

Etter deploy får du en URL som `https://ditt-prosjekt.vercel.app`.
Åpne den i Safari på iPhone — klar til bruk!

---

## Feilsøking

**"Invalid API key"** → Sjekk at OPENAI_API_KEY er riktig i `.env.local`

**"Timeout"** → For mange setninger på én gang. Prøv med færre (maks ~15 lokalt)

**Appen starter ikke** → Sjekk at Node.js og pnpm er installert korrekt
