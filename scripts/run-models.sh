#!/usr/bin/env bash
# Multi-Modell-Lauf für die Prompt-Injection-Demo (AI Café #008).
#
# Pro Modell: pullen -> Test unter asciinema aufzeichnen -> Modell sofort wieder löschen.
# Läuft strikt sequenziell, damit nie mehr als ein (selbst geladenes) Modell auf der Platte liegt.
# Bereits vorher installierte Modelle werden nie gelöscht.
set -euo pipefail

PROVIDER="ollama"
OPENAI_MODELS="gpt-4.1-nano,gpt-4o-mini,gpt-4.1-mini,gpt-5-mini,gpt-5"
DEFAULT_MODELS="qwen2.5:0.5b,llama3.2:1b,gemma2:2b,llama3.2:3b,phi3:mini,mistral:7b,llama3.1:8b"
MODELS="${MODELS:-}"
RUNS=10
HOST="http://localhost:11434"
OUT="recordings"
KEEP=0
MOCK=0
GIF=1
IDLE=1

usage() {
  cat <<USAGE
Nutzung: scripts/run-models.sh [--provider ollama|openai] [--models "a:1b,b:2b"] [--runs 10] [--host URL] [--out DIR] [--keep] [--mock] [--no-gif] [--idle SEK]

  --provider ollama (Default, lokal) oder openai (Cloud, Key aus Env OPENAI_API_KEY, kein pull/rm)
  --models  Komma-getrennte Modelle (Ollama-Default: $DEFAULT_MODELS, OpenAI-Default: $OPENAI_MODELS, auch via MODELS-Env)
  --runs    Durchläufe pro Variante und Modell (Default: 10)
  --host    Ollama-Host (Default: $HOST)
  --out     Zielordner für .cast-Dateien (Default: recordings)
  --keep    Modelle nach dem Test NICHT löschen
  --mock    Trockenlauf: Fake-Modell, kein pull/rm, kein Ollama nötig
  --no-gif  Keine GIFs aus den Aufzeichnungen erzeugen (Default: GIF pro Modell, wenn agg installiert ist)
  --idle    Pausen im GIF auf max. SEK Sekunden kürzen (Default: $IDLE)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --provider) PROVIDER="${2:?--provider braucht einen Wert}"; shift 2 ;;
    --models) MODELS="${2:?--models braucht einen Wert}"; shift 2 ;;
    --runs) RUNS="${2:?--runs braucht einen Wert}"; shift 2 ;;
    --host) HOST="${2:?--host braucht einen Wert}"; shift 2 ;;
    --out) OUT="${2:?--out braucht einen Wert}"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    --mock) MOCK=1; shift ;;
    --no-gif) GIF=0; shift ;;
    --idle) IDLE="${2:?--idle braucht einen Wert}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ "$PROVIDER" == "ollama" || "$PROVIDER" == "openai" ]] || { echo "--provider muss ollama oder openai sein." >&2; exit 2; }
[[ -n "$MODELS" ]] || { [[ "$PROVIDER" == "openai" ]] && MODELS="$OPENAI_MODELS" || MODELS="$DEFAULT_MODELS"; }
[[ "$IDLE" =~ ^[0-9]+(\.[0-9]+)?$ ]] || { echo "--idle muss eine Zahl (Sekunden) sein." >&2; exit 2; }
[[ "$RUNS" =~ ^[1-9][0-9]*$ ]] || { echo "--runs muss eine positive Zahl sein." >&2; exit 2; }

# Immer relativ zum Projektordner arbeiten, egal von wo das Skript gestartet wird.
cd "$(dirname "${BASH_SOURCE[0]}")/.."
mkdir -p "$OUT"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Fehlt: $1 ($2)" >&2; exit 1; }; }
need asciinema "Installation: https://docs.asciinema.org/manual/cli/installation/"
need pnpm "Installation: https://pnpm.io/installation"
if [[ $MOCK -eq 0 && "$PROVIDER" == "openai" ]]; then
  # Key nur per Env (nie als CLI-Argument, sonst in ps und .cast sichtbar).
  [[ -n "${OPENAI_API_KEY:-}" ]] || { echo "OPENAI_API_KEY ist nicht gesetzt (export OPENAI_API_KEY=...)." >&2; exit 1; }
elif [[ $MOCK -eq 0 ]]; then
  need ollama "Installation: https://ollama.com/download"
  curl -fsS "$HOST/api/tags" >/dev/null 2>&1 \
    || { echo "Ollama unter $HOST nicht erreichbar. Starte es mit \`ollama serve\` oder nutze --host / --mock." >&2; exit 1; }
fi

# GIF ist optional: ohne agg läuft alles wie bisher, es gibt nur eine Warnung.
if [[ $GIF -eq 1 ]] && ! command -v agg >/dev/null 2>&1; then
  echo "Hinweis: agg nicht gefunden, es werden keine GIFs erzeugt (https://github.com/asciinema/agg)." >&2
  GIF=0
fi

# .cast -> .gif. Pausen über --idle-time-limit kappen, statt feste Frames pro Sekunde.
# Ohne echtes Terminal steht im Header Breite/Höhe 0, das agg ablehnt: dann Defaults setzen.
make_gif() {
  local cast="$1" gif="${1%.cast}.gif"
  sed -i -E '1{s/"(width|cols)": *0([,}])/"\1": 100\2/;s/"(height|rows)": *0([,}])/"\1": 30\2/}' "$cast"
  if agg --idle-time-limit "$IDLE" --fps-cap 15 "$cast" "$gif" >/dev/null 2>&1; then
    echo "  GIF: $gif"
  else
    echo "  WARNUNG: GIF aus $cast konnte nicht erzeugt werden." >&2
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

SUMMARY=()
IFS=',' read -r -a MODEL_LIST <<<"$MODELS"

for model in "${MODEL_LIST[@]}"; do
  model="${model// /}"
  [[ -n "$model" ]] || continue
  echo
  echo "=== $model ==="

  status_pull="-"
  if [[ $MOCK -eq 0 && "$PROVIDER" == "ollama" ]]; then
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
        SUMMARY+=("$model|PULL-FEHLER|-|-")
        continue
      fi
    fi
  fi

  slug="${model//[:\/]/_}"
  cast="$OUT/$slug.cast"
  cmd="pnpm injection --provider $PROVIDER --model $(printf %q "$model") --runs $RUNS"
  [[ "$PROVIDER" == "ollama" ]] && cmd+=" --host $(printf %q "$HOST")"
  [[ $MOCK -eq 1 ]] && cmd+=" --mock"

  # Exit-Code des Tests festhalten, aber bei Fehlern trotzdem weitermachen und aufräumen.
  rc=0
  asciinema rec --overwrite --command "$cmd" "$cast" || rc=$?
  [[ $GIF -eq 1 && -s "$cast" ]] && make_gif "$cast"

  cleanup
  if [[ $MOCK -eq 1 || "$PROVIDER" == "openai" ]]; then deleted="-"
  elif [[ $status_pull == "gepullt" && $KEEP -eq 0 ]]; then deleted="ja"
  else deleted="nein"; fi
  SUMMARY+=("$model|exit $rc|$cast|$deleted")
done

echo
echo "=== Zusammenfassung ==="
printf '%-22s %-14s %-9s %s\n' "Modell" "Ergebnis" "Gelöscht" "Aufzeichnung"
for row in "${SUMMARY[@]}"; do
  IFS='|' read -r m r c d <<<"$row"
  printf '%-22s %-14s %-9s %s\n' "$m" "$r" "$d" "$c"
done

# Markdown-Report neben den Aufzeichnungen (wird bei jedem Lauf überschrieben).
REPORT="$OUT/report.md"
{
  echo "# Prompt-Injection-Test: Multi-Modell-Lauf"
  echo
  echo "- Zeitpunkt: $(TZ=Europe/Berlin date '+%Y-%m-%d %H:%M %Z')"
  echo "- Durchläufe pro Variante: $RUNS"
  echo "- Host: $([[ $MOCK -eq 1 ]] && echo "Mock (Fake-Modell)" || { [[ "$PROVIDER" == "openai" ]] && echo "OpenAI API (Cloud)" || echo "$HOST"; })"
  if [[ "$PROVIDER" == "openai" ]]; then echo "- Modelle: Cloud, nichts gepullt oder gelöscht"
  elif [[ $MOCK -eq 1 ]]; then echo "- Modelle: keine gepullt (Mock)"
  else echo "- Selbst gepullte Modelle werden nach dem Test gelöscht: $([[ $KEEP -eq 1 ]] && echo nein || echo ja)"; fi
  echo
  echo "| Modell | Ergebnis | Gelöscht | Aufzeichnung |"
  echo "|---|---|---|---|"
  for row in "${SUMMARY[@]}"; do
    IFS='|' read -r m r c d <<<"$row"
    echo "| \`$m\` | $r | $d | $([[ $c == "-" ]] && echo "-" || echo "\`$c\`") |"
  done
  echo
  echo "Ergebnis \`exit 0\` heißt nur, dass der Test durchlief. Die Auswertung (INJIZIERT, GEWARNT, ...) steht in der jeweiligen Aufzeichnung: \`asciinema play <datei>\`."
} >"$REPORT"

echo
echo "Report:     $REPORT"
echo "Abspielen:  asciinema play $OUT/<modell>.cast"
