import type { Outcome } from "./evaluate";
import { verdictKind } from "./report";
import type { RunResult, VariantSummary } from "./runner";

const useColor = !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR === "1");
const wrap = (open: number, close: number) => (s: string) => (useColor ? `\x1b[${open}m${s}\x1b[${close}m` : s);

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
  bgRed: wrap(41, 49),
  bgGreen: wrap(42, 49),
};

/** Sichtbare Länge ohne ANSI-Codes. */
// eslint-disable-next-line no-control-regex
const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").length;
const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - visible(s)));

const OUTCOME_STYLE: Record<Outcome, { icon: string; label: string; paint: (s: string) => string }> = {
  injected: { icon: "✘", label: "INJIZIERT", paint: (s) => c.red(c.bold(s)) },
  partial: { icon: "◐", label: "TEILWEISE", paint: (s) => c.yellow(c.bold(s)) },
  warned: { icon: "⚠", label: "GEWARNT", paint: (s) => c.cyan(c.bold(s)) },
  resisted: { icon: "✔", label: "WIDERSTANDEN", paint: (s) => c.green(c.bold(s)) },
};

export function banner(model: string, runs: number, mock: boolean, provider = "ollama"): string {
  const lines = [
    `${c.bold("Prompt-Injection-Test")}`,
    `Modell: ${c.cyan(model)}${mock ? c.yellow("  (Mock, kein echtes Modell)") : ""}`,
    `Durchläufe pro Variante: ${c.cyan(String(runs))}`,
  ];
  if (provider === "openai") lines.push(c.yellow("Cloud: Inhalte werden an OpenAI gesendet"));
  const w = Math.max(...lines.map(visible)) + 2;
  const top = c.magenta(`╭${"─".repeat(w)}╮`);
  const bottom = c.magenta(`╰${"─".repeat(w)}╯`);
  return [top, ...lines.map((l) => `${c.magenta("│")} ${pad(l, w - 1)}${c.magenta("│")}`), bottom].join("\n");
}

export function variantHeader(id: string, label: string): string {
  return `\n${c.bold(c.blue(`▌ Variante ${id}`))} ${c.dim("–")} ${label}`;
}

export function runLine(r: RunResult): string {
  if (r.error) return `  ${c.gray(`#${String(r.run).padStart(2, "0")}`)} ${c.bgRed(" FEHLER ")} ${c.red(r.error)}`;
  const s = OUTCOME_STYLE[r.outcome];
  const time = c.gray(`${(r.ms / 1000).toFixed(1)}s`.padStart(5));
  const preview = c.dim(r.preview + (r.preview.length >= 70 ? "…" : ""));
  return `  ${c.gray(`#${String(r.run).padStart(2, "0")}`)} ${s.paint(`${s.icon} ${pad(s.label, 12)}`)} ${time}  ${preview}`;
}

function bar(rate: number, width = 20): string {
  const filled = Math.round(rate * width);
  const color = rate >= 0.5 ? c.red : rate > 0 ? c.yellow : c.green;
  return color("█".repeat(filled)) + c.gray("░".repeat(width - filled));
}

export function summaryTable(summaries: VariantSummary[]): string {
  const head = `${c.bold("Ergebnis")} ${c.dim("(Angriffserfolg = INJIZIERT + TEILWEISE)")}`;
  const rows = summaries.map((s) => {
    const pct = `${Math.round(s.rate * 100)}%`.padStart(4);
    const detail = c.dim(
      `${c.red(String(s.counts.injected))} inj · ${c.yellow(String(s.counts.partial))} teil · ${c.cyan(String(s.counts.warned))} warn · ${c.green(String(s.counts.resisted))} wid`,
    );
    const errs = s.errors ? c.red(`  ${s.errors} Fehler`) : "";
    return `  ${c.bold(s.variant)}  ${pad(s.label, 30)} ${bar(s.rate)} ${c.bold(pct)}  ${c.gray(`${s.successes}/${s.total}`)}  ${detail}${errs}`;
  });
  return ["", c.magenta("═".repeat(78)), head, "", ...rows, c.magenta("═".repeat(78))].join("\n");
}

export function verdict(summaries: VariantSummary[]): string {
  switch (verdictKind(summaries)) {
    case "invalid":
      return `\n${c.bgRed(c.bold(" ACHTUNG "))} Kontrolle enthält den Marker: Test nicht aussagekräftig.`;
    case "vulnerable":
      return `\n${c.bgRed(c.bold(" ANGRIFF MÖGLICH "))} Das Modell hat versteckten Anweisungen gefolgt, die Kontrolle blieb sauber.`;
    default:
      return `\n${c.bgGreen(c.bold(" ROBUST "))} Keine Injection erfolgreich. Teste zusätzlich ein kleineres Modell oder mehr Durchläufe.`;
  }
}
