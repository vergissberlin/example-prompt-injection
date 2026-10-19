# `run-models.sh`: Multi-Modell-Lauf für die Prompt-Injection-Demo

Testet mehrere lokale Ollama-Modelle nacheinander gegen die harmlose Canary-Injection
(`INJECTION-DEMO-ERFOLGREICH`, siehe [`DEMO.md`](../DEMO.md)). Pro Modell: pullen, Test mit
[asciinema](https://docs.asciinema.org/manual/cli/installation/) aufzeichnen, Modell sofort wieder löschen.
Es liegt nie mehr als ein selbst geladenes Modell auf der Platte, gedacht für Rechner mit wenig Speicher.

## Voraussetzungen

- [Ollama](https://ollama.com/download), läuft (`ollama serve` oder App)
- [asciinema](https://docs.asciinema.org/manual/cli/installation/) (`brew install asciinema` / `sudo apt install asciinema`)
- [pnpm](https://pnpm.io/installation) und einmalig `pnpm install` im Ordner `examples/prompt-injection`

Mit `--mock` brauchst du Ollama nicht, aber weiterhin asciinema und pnpm.

## Schnellstart

```bash
cd examples/prompt-injection
scripts/run-models.sh --mock --runs 2 --models fake      # 1. Trockenlauf
scripts/run-models.sh --models "qwen2.5:0.5b" --runs 2   # 2. kleiner echter Lauf
ollama list                                              #    Modell sollte wieder weg sein
scripts/run-models.sh                                    # 3. voller Lauf (Default-Liste)
```

Ist das Skript nicht ausführbar, starte es mit `bash scripts/run-models.sh ...`.

## Optionen

| Option | Bedeutung | Default |
|---|---|---|
| `--provider ollama\|openai` | `openai`: Cloud-Modelle, kein pull/rm, Key aus Env `OPENAI_API_KEY` (nie als Argument, sonst in `ps` und `.cast` sichtbar) | `ollama` |
| `--models "a:1b,b:2b"` | Komma-getrennte Ollama-Modelle (auch per Env `MODELS`) | siehe unten |
| `--runs N` | Durchläufe pro Variante und Modell | `10` |
| `--host URL` | Ollama-Host | `http://localhost:11434` |
| `--no-gif` | Keine GIFs erzeugen | GIF an (wenn `agg` da ist) |
| `--idle SEK` | Pausen im GIF auf max. SEK Sekunden kürzen | `1` |
| `--out DIR` | Zielordner für Aufzeichnungen und Report | `recordings` |
| `--keep` | Modelle nach dem Test **nicht** löschen | aus |
| `--mock` | Trockenlauf mit Fake-Modell, kein pull/rm, kein Ollama nötig | aus |
| `-h`, `--help` | Hilfe | |

## Ablauf pro Modell

```
installiert? ──ja──> merken: wird NICHT gelöscht
     │ nein
     v
ollama pull ──Fehler──> "PULL-FEHLER", nächstes Modell
     │
     v
asciinema rec  ->  pnpm injection --model <m> --runs N
     │
     v
ollama stop + ollama rm   (nur wenn das Skript es selbst gepullt hat)
```

Am Ende gibt es eine Zusammenfassungstabelle im Terminal und einen Markdown-Report.

## OpenAI-Default-Modelle

Mit `--provider openai`: `gpt-4.1-nano, gpt-4o-mini, gpt-4.1-mini, gpt-5-mini, gpt-5`. Es wird nichts gepullt oder gelöscht, Ollama ist nicht nötig. Die Inhalte gehen an OpenAI (nur harmlose Demo-Dateien).

## Default-Modelle (je < 8 GB)

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

## Ausgabe

- `recordings/<modell>.cast`: Aufzeichnung pro Modell (`:` und `/` im Namen werden zu `_`). Der Pull selbst wird nicht
  aufgezeichnet.
- `recordings/report.md`: Markdown-Report mit Zeitpunkt (Europe/Berlin), Parametern und Tabelle
  (Modell, Ergebnis, gelöscht, Aufzeichnung). Er wird bei jedem Lauf überschrieben. Das Ergebnis `exit 0`
  heißt nur, dass der Test durchlief; INJIZIERT/GEWARNT/... stehen in der Aufzeichnung.
- Der Ordner `recordings/` ist in der `.gitignore`.

```bash
asciinema play recordings/llama3.2_1b.cast
```

### GIFs

Pro Modell entsteht automatisch `recordings/<modell>.gif`, sofern [agg](https://github.com/asciinema/agg) installiert ist
(sonst nur ein Hinweis, der Lauf geht normal weiter). Statt fester Frames pro Sekunde werden Pausen gekürzt:
`--idle SEK` (Default `1`) begrenzt jede Pause ohne Ausgabe auf SEK Sekunden, Tippen und Ausgabe bleiben flüssig.
Mit `--no-gif` wird nichts erzeugt. Nachträglich für bestehende Aufzeichnungen:

```bash
agg --idle-time-limit 1 --fps-cap 15 recordings/llama3.2_1b.cast recordings/llama3.2_1b.gif
```

Entstand eine Aufzeichnung ohne echtes Terminal (CI, Container), steht im Cast-Header `width`/`height` auf `0`, und
`agg` meldet "invalid terminal size". Dann die beiden Werte in der ersten Zeile der `.cast`-Datei setzen, z. B. auf `100` und `30`.

## Sicherheit und Aufräumen

- Gelöscht wird nur, was das Skript selbst gepullt hat; vorhandene Modelle bleiben unangetastet.
- Aufräumen läuft per `trap` auch bei Strg-C, Fehlern und geschlossenem Terminal (EXIT, INT, TERM, HUP).
- Nur der angegebene Ollama-Host wird angesprochen, es werden keine Credentials verwendet.
- Die Injection ist ein harmloser Canary-Text. Für die Demo nie echte Kundendaten oder produktive Konten nutzen.

## Troubleshooting

| Problem | Lösung |
|---|---|
| "Ollama nicht erreichbar" | `ollama serve` starten oder `--host` setzen; zum Testen `--mock` |
| `PULL-FEHLER` in der Tabelle | Modellname/Tag prüfen (`ollama.com/library`); das Skript macht mit dem nächsten Modell weiter |
| Zu wenig Platz | Vor jedem Pull steht der freie Speicher; kleinere Modelle über `--models` wählen |
| Warnung "konnte nicht gelöscht werden" | Manuell `ollama rm <modell>` |
| Fehlt `asciinema` oder `pnpm` | Siehe Voraussetzungen |

## Trade-offs

- **Platz gegen Zeit:** Jeder Lauf lädt das Modell neu, das spart Platte und kostet Bandbreite.
- **Sequenziell statt parallel:** Dauert länger, hält aber den Speicherbedarf bei einem Modell.
- **Ein `.cast` pro Modell:** einzeln abspielbar und teilbar, dafür mehrere Dateien.
