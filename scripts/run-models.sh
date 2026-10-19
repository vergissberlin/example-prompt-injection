#!/usr/bin/env bash
# Multi-Modell-Lauf für die Prompt-Injection-Demo (AI Café #008).
#
# Phase 1 (Tests):    pro Modell pullen (nur Ollama) -> Test unter asciinema aufzeichnen -> Modell wieder löschen.
# Phase 2 (GIFs):     erst nach ALLEN Tests: .cast -> GIF in fester Breite (Default 1024 px).
# Phase 3 (Berichte): ein Markdown-Bericht pro Aufzeichnung plus summary.md über alle Modelle.
# Läuft strikt sequenziell, damit nie mehr als ein (selbst geladenes) Modell auf der Platte liegt.
# Bereits vorher installierte Modelle werden nie gelöscht.
set -euo pipefail

PROVIDER="all"
OPENAI_DEFAULT_MODELS="gpt-4.1-nano,gpt-4o-mini,gpt-4.1-mini,gpt-5-mini,gpt-5"
DEFAULT_MODELS="qwen2.5:0.5b,llama3.2:1b,gemma2:2b,llama3.2:3b,phi3:mini,mistral:7b,llama3.1:8b"
MODELS="${MODELS:-$DEFAULT_MODELS}"
OPENAI_MODELS="${OPENAI_MODELS:-$OPENAI_DEFAULT_MODELS}"
RUNS=10
HOST="http://localhost:11434"
OUT="recordings"
KEEP=0
MOCK=0
GIF=1
IDLE=1
GIF_WIDTH=1024

usage() {
  cat <<USAGE
Nutzung: scripts/run-models.sh [--provider ollama|openai|all] [--models "a:1b,b:2b"] [--openai-models "gpt-5,..."]
                               [--runs 10] [--host URL] [--out DIR] [--keep] [--mock] [--no-gif] [--idle SEK] [--gif-width PX]

  --provider      ollama (lokal), openai (Cloud) oder all (Default: beide nacheinander).
                  Bei all wird ein nicht verfügbarer Provider (kein Ollama, kein OPENAI_API_KEY) übersprungen.
  --models        Ollama-Modelle, komma-getrennt (Default: $DEFAULT_MODELS, auch via MODELS-Env)
  --openai-models OpenAI-Modelle, komma-getrennt (Default: $OPENAI_DEFAULT_MODELS, auch via OPENAI_MODELS-Env)
  --runs          Durchläufe pro Variante und Modell (Default: 10)
  --host          Ollama-Host (Default: $HOST)
  --out           Zielordner für Aufzeichnungen, Berichte und GIFs (Default: recordings)
  --keep          Ollama-Modelle nach dem Test NICHT löschen
  --mock          Trockenlauf: Fake-Modell, kein pull/rm, weder Ollama noch Key nötig
  --no-gif        Keine GIFs erzeugen (Default: GIF pro Aufzeichnung nach allen Tests, wenn agg installiert ist)
  --idle          Pausen im GIF auf max. SEK Sekunden kürzen (Default: $IDLE)
  --gif-width     Breite der GIFs in Pixeln (Default: $GIF_WIDTH)

Der OpenAI-Key kommt nur aus der Umgebungsvariable OPENAI_API_KEY (nie als Argument, sonst in ps und .cast sichtbar).
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --provider) PROVIDER="${2:?--provider braucht einen Wert}"; shift 2 ;;
    --models) MODELS="${2:?--models braucht einen Wert}"; shift 2 ;;
    --openai-models) OPENAI_MODELS="${2:?--openai-models braucht einen Wert}"; shift 2 ;;
    --runs) RUNS="${2:?--runs braucht einen Wert}"; shift 2 ;;
    --host) HOST="${2:?--host braucht einen Wert}"; shift 2 ;;
    --out) OUT="${2:?--out braucht einen Wert}"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    --mock) MOCK=1; shift ;;
    --no-gif) GIF=0; shift ;;
    --idle) IDLE="${2:?--idle braucht einen Wert}"; shift 2 ;;
    --gif-width) GIF_WIDTH="${2:?--gif-width braucht einen Wert}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ "$PROVIDER" == "ollama" || "$PROVIDER" == "openai" || "$PROVIDER" == "all" ]] \
  || { echo "--provider muss ollama, openai oder all sein." >&2; exit 2; }
[[ "$IDLE" =~ ^[0-9]+(\.[0-9]+)?$ ]] || { echo "--idle muss eine Zahl (Sekunden) sein." >&2; exit 2; }
[[ "$RUNS" =~ ^[1-9][0-9]*$ ]] || { echo "--runs muss eine positive Zahl sein." >&2; exit 2; }
[[ "$GIF_WIDTH" =~ ^[1-9][0-9]*$ ]] || { echo "--gif-width muss eine positive Zahl (Pixel) sein." >&2; exit 2; }

# Immer relativ zum Projektordner arbeiten, egal von wo das Skript gestartet wird.
cd "$(dirname "${BASH_SOURCE[0]}")/.."
mkdir -p "$OUT"

# Jeder Lauf überschreibt die Ergebnisse des vorherigen: Aufzeichnungen samt zugehörigem
# .json/.md/.gif und die Gesamtdateien werden entfernt. Andere Dateien im Ordner bleiben unberührt.
shopt -s nullglob
for old in "$OUT"/*.cast; do rm -f "$old" "${old%.cast}".{json,md,gif}; done
shopt -u nullglob
rm -f "$OUT/manifest.tsv" "$OUT/summary.md"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Fehlt: $1 ($2)" >&2; exit 1; }; }
need asciinema "Installation: https://docs.asciinema.org/manual/cli/installation/"
need pnpm "Installation: https://pnpm.io/installation"

# Gründe, warum ein Provider nicht läuft (leer = alles da). Mock braucht nichts davon.
ollama_problem() {
  [[ $MOCK -eq 1 ]] && return 0
  command -v ollama >/dev/null 2>&1 || { echo "ollama nicht installiert (https://ollama.com/download)"; return 0; }
  curl -fsS "$HOST/api/tags" >/dev/null 2>&1 || echo "Ollama unter $HOST nicht erreichbar (ollama serve, --host oder --mock)"
}
openai_problem() {
  [[ $MOCK -eq 1 ]] && return 0
  [[ -n "${OPENAI_API_KEY:-}" ]] || echo "OPENAI_API_KEY ist nicht gesetzt (export OPENAI_API_KEY=...)"
}

# Bei expliziter Provider-Wahl ist ein fehlendes Setup ein Fehler, bei "all" wird übersprungen.
PROVIDERS=()
SKIPPED=()
for p in ollama openai; do
  [[ "$PROVIDER" == "all" || "$PROVIDER" == "$p" ]] || continue
  problem="$("${p}_problem")"
  if [[ -z "$problem" ]]; then
    PROVIDERS+=("$p")
  elif [[ "$PROVIDER" == "all" ]]; then
    echo "Hinweis: $p wird übersprungen: $problem" >&2
    SKIPPED+=("$p|$problem")
  else
    echo "$problem" >&2
    exit 1
  fi
done

# GIF ist optional: ohne agg oder ohne Werkzeug zum Skalieren läuft alles wie bisher, es gibt nur eine Warnung.
RESIZER=""
if [[ $GIF -eq 1 ]]; then
  if ! command -v agg >/dev/null 2>&1; then
    echo "Hinweis: agg nicht gefunden, es werden keine GIFs erzeugt (https://github.com/asciinema/agg)." >&2
    GIF=0
  elif command -v ffmpeg >/dev/null 2>&1; then RESIZER="ffmpeg"
  elif command -v convert >/dev/null 2>&1; then RESIZER="convert"
  else
    echo "Hinweis: weder ffmpeg noch ImageMagick (convert) gefunden, GIFs können nicht auf ${GIF_WIDTH}px skaliert werden." >&2
    GIF=0
  fi
fi

# Pausen über --idle-time-limit kappen, dann exakt auf GIF_WIDTH skalieren (agg kennt keine Pixelbreite).
# Ohne echtes Terminal steht im Cast-Header Breite/Höhe 0, das agg ablehnt: dann Defaults setzen.
make_gif() {
  local cast="$1" gif="${1%.cast}.gif" raw
  raw="$(mktemp "${gif%.gif}.XXXXXX.gif")"
  sed -i.bak -E '1{s/"(width|cols)": *0([,}])/"\1": 100\2/;s/"(height|rows)": *0([,}])/"\1": 30\2/}' "$cast" && rm -f "$cast.bak"
  if agg --idle-time-limit "$IDLE" --fps-cap 15 "$cast" "$raw" >/dev/null 2>&1 && resize_gif "$raw" "$gif"; then
    echo "  GIF: $gif (${GIF_WIDTH}px)"
  else
    rm -f "$gif"
    echo "  WARNUNG: GIF aus $cast konnte nicht erzeugt werden." >&2
  fi
  rm -f "$raw"
}

resize_gif() {
  local in="$1" out="$2"
  if [[ "$RESIZER" == "ffmpeg" ]]; then
    ffmpeg -v error -y -i "$in" \
      -vf "scale=${GIF_WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" "$out"
  else
    convert "$in" -coalesce -resize "${GIF_WIDTH}x" -layers optimize "$out"
  fi
}

# Das aktuell von DIESEM Skript gepullte Modell; wird per trap auch bei Strg-C/Fehlern aufgeräumt.
PULLED=""
cleanup() {
  [[ -n "$PULLED" ]] || return 0
  local m="$PULLED"
  PULLED=""
  if [[ $KEEP -eq 1 ]]; then
    echo "  [keep] $m bleibt installiert."
    return 0
  fi
  echo "  Räume auf: $m wird gestoppt und gelöscht ..."
  OLLAMA_HOST="$HOST" ollama stop "$m" >/dev/null 2>&1 || true
  OLLAMA_HOST="$HOST" ollama rm "$m" >/dev/null 2>&1 \
    || echo "  WARNUNG: $m konnte nicht gelöscht werden, bitte manuell: ollama rm $m" >&2
}
on_signal() { cleanup; exit 130; }
trap cleanup EXIT
trap on_signal INT TERM HUP

is_installed() {
  local want="$1"
  [[ "$want" == *:* ]] || want="$want:latest"
  OLLAMA_HOST="$HOST" ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -Fxq "$want"
}

free_gb() { df -Pk . | awk 'NR==2 {printf "%d", $4/1024/1024}'; }

# manifest.tsv: Eingabe für `pnpm report` (base, provider, model, exit oder "-", Hinweis).
MANIFEST="$OUT/manifest.tsv"
: >"$MANIFEST"
manifest_row() { printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5" >>"$MANIFEST"; }
slug_of() { local s="${2//[:\/]/_}"; echo "${1}_$s"; }

SUMMARY=()
CASTS=()

run_provider() {
  local provider="$1" list="$2" model slug cast json cmd rc status_pull deleted note
  local -a model_list
  IFS=',' read -r -a model_list <<<"$list"
  for model in "${model_list[@]}"; do
    model="${model// /}"
    [[ -n "$model" ]] || continue
    slug="$(slug_of "$provider" "$model")"
    echo
    echo "=== $model ($provider) ==="

    status_pull="-"
    if [[ $MOCK -eq 0 && "$provider" == "ollama" ]]; then
      if is_installed "$model"; then
        echo "  Bereits installiert, wird nach dem Test NICHT gelöscht."
        status_pull="vorhanden"
      else
        echo "  Freier Speicher: ~$(free_gb) GB. Lade $model ..."
        if OLLAMA_HOST="$HOST" ollama pull "$model"; then
          PULLED="$model"
          status_pull="gepullt"
        else
          echo "  PULL-FEHLER bei $model, überspringe." >&2
          manifest_row "$slug" "$provider" "$model" "-" "Pull-Fehler: Modellname/Tag prüfen"
          SUMMARY+=("$provider|$model|PULL-FEHLER|-|-")
          continue
        fi
      fi
    fi

    cast="$OUT/$slug.cast"
    json="$OUT/$slug.json"
    rm -f "$json"
    cmd="pnpm injection --provider $provider --model $(printf %q "$model") --runs $RUNS --json $(printf %q "$json")"
    [[ "$provider" == "ollama" ]] && cmd+=" --host $(printf %q "$HOST")"
    [[ $MOCK -eq 1 ]] && cmd+=" --mock"

    # Exit-Code des Tests festhalten, aber bei Fehlern trotzdem weitermachen und aufräumen.
    rc=0
    asciinema rec --overwrite --command "$cmd" "$cast" || rc=$?
    CASTS+=("$cast")

    cleanup
    if [[ $MOCK -eq 1 || "$provider" == "openai" ]]; then deleted="-"
    elif [[ $status_pull == "gepullt" && $KEEP -eq 0 ]]; then deleted="ja"
    else deleted="nein"; fi
    note=""
    [[ $rc -eq 0 ]] || note="Testlauf mit Fehler beendet (exit $rc)"
    manifest_row "$slug" "$provider" "$model" "$rc" "$note"
    SUMMARY+=("$provider|$model|exit $rc|$deleted|$cast")
  done
}

# --- Phase 1: Tests ---------------------------------------------------------
for entry in ${SKIPPED[@]+"${SKIPPED[@]}"}; do
  IFS='|' read -r sp reason <<<"$entry"
  if [[ "$sp" == "ollama" ]]; then skipped_list="$MODELS"; else skipped_list="$OPENAI_MODELS"; fi
  IFS=',' read -r -a skipped_models <<<"$skipped_list"
  for m in "${skipped_models[@]}"; do
    m="${m// /}"
    [[ -n "$m" ]] || continue
    manifest_row "$(slug_of "$sp" "$m")" "$sp" "$m" "-" "Übersprungen: $reason"
    SUMMARY+=("$sp|$m|ÜBERSPRUNGEN|-|-")
  done
done

for p in ${PROVIDERS[@]+"${PROVIDERS[@]}"}; do
  if [[ "$p" == "ollama" ]]; then run_provider ollama "$MODELS"; else run_provider openai "$OPENAI_MODELS"; fi
done

# --- Phase 2: GIFs, erst nachdem alle Tests durch sind ----------------------
if [[ $GIF -eq 1 && ${#CASTS[@]} -gt 0 ]]; then
  echo
  echo "=== GIFs (${GIF_WIDTH}px) ==="
  for cast in ${CASTS[@]+"${CASTS[@]}"}; do
    [[ -s "$cast" ]] && make_gif "$cast"
  done
fi

# --- Phase 3: Berichte pro Aufzeichnung und Gesamtzusammenfassung -----------
echo
echo "=== Zusammenfassung ==="
printf '%-8s %-22s %-14s %-9s %s\n' "Anbieter" "Modell" "Ergebnis" "Gelöscht" "Aufzeichnung"
for row in ${SUMMARY[@]+"${SUMMARY[@]}"}; do
  IFS='|' read -r pr m r d c <<<"$row"
  printf '%-8s %-22s %-14s %-9s %s\n' "$pr" "$m" "$r" "$d" "$c"
done

echo
if pnpm --silent report --dir "$OUT"; then
  echo "Zusammenfassung: $OUT/summary.md"
  echo "Berichte:        $OUT/<anbieter>_<modell>.md"
else
  echo "WARNUNG: Berichte konnten nicht erzeugt werden (manuell: pnpm report --dir $OUT)." >&2
fi
echo "Abspielen:       asciinema play $OUT/<anbieter>_<modell>.cast"

# Nichts getestet (alle Provider übersprungen, alle Pulls fehlgeschlagen): nicht als Erfolg melden.
if [[ ${#CASTS[@]} -eq 0 ]]; then
  echo "FEHLER: Es wurde kein Modell getestet, siehe Hinweise oben." >&2
  exit 1
fi
