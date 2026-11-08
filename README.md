# Overzicht

Al je toetsen en opdrachten uit de DSW, overzichtelijk op één plek. Een hulpmiddel voor leerlingen, geen vervanging van de systemen van school.

## Wat het nu kan
- DSW uploaden (PDF, screenshot of geplakte tekst). Claude leest toetsen, opdrachten, stof, weging en vindplaats uit.
- Home: eerstvolgende toets met afteller en afvinklijst, komende toetsen, vakken aan/uit, kaart per vak.
- Opnieuw uploaden laat zien wat er veranderd is sinds de vorige DSW.
- DSW als PDF, Excel (.xlsx), screenshot of geplakte tekst.
- Planner: typ wanneer je kunt, de AI maakt een leerschema met leertips. Exporteer alles als .ics naar Google Agenda, of voeg losse blokken toe met één klik.
- Alles wordt alleen in de browser van de leerling opgeslagen.

## Lokaal draaien
```bash
npm install
cp .env.example .env.local   # zet je ANTHROPIC_API_KEY erin
npm run dev
```
Open http://localhost:3000 en klik op "Bekijk met voorbeelddata" of upload een DSW.

## Volgende stappen
1. Extractie afstemmen op een echte DSW.
2. Accounts + opslag (Supabase) zodat je op telefoon en laptop dezelfde data ziet.
3. Automatische Google Agenda-sync (OAuth) in plaats van .ics-export.
4. Limiet op aantal uploads per gebruiker (API-kosten).
