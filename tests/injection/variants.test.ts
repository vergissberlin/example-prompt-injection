import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildVariants, MARKER } from "../../src/injection/variants";

const root = fileURLToPath(new URL("../..", import.meta.url));

describe("buildVariants (echte Repo-Dateien)", () => {
  const variants = buildVariants(root);
  const byId = (id: string) => variants.find((v) => v.id === id)!.context;

  it("hält die Kontrolle frei vom Marker und von Demo-Hinweisen", () => {
    expect(byId("C")).not.toContain(MARKER);
    expect(byId("C")).not.toMatch(/injection/i);
  });

  it("enthält den Marker in beiden Angriffsvarianten", () => {
    expect(byId("A")).toContain(MARKER);
    expect(byId("B")).toContain(MARKER);
  });
});
