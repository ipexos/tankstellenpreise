# Spritpreise Deutschland — Live-Dashboard 

Ein statisches Dashboard für Benzin- und Dieselpreise in Deutschland, gespeist von der
[Tankerkönig-API](https://creativecommons.tankerkoenig.de). Läuft komplett auf GitHub:
ein Actions-Workflow holt stündlich die Preise, GitHub Pages zeigt das Dashboard an.

## Wie es funktioniert

```
GitHub Actions (stündlich) → scripts/fetch_prices.py → data/latest.json + data/history.json
                                                              ↓
                                              GitHub Pages liest die JSON-Dateien
                                                              ↓
                                                   index.html / app.js zeigt Preise
```

Getrackt werden 12 Großstädte (Berlin, Hamburg, München, Köln, Frankfurt, Stuttgart,
Düsseldorf, Leipzig, Dortmund, Essen, Bremen, Dresden) im 8-km-Umkreis. Anpassbar in
`cities.json`.

## Einrichtung

### 1. API-Key besorgen
Kostenlos registrieren unter **https://creativecommons.tankerkoenig.de/#register**.
Der Key kommt per E-Mail.

### 2. Repository anlegen
Diesen Ordner in ein neues GitHub-Repository pushen, z. B.:

```bash
cd tankerkoenig-dashboard
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<dein-user>/<dein-repo>.git
git push -u origin main
```

### 3. API-Key als Secret hinterlegen
Im Repository: **Settings → Secrets and variables → Actions → New repository secret**
- Name: `TANKERKOENIG_API_KEY`
- Wert: dein API-Key

### 4. GitHub Pages aktivieren
**Settings → Pages → Source: „Deploy from a branch“ → Branch: `main` / `root`**

### 5. Ersten Datenabruf auslösen
**Actions → „Spritpreise aktualisieren“ → Run workflow** (nicht auf den ersten
stündlichen Lauf warten). Nach ein bis zwei Minuten stehen `data/latest.json` und
`data/history.json` mit echten Werten im Repo, und das Dashboard unter
`https://<dein-user>.github.io/<dein-repo>/` zeigt Preise an.

## Anpassen

- **Andere Städte/Regionen:** `cities.json` bearbeiten (Name, `lat`, `lng`, `radius` in km).
- **Update-Frequenz:** Cron-Ausdruck in `.github/workflows/update-prices.yml` ändern.
  Tankerkönig aktualisiert die Quelldaten selbst nur alle ~4 Minuten — häufiger als
  stündlich abzufragen bringt für ein Dashboard i. d. R. keinen Mehrwert und belastet
  unnötig die kostenlose API.
- **Historienlänge:** `HISTORY_MAX_ENTRIES` in `scripts/fetch_prices.py`.

## Lizenz & Attribution

Preisdaten: Tankerkönig Spritpreis-API, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Die Nennung der Quelle im Footer des Dashboards ist Teil der Lizenzbedingungen und sollte
bei Änderungen erhalten bleiben.
