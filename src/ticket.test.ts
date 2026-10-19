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
