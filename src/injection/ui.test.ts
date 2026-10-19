import { describe, expect, it } from "vitest";
import type { RunResult, VariantSummary } from "./runner";
import { banner, runLine, summaryTable, variantHeader, verdict } from "./ui";

// ANSI-Codes entfernen, damit die Tests unabhängig von TTY/NO_COLOR laufen.
// eslint-disable-next-line no-control-regex
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

const result = (over: Partial<RunResult> = {}): RunResult => ({
  variant: "A",
  run: 1,
  outcome: "resisted",
  ms: 1500,
  preview: "kurze Vorschau",
  ...over,
});

const summary = (over: Partial<VariantSummary> = {}): VariantSummary => ({
  variant: "A",
  label: "Testvariante",
  total: 4,
  successes: 0,
  counts: { injected: 0, partial: 0, warned: 0, resisted: 4 },
  errors: 0,
  rate: 0,
  ...over,
});

describe("banner", () => {
  it("zeigt Modell und Durchläufe in einem Rahmen", () => {
    const lines = plain(banner("llama3", 5, false)).split("\n");
    expect(lines[0]).toMatch(/^╭─+╮$/);
    expect(lines.at(-1)).toMatch(/^╰─+╯$/);
    expect(lines.join("\n")).toContain("Modell: llama3");
    expect(lines.join("\n")).toContain("Durchläufe pro Variante: 5");
  });

  it("markiert den Mock-Modus", () => {
    expect(plain(banner("mock", 1, true))).toContain("Mock, kein echtes Modell");
    expect(plain(banner("llama3", 1, false))).not.toContain("Mock");
  });

  it("warnt nur beim Provider openai vor dem Cloud-Versand", () => {
    expect(plain(banner("gpt", 1, false, "openai"))).toContain("Inhalte werden an OpenAI gesendet");
    expect(plain(banner("llama3", 1, false))).not.toContain("OpenAI");
  });

  it("hat in allen Zeilen die gleiche sichtbare Breite", () => {
    const widths = plain(banner("ein-ziemlich-langer-modellname", 3, true)).split("\n").map((l) => [...l].length);
    expect(new Set(widths).size).toBe(1);
  });
});

describe("variantHeader", () => {
  it("enthält ID und Label", () => {
    expect(plain(variantHeader("B", "Versteckter Kommentar"))).toContain("Variante B – Versteckter Kommentar");
  });
});

describe("runLine", () => {
  it("zeigt Laufnummer, Label, Dauer und Vorschau", () => {
    const line = plain(runLine(result({ run: 3, outcome: "injected", ms: 2340 })));
    expect(line).toContain("#03");
    expect(line).toContain("✘ INJIZIERT");
    expect(line).toContain("2.3s");
    expect(line).toContain("kurze Vorschau");
  });

  it.each([
    ["injected", "INJIZIERT"],
    ["partial", "TEILWEISE"],
    ["warned", "GEWARNT"],
    ["resisted", "WIDERSTANDEN"],
  ] as const)("beschriftet %s als %s", (outcome, label) => {
    expect(plain(runLine(result({ outcome })))).toContain(label);
  });

  it("hängt bei langer Vorschau (>= 70 Zeichen) eine Ellipse an", () => {
    expect(plain(runLine(result({ preview: "x".repeat(70) })))).toContain("x".repeat(70) + "…");
    expect(plain(runLine(result({ preview: "x".repeat(69) })))).not.toContain("…");
  });

  it("zeigt bei Fehlern FEHLER und die Meldung statt des Ergebnisses", () => {
    const line = plain(runLine(result({ error: "Timeout", outcome: "injected" })));
    expect(line).toContain("FEHLER");
    expect(line).toContain("Timeout");
    expect(line).not.toContain("INJIZIERT");
  });
});

describe("summaryTable", () => {
  it("rendert eine Zeile pro Variante mit Quote und Zählern", () => {
    const out = plain(
      summaryTable([
        summary({ variant: "A", successes: 2, rate: 0.5, counts: { injected: 1, partial: 1, warned: 1, resisted: 1 } }),
        summary({ variant: "C", label: "Kontrolle" }),
      ]),
    );
    expect(out).toContain("Ergebnis");
    expect(out).toContain("50%");
    expect(out).toContain("2/4");
    expect(out).toContain("1 inj · 1 teil · 1 warn · 1 wid");
    expect(out).toContain("Kontrolle");
    expect(out).toContain("0%");
  });

  it("zeigt Fehler nur an, wenn welche aufgetreten sind", () => {
    expect(plain(summaryTable([summary({ errors: 2 })]))).toContain("2 Fehler");
    expect(plain(summaryTable([summary()]))).not.toContain("Fehler");
  });

  it("füllt den Balken proportional zur Rate", () => {
    const out = plain(summaryTable([summary({ rate: 0.5 })]));
    expect(out).toContain("█".repeat(10) + "░".repeat(10));
  });
});

describe("verdict", () => {
  it("meldet ANGRIFF MÖGLICH, wenn nur eine Angriffsvariante erfolgreich ist", () => {
    const out = plain(verdict([summary({ variant: "A", successes: 1, rate: 0.25 }), summary({ variant: "C" })]));
    expect(out).toContain("ANGRIFF MÖGLICH");
  });

  it("meldet ACHTUNG, wenn die Kontrolle den Marker enthält", () => {
    expect(plain(verdict([summary({ variant: "C", successes: 1, rate: 0.25 })]))).toContain("ACHTUNG");
  });

  it("meldet ROBUST, wenn keine Injection erfolgreich war", () => {
    expect(plain(verdict([summary({ variant: "A" }), summary({ variant: "C" })]))).toContain("ROBUST");
  });
});
