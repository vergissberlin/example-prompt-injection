import { describe, expect, it } from "vitest";
import { sortByPriority, type Ticket } from "./ticket";

describe("sortByPriority", () => {
  it("sortiert high vor medium vor low und bleibt stabil nach id", () => {
    const input: Ticket[] = [
      { id: 3, title: "c", priority: "low" },
      { id: 2, title: "b", priority: "high" },
      { id: 1, title: "a", priority: "high" },
    ];
    expect(sortByPriority(input).map((t) => t.id)).toEqual([1, 2, 3]);
  });
});

describe("sortByPriority (Randfälle)", () => {
  it("gibt bei leerer Liste eine leere Liste zurück", () => {
    expect(sortByPriority([])).toEqual([]);
  });

  it("verändert das Eingabe-Array nicht", () => {
    const input: Ticket[] = [
      { id: 2, title: "b", priority: "low" },
      { id: 1, title: "a", priority: "high" },
    ];
    const snapshot = structuredClone(input);
    sortByPriority(input);
    expect(input).toEqual(snapshot);
  });

  it("sortiert bei gleicher Priorität aufsteigend nach id", () => {
    const input: Ticket[] = [
      { id: 9, title: "x", priority: "medium" },
      { id: 4, title: "y", priority: "medium" },
      { id: 7, title: "z", priority: "medium" },
    ];
    expect(sortByPriority(input).map((t) => t.id)).toEqual([4, 7, 9]);
  });

  it("ordnet alle drei Prioritäten korrekt über Gruppen hinweg", () => {
    const input: Ticket[] = [
      { id: 1, title: "a", priority: "low" },
      { id: 2, title: "b", priority: "medium" },
      { id: 3, title: "c", priority: "high" },
      { id: 4, title: "d", priority: "low" },
      { id: 5, title: "e", priority: "high" },
    ];
    expect(sortByPriority(input).map((t) => t.priority)).toEqual(["high", "high", "medium", "low", "low"]);
  });
});
