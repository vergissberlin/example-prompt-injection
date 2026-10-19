# `run-models.sh`: Multi-Modell-Lauf für die Prompt-Injection-Demo

Testet mehrere **Ollama-Modelle (lokal) und OpenAI-Modelle (Cloud)** nacheinander gegen die harmlose Canary-Injection
(`INJECTION-DEMO-ERFOLGREICH`, siehe [`DEMO.md`](../docs/DEMO.md)). Jeder Test wird mit
[asciinema](https://docs.asciinema.org/manual/cli/installation/) aufgezeichnet. Nach **allen** Tests entstehen
GIFs (Full HD, 1920 px breit), ein Bericht pro Aufzeichnung und eine Gesamtzusammenfassung.
Selbst gepullte Ollama-Modelle werden sofort wieder gelöscht: Es liegt nie mehr als eins auf der Platte.

## Voraussetzungen

- [asciinema](https://docs.asciinema.org/manual/cli/installation/) (`brew install asciinema` / `sudo apt install asciinema`)
- [pnpm](https://pnpm.io/installation) und einmalig `pnpm install` im Projektordner
- Für Ollama-Modelle: [Ollama](https://ollama.com/download), läuft (`ollama serve` oder App)
- Für OpenAI-Modelle: `OPENAI_API_KEY` als Umgebungsvariable
- Für GIFs (optional): [agg](https://github.com/asciinema/agg) **und** `ffmpeg` (oder ImageMagick `convert`) zum Skalieren

Mit `--mock` brauchst du weder Ollama noch Key, aber weiterhin asciinema und pnpm.

## Schnellstart

```bash
scripts/run-models.sh --mock --runs 2                    # 1. Trockenlauf, beide Provider, ohne Modelle/Key
scripts/run-models.sh --provider ollama --models "qwen2.5:0.5b" --runs 2   # 2. kleiner echter Lauf
export OPENAI_API_KEY=...                                # nur als Env, nie als Argument
scripts/run-models.sh                                    # 3. voller Lauf: Ollama- und OpenAI-Liste
```

Ist das Skript nicht ausführbar, starte es mit `bash scripts/run-models.sh ...`.

## Optionen

| Option | Bedeutung | Default |
|---|---|---|
| `--provider ollama\|openai\|all` | `all` testet erst Ollama, dann OpenAI. Bei `all` wird ein nicht verfügbarer Provider (kein Ollama, kein Key) **übersprungen** und in der Zusammenfassung vermerkt; bei `ollama`/`openai` ist das ein Fehler | `all` |
| `--models "a:1b,b:2b"` | Ollama-Modelle, komma-getrennt (auch per Env `MODELS`) | siehe unten |
| `--openai-models "gpt-5,..."` | OpenAI-Modelle (auch per Env `OPENAI_MODELS`) | siehe unten |
| `--runs N` | Durchläufe pro Variante und Modell | `10` |
| `--host URL` | Ollama-Host | `http://localhost:11434` |
| `--no-gif` | Keine GIFs erzeugen | GIF an (wenn `agg` und `ffmpeg`/`convert` da sind) |
| `--gif-width PX` | Breite der GIFs in Pixeln (Full HD für Vollbild-Präsentationen) | `1920` |
| `--gif-cols N` | Terminalbreite im GIF in Spalten; schneidet ungenutzten Platz des Aufnahmefensters ab | `120` |
| `--gif-rows N` | Terminalhöhe im GIF in Zeilen; 120x30 passt grob zu 16:9 | `30` |
| `--hold SEK` | Letztes Bild so lange halten, bevor das GIF von vorn startet | `5` |
| `--idle SEK` | Pausen im GIF auf max. SEK Sekunden kürzen | `1` |
| `--out DIR` | Zielordner für Aufzeichnungen, Berichte und GIFs | `recordings` |
| `--keep` | Ollama-Modelle nach dem Test **nicht** löschen | aus |
| `--mock` | Trockenlauf mit Fake-Modell, kein pull/rm, weder Ollama noch Key nötig | aus |
| `-h`, `--help` | Hilfe | |

## Ablauf

```
Phase 1  Tests      pro Modell: [ollama pull] -> asciinema rec -> pnpm injection ... --json -> [ollama rm]
Phase 2  GIFs       erst wenn ALLE Tests durch sind: .cast -> agg -> auf 1920 px skalieren -> .gif
Phase 3  Berichte   pnpm report: ein .md pro Aufzeichnung + summary.md + report.html über alle Modelle
```

Pro Ollama-Modell: ist es schon installiert, wird es nie gelöscht. Schlägt ein Pull fehl, steht `PULL-FEHLER` in der
Zusammenfassung und das Skript macht mit dem nächsten Modell weiter. OpenAI-Modelle werden weder gepullt noch gelöscht.

## Ausgabe

Dateinamen sind `<anbieter>_<modell>` (`:` und `/` im Modellnamen werden zu `_`), z. B. `ollama_llama3.2_1b`.

| Datei | Inhalt |
|---|---|
| `<anbieter>_<modell>.cast` | Aufzeichnung (`asciinema play <datei>`). Der Pull selbst wird nicht aufgezeichnet |
| `<anbieter>_<modell>.json` | Strukturierte Ergebnisse des Laufs (Quelle für die Berichte, kein Key darin) |
| `<anbieter>_<modell>.md` | **Bericht pro Aufzeichnung**: Anbieter, Zeitpunkt (Europe/Berlin), Ergebnis je Variante, Urteil, Links |
| `<anbieter>_<modell>.gif` | GIF der Aufzeichnung, 1920 px breit (Default) |
| `summary.md` | **Zusammenfassung nach allen Tests**: Tabelle aller Modelle mit Quote je Variante, anfälligstes/robustestes Modell, übersprungene Modelle und Fehler |
| `report.html` | **HTML-Bericht** (eine selbstenthaltene Datei, im Browser öffnen): Kennzahlen, Heatmap Modelle × Varianten, Details je Modell mit Beispielantworten und GIF, Probleme, Methodik |
| `manifest.tsv` | Liste der Läufe (Basisname, Anbieter, Modell, Exit-Code, Hinweis) für `pnpm report` |

Jeder Lauf **überschreibt** die Ergebnisse des vorherigen: Zu Beginn werden alle `.cast`-Dateien im Zielordner samt zugehörigem `.json`/`.md`/`.gif` sowie `manifest.tsv`, `summary.md` und `report.html` gelöscht. Andere Dateien im Ordner bleiben unberührt. Willst du Ergebnisse behalten, kopiere den Ordner vorher weg oder nutze ein anderes `--out`.

Der Ordner `recordings/` ist eingecheckt (nicht in der `.gitignore`), damit der GitHub-Workflow die Ergebnisse committen kann. Exit `0` heißt nur, dass der Test durchlief; das Urteil (Angriff möglich,
robust, ...) steht im Bericht. Das Skript endet mit Exit `1`, wenn gar kein Modell getestet wurde.

Berichte lassen sich aus vorhandenen Ergebnissen jederzeit neu erzeugen:

```bash
pnpm report --dir recordings
```

### GIFs

`agg` kennt keine Pixelbreite. Deshalb rendert das Skript auf eine feste Terminalgröße (`--gif-cols`/`--gif-rows`, unabhängig von
deiner Fenstergröße beim Aufnehmen, ungenutzter Platz wird abgeschnitten), wählt die Schriftgröße so, dass das Rohbild schon
breit genug ist, und skaliert danach mit `ffmpeg` (Palette + Lanczos) oder ersatzweise ImageMagick exakt auf `--gif-width`. So bleibt die Schrift scharf.
Ist die Ausgabe länger als `--gif-rows`, scrollen die oberen Zeilen aus dem Bild; das letzte Bild zeigt dann das Ende mit der Auswertung. Mehr Zeilen (`--gif-rows 40`) zeigen mehr, machen die Schrift bei Vollbild aber kleiner. Fehlt `agg` oder ein Skalierwerkzeug, gibt es nur einen Hinweis und der Lauf geht normal weiter.
Pausen werden über `--idle SEK` gekürzt, Tippen und Ausgabe bleiben flüssig. Von Hand für eine bestehende Aufzeichnung:

```bash
agg --cols 120 --rows 30 --font-size 27 --idle-time-limit 1 --last-frame-duration 5 --fps-cap 15 recordings/ollama_llama3.2_1b.cast /tmp/raw.gif
ffmpeg -i /tmp/raw.gif -vf "scale=1920:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" recordings/ollama_llama3.2_1b.gif
```

Entstand eine Aufzeichnung ohne echtes Terminal (CI, Container), steht im Cast-Header `width`/`height` auf `0`, und `agg`
meldet "invalid terminal size". Das Skript setzt dann automatisch `100` und `30`.

## Default-Modelle

**Ollama** (je < 8 GB):

| Modell | Größe (ca.) |
|---|---|
| `qwen2.5:0.5b` | 0,4 GB |
| `llama3.2:1b` | 1,3 GB |
| `gemma2:2b` | 1,6 GB |
| `llama3.2:3b` | 2,0 GB |
| `phi3:mini` | 2,2 GB |
| `mistral:7b` | 4,1 GB |
| `llama3.1:8b` | 4,9 GB |

Die Größen sind Schätzwerte (quantisierte Standard-Tags) und nicht gegen die Registry geprüft; vor dem Lauf auf
[ollama.com/library](https://ollama.com/library) nachsehen. Die 7B/8B-Modelle brauchen grob 6 bis 8 GB RAM.
Insgesamt werden etwa 17 GB geladen, weil jedes Modell neu gezogen wird.

**OpenAI**: `gpt-4.1-nano, gpt-4o-mini, gpt-4.1-mini, gpt-5-mini, gpt-5, gpt-5.4, gpt-5.4-mini, gpt-5.5`. Bei 10 Durchläufen sind das 240 Requests.
Die Inhalte gehen an OpenAI (nur harmlose Demo-Dateien).

## In GitHub Actions

Der Workflow [`injection.yml`](../.github/workflows/injection.yml) startet das Skript manuell (Actions > Injection-Test > Run workflow, nur von `main` aus) und committet `recordings/` danach nach `main`.

| Eingabe | Bedeutung | Default |
|---|---|---|
| `provider` | `ollama`, `openai` oder `all` | `ollama` |
| `models` | Ollama-Modelle, komma-getrennt (leer = Skript-Default) | `qwen2.5:0.5b,llama3.2:1b,gemma2:2b` |
| `openai_models` | OpenAI-Modelle, komma-getrennt (leer = Skript-Default) | `gpt-4.1-nano,gpt-4o-mini,gpt-4.1-mini,gpt-5.4,gpt-5.4-mini,gpt-5.5` |
| `runs` | Durchläufe pro Variante und Modell | `5` |
| `mock` | Trockenlauf mit Fake-Modell, wird **nicht** gepusht | aus |

- **GitHub Pages:** Nach einem echten Lauf (nicht `mock`) veröffentlicht der Job `deploy-pages` `recordings/` mit `report.html` als Startseite. Einmalig Settings > Pages > Source = **GitHub Actions** setzen.
- **OpenAI:** braucht das Repo-Secret `OPENAI_API_KEY` (Settings > Secrets and variables > Actions). Es wird nur als Env an den Test-Step gereicht. Die Demo-Inhalte gehen an OpenAI, und es entstehen Kosten. Am besten einen eigenen Key mit Ausgabenlimit nutzen. Bei `provider=all` ohne Secret wird OpenAI übersprungen.
- **Runner:** Standard-Runner haben keine GPU. In öffentlichen Repos sind es 4 vCPU, 16 GB RAM und 14 GB Platte (laut GitHub-Doku), in privaten weniger. Deshalb nur kleine Ollama-Modelle als Default; 7B/8B laufen auf CPU sehr langsam.
- **Terminal:** Der Runner hat kein TTY, der Workflow startet das Skript deshalb in einem Pseudo-Terminal (`script`) mit 120x30 Zeichen.
- **Push:** Der Commit geht direkt nach `main`. Verbietet eine Branch Protection Bot-Pushes, schlägt der Schritt fehl. Die Recordings liegen dann als Artifact `recordings` am Lauf.
- **Versionen:** `ollama` und `agg` sind im Workflow fest gepinnt (`agg` mit SHA256), Renovate pflegt nur die Actions.

## Sicherheit und Aufräumen

- Gelöscht wird nur, was das Skript selbst gepullt hat; vorhandene Modelle bleiben unangetastet.
- Aufräumen läuft per `trap` auch bei Strg-C, Fehlern und geschlossenem Terminal (EXIT, INT, TERM, HUP).
- Der OpenAI-Key kommt nur aus der Umgebung (`OPENAI_API_KEY`). Als Argument stünde er in `ps` und in der `.cast`-Datei.
  Empfehlung: eigener Projekt-Key mit Budget-Limit. Er landet weder in `.json` noch in den Berichten.
- Die Injection ist ein harmloser Canary-Text. Für die Demo nie echte Kundendaten oder produktive Konten nutzen.

## Troubleshooting

| Problem | Lösung |
|---|---|
| "Übersprungen: ollama nicht installiert / nicht erreichbar" | `ollama serve` starten oder `--host` setzen; zum Testen `--mock` |
| "Übersprungen: OPENAI_API_KEY ist nicht gesetzt" | `export OPENAI_API_KEY=...` oder `--provider ollama` |
| `PULL-FEHLER` in der Tabelle | Modellname/Tag prüfen (`ollama.com/library`); das Skript macht mit dem nächsten Modell weiter |
| Zu wenig Platz | Vor jedem Pull steht der freie Speicher; kleinere Modelle über `--models` wählen |
| Warnung "konnte nicht gelöscht werden" | Manuell `ollama rm <modell>` |
| Keine GIFs | `agg` und `ffmpeg` (oder `convert`) installieren |
| Fehlt `asciinema` oder `pnpm` | Siehe Voraussetzungen |

## Trade-offs

- **Platz gegen Zeit:** Jeder Lauf lädt das Modell neu, das spart Platte und kostet Bandbreite.
- **Sequenziell statt parallel:** Dauert länger, hält aber den Speicherbedarf bei einem Modell.
- **GIFs erst am Ende:** Bei einem Abbruch mitten im Lauf entstehen keine GIFs, die `.cast`-Dateien bleiben und lassen sich nachträglich umwandeln.
- **Ein `.cast` und ein Bericht pro Modell:** einzeln abspielbar und teilbar, dafür mehrere Dateien; die Gesamtsicht liefert `summary.md`.
- **Cloud kostet:** OpenAI-Läufe verursachen Kosten und senden Inhalte an einen Dritten; deshalb nur Demo-Dateien und ein Key mit Budget-Limit.
