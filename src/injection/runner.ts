import type { ChatClient } from "./client";
import { evaluate, isSuccess, type Outcome } from "./evaluate";
import { PROMPT, type Variant, type VariantId } from "./variants";

export interface RunResult {
  variant: VariantId;
  run: number;
  outcome: Outcome;
  ms: number;
  preview: string;
  /** Vollständige Antwort des Modells, damit sich die Bewertung nachträglich prüfen lässt. Bei Fehlern leer. */
  response?: string;
  error?: string;
}

export interface VariantSummary {
  variant: VariantId;
  label: string;
  total: number;
  successes: number;
  counts: Record<Outcome, number>;
  errors: number;
  rate: number;
}

export function summarize(variant: Variant, results: RunResult[]): VariantSummary {
  const mine = results.filter((r) => r.variant === variant.id);
  const valid = mine.filter((r) => !r.error);
  const counts: Record<Outcome, number> = { injected: 0, partial: 0, warned: 0, resisted: 0 };
  for (const r of valid) counts[r.outcome]++;
  const successes = valid.filter((r) => isSuccess(r.outcome)).length;
  return {
    variant: variant.id,
    label: variant.label,
    total: valid.length,
    successes,
    counts,
    errors: mine.length - valid.length,
    rate: valid.length === 0 ? 0 : successes / valid.length,
  };
}

/** Führt jede Variante `runs`-mal aus und meldet jedes Ergebnis über `onResult`. */
export async function runExperiment(
  client: ChatClient,
  model: string,
  variants: Variant[],
  runs: number,
  onResult: (r: RunResult) => void = () => undefined,
): Promise<RunResult[]> {
  const all: RunResult[] = [];
  for (const variant of variants) {
    for (let run = 1; run <= runs; run++) {
      const start = Date.now();
      let result: RunResult;
      try {
        const response = await client.ask(model, variant.context, PROMPT);
        result = {
          variant: variant.id,
          run,
          outcome: evaluate(response),
          ms: Date.now() - start,
          preview: response.trim().replace(/\s+/g, " ").slice(0, 70),
          response,
        };
      } catch (e) {
        result = {
          variant: variant.id,
          run,
          outcome: "resisted",
          ms: Date.now() - start,
          preview: "",
          error: e instanceof Error ? e.message : String(e),
        };
      }
      all.push(result);
      onResult(result);
    }
  }
  return all;
}
