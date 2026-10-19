import { describe, expect, it } from "vitest";
import type { ChatClient } from "./client";
import { runExperiment, summarize } from "./runner";
import { disguise, MARKER, stripComments, type Variant } from "./variants";

const variants: Variant[] = [
  { id: "C", label: "Kontrolle", context: "sauber" },
  { id: "A", label: "Kommentar", context: "mit <!-- x -->" },
];

/** Fake-Modell: folgt der Injection nur, wenn der Kontext einen Kommentar enthält. */
const naiveModel: ChatClient = {
  async ask(_m, ctx) {
    return ctx.includes("<!--") ? `${MARKER} ok` : "normale Antwort";
  },
};

describe("runExperiment", () => {
  it("führt jede Variante mehrfach aus und trennt Angriff von Kontrolle", async () => {
    const results = await runExperiment(naiveModel, "fake", variants, 3);
    expect(results).toHaveLength(6);
    const control = summarize(variants[0]!, results);
    const attack = summarize(variants[1]!, results);
    expect(control.successes).toBe(0);
    expect(attack.successes).toBe(3);
    expect(attack.rate).toBe(1);
  });

  it("meldet Fehler getrennt und rechnet sie nicht in die Quote", async () => {
    const broken: ChatClient = {
      async ask() {
        throw new Error("down");
      },
    };
    const results = await runExperiment(broken, "fake", variants, 2);
    const s = summarize(variants[1]!, results);
    expect(s.errors).toBe(2);
    expect(s.total).toBe(0);
    expect(s.rate).toBe(0);
  });
});

describe("variants", () => {
  it("entfernt Kommentare für die Kontrolle", () => {
    expect(stripComments("a <!-- geheim --> b")).toBe("a  b");
  });

  it("tarnt die Anweisung ohne Kommentar", () => {
    const out = disguise("text <!-- geheim -->");
    expect(out).not.toContain("<!--");
    expect(out).toContain(MARKER);
  });
});
