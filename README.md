# Overzicht

Al je toetsen en opdrachten uit de DSW, overzichtelijk op één plek. Een hulpmiddel voor leerlingen, geen vervanging van de systemen van school.

## Wat het nu kan
- DSW uploaden (PDF, screenshot of geplakte tekst). Claude leest toetsen, opdrachten, stof, weging en vindplaats uit.
- Home: eerstvolgende toets met afteller en afvinklijst, komende toetsen, vakken aan/uit, kaart per vak.
- Opnieuw uploaden laat zien wat er veranderd is sinds de vorige DSW.
- DSW toevoegen via een Google Sheets-link (alle tabbladen), of als PDF, Excel (.xlsx), screenshot of geplakte tekst.
- Met een link wordt de DSW automatisch opnieuw ingelezen als hij ouder is dan 3 dagen (of met "Nu bijwerken").
- Planner: typ wanneer je kunt, de AI maakt een leerschema met leertips. Exporteer alles als .ics naar Google Agenda, of voeg losse blokken toe met één klik.
- Alles wordt alleen in de browser van de leerling opgeslagen.

## Met of zonder AI
Zonder API-key werkt alles gratis:
- Google Sheets-link of Excel-bestand wordt gelezen door een vaste lezer (`src/lib/rooster.ts`): rijen = dagen, kolommen = vakken, cellen met TAAK/SO/PW/PTA.
- De planner werkt met vrije momenten die je aanklikt (`src/lib/regelplanner.ts`).

Zet je `ANTHROPIC_API_KEY` in (lokaal of in Vercel), dan gaan vanzelf aan: PDF's/screenshots/tekst uitlezen, AI-uitlezing voor afwijkende sheets, en de chat-planner.

## Lokaal draaien
```bash
npm install
cp .env.example .env.local   # optioneel: ANTHROPIC_API_KEY voor de AI-functies
npm run dev
```
Open http://localhost:3000 en klik op "Bekijk met voorbeelddata" of upload een DSW.

## Volgende stappen
1. Extractie afstemmen op een echte DSW.
2. Accounts + opslag (Supabase) zodat je op telefoon en laptop dezelfde data ziet.
3. Automatische Google Agenda-sync (OAuth) in plaats van .ics-export.
4. Limiet op aantal uploads per gebruiker (API-kosten).
