import { describe, expect, it } from "vitest";
import { esc, renderHtmlReport } from "./report-html";
import type { ReportEntry, RunData } from "./report";
import type { VariantSummary } from "./runner";

const summary = (variant: "C" | "A" | "B", successes: number, total = 10): VariantSummary => ({
  variant,
  label: `Variante ${variant}`,
  total,
  successes,
  counts: { injected: successes, partial: 0, warned: 0, resisted: total - successes },
  errors: 0,
  rate: total === 0 ? 0 : successes / total,
});

const data = (model: string, a: number, mock = false, preview = "ok"): RunData => ({
  provider: "ollama",
  model,
  runs: 10,
  mock,
  startedAt: "2026-10-19T12:00:00Z",
  summaries: [summary("C", 0), summary("A", a), summary("B", 0)],
  results: [{ variant: "A", run: 1, outcome: a > 0 ? "injected" : "resisted", ms: 120, preview }],
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

const NOW = "2026-10-19T12:30:00Z";

describe("esc", () => {
  it("maskiert HTML-Sonderzeichen", () => {
    expect(esc(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });
});

describe("renderHtmlReport", () => {
  it("enthält Modelle, Urteile, Heatmap und Links", () => {
    const html = renderHtmlReport([entry("a", 6), entry("b", 0)], NOW);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Angriff möglich");
    expect(html).toContain("Robust");
    expect(html).toContain("<strong>60 %</strong>");
    expect(html).toContain('href="ollama_a.md"');
    expect(html).toContain('src="ollama_a.gif"');
    expect(html).toContain("2 Modelle (2 mit Ergebnis)");
  });

  it("stellt die Kontrolle vor die Angriffsvarianten", () => {
    const html = renderHtmlReport([entry("a", 6)], NOW);
    expect(html.indexOf("C: Variante C")).toBeLessThan(html.indexOf("A: Variante A"));
  });

  it("maskiert Modellausgabe und Modellnamen (kein Markup-Einschleusen)", () => {
    const evil = "<script>alert(1)</script><img src=x onerror=alert(1)>";
    const html = renderHtmlReport([entry("<b>m</b>", 3, { data: data("<b>m</b>", 3, false, evil) })], NOW);
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>m</b>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Content-Security-Policy");
  });

  it("meldet Modelle ohne Daten im Problem-Abschnitt statt abzustürzen", () => {
    const html = renderHtmlReport([entry("c", 0, { data: undefined, exit: null, note: "OPENAI_API_KEY fehlt", gif: false })], NOW);
    expect(html).toContain("Probleme und übersprungene Modelle");
    expect(html).toContain("OPENAI_API_KEY fehlt");
    expect(html).toContain("0 mit Ergebnis");
  });

  it("zeigt den Mock-Hinweis nur bei Mock-Daten", () => {
    expect(renderHtmlReport([entry("m", 3, { data: data("m", 3, true) })], NOW)).toContain("Mock-Werte");
    expect(renderHtmlReport([entry("m", 3)], NOW)).not.toContain("Mock-Werte");
  });

  it("nennt Ausreißer nur bei unterschiedlichen Raten", () => {
    expect(renderHtmlReport([entry("a", 8), entry("b", 0)], NOW)).toContain("Anfälligstes Modell");
    expect(renderHtmlReport([entry("a", 4), entry("b", 4)], NOW)).not.toContain("Auffälligkeiten");
  });
});
