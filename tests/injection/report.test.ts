import { describe, expect, it } from "vitest";
import { parseManifest, renderModelReport, renderSummary, sortEntries, verdictKind, type ReportEntry, type RunData } from "../../src/injection/report";
import type { VariantSummary } from "../../src/injection/runner";

const summary = (variant: "C" | "A" | "B", successes: number, total = 10): VariantSummary => ({
  variant,
  label: `Variante ${variant}`,
  total,
  successes,
  counts: { injected: successes, partial: 0, warned: 0, resisted: total - successes },
  errors: 0,
  rate: total === 0 ? 0 : successes / total,
});

const data = (model: string, a: number, mock = false): RunData => ({
  provider: "ollama",
  model,
  runs: 10,
  mock,
  startedAt: "2026-10-19T12:00:00Z",
  summaries: [summary("C", 0), summary("A", a), summary("B", 0)],
  results: [],
});

const entry = (model: string, a: number, extra: Partial<ReportEntry> = {}): ReportEntry => ({
  base: `ollama_${model}`,
  provider: "ollama",
  model,
  exit: 0,
  note: "",
  data: data(model, a),
  cast: true,
  gif: true,
  ...extra,
});

describe("verdictKind", () => {
  it("bewertet erst die Kontrolle, dann den Angriff", () => {
    expect(verdictKind([summary("C", 1), summary("A", 5)])).toBe("invalid");
    expect(verdictKind([summary("C", 0), summary("A", 5)])).toBe("vulnerable");
    expect(verdictKind([summary("C", 0), summary("A", 0)])).toBe("robust");
    expect(verdictKind([summary("C", 0, 0), summary("A", 0, 0)])).toBe("no-result");
  });
});

describe("renderModelReport", () => {
  it("enthält Tabelle, Urteil und Links", () => {
    const md = renderModelReport(entry("mistral", 6));
    expect(md).toContain("# Bericht: mistral (ollama)");
    expect(md).toContain("| A: Variante A | 60 % (6/10) |");
    expect(md).toContain("Angriff möglich");
    expect(md).toContain("![Aufzeichnung](ollama_mistral.gif)");
  });

  it("meldet fehlende Daten statt abzustürzen", () => {
    const md = renderModelReport(entry("x", 0, { data: undefined, exit: null, note: "Pull-Fehler", gif: false }));
    expect(md).toContain("Kein Ergebnis");
    expect(md).toContain("nicht ausgeführt");
    expect(md).toContain("Pull-Fehler");
  });

  it("warnt bei Mock-Werten", () => {
    expect(renderModelReport(entry("fake", 3, { data: data("fake", 3, true) }))).toContain("Mock-Werte");
  });
});

describe("renderSummary", () => {
  it("listet alle Modelle, Ausreißer und Probleme", () => {
    const md = renderSummary(
      [entry("a", 8), entry("b", 0), entry("c", 0, { data: undefined, exit: null, note: "OPENAI_API_KEY fehlt" })],
      "2026-10-19T12:30:00Z",
    );
    expect(md).toContain("Modelle: 3 (2 mit Ergebnis)");
    expect(md).toContain("Anfälligstes Modell: `a`");
    expect(md).toContain("Robustestes Modell: `b`");
    expect(md).toContain("`c` (ollama): OPENAI_API_KEY fehlt");
    expect(md).toContain("[Bericht](ollama_a.md)");
  });

  it("stellt die Kontrolle vor die Angriffsvarianten", () => {
    const md = renderSummary([entry("a", 8)], "2026-10-19T12:30:00Z");
    expect(md).toContain("| Anbieter | Modell | Variante C | Variante A | Variante B |");
  });

  it("rendert eine gültige Tabelle, wenn kein Modell Ergebnisse hat", () => {
    const md = renderSummary([entry("a", 0, { data: undefined, exit: null, note: "übersprungen" })], "2026-10-19T12:30:00Z");
    expect(md).toContain("| Anbieter | Modell | Urteil | Bericht | GIF |\n| --- | --- | --- | --- | --- |");
  });

  it("nennt keinen Ausreißer, wenn alle Raten gleich sind", () => {
    const md = renderSummary([entry("a", 4), entry("b", 4)], "2026-10-19T12:30:00Z");
    expect(md).not.toContain("Auffälligkeiten");
  });
});

describe("parseManifest", () => {
  it("liest Zeilen, ignoriert Müll und versteht '-' als nicht ausgeführt", () => {
    const rows = parseManifest("ollama_a\tollama\ta:1b\t0\t\nopenai_g\topenai\tgpt-5\t-\tübersprungen\nkaputt\n\n");
    expect(rows).toEqual([
      { base: "ollama_a", provider: "ollama", model: "a:1b", exit: 0, note: "" },
      { base: "openai_g", provider: "openai", model: "gpt-5", exit: null, note: "übersprungen" },
    ]);
  });
});

describe("sortEntries", () => {
  it("sortiert erst Ollama, dann OpenAI, je vom kleinsten zum fähigsten Modell", () => {
    const m = (provider: string, model: string) => ({ provider, model });
    const sorted = sortEntries([
      m("openai", "gpt-5.5"),
      m("ollama", "mixtral:8x7b"),
      m("openai", "gpt-4o-mini"),
      m("ollama", "qwen2.5:0.5b"),
      m("openai", "gpt-5"),
      m("ollama", "unbekannt:1b"),
      m("openai", "gpt-5.4-mini"),
    ]);
    expect(sorted.map((e) => e.model)).toEqual([
      "qwen2.5:0.5b",
      "mixtral:8x7b",
      "unbekannt:1b",
      "gpt-4o-mini",
      "gpt-5.4-mini",
      "gpt-5",
      "gpt-5.5",
    ]);
  });
});
