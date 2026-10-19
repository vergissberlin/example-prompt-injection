import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkOllama,
  checkOpenAI,
  MockClient,
  OllamaClient,
  OPENAI_DEFAULT_URL,
  OpenAIClient,
  type ChatClient,
} from "./injection/client";
import { runExperiment, summarize } from "./injection/runner";
import { banner, c, runLine, summaryTable, variantHeader, verdict } from "./injection/ui";
import { buildVariants } from "./injection/variants";

type Provider = "ollama" | "openai";

function parseArgs(argv: string[]) {
  const opts = {
    model: undefined as string | undefined,
    runs: 10,
    mock: false,
    host: undefined as string | undefined,
    provider: "ollama" as Provider,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--model") opts.model = argv[++i] ?? opts.model;
    else if (a === "--runs") opts.runs = Math.max(1, Number(argv[++i]) || opts.runs);
    else if (a === "--host") opts.host = argv[++i] ?? opts.host;
    else if (a === "--provider") {
      const p = argv[++i];
      if (p !== "ollama" && p !== "openai") {
        console.error(`Unbekannter Provider "${p}". Erlaubt: ollama, openai.`);
        process.exit(2);
      }
      opts.provider = p;
    } else if (a === "--mock") opts.mock = true;
    else if (a === "--help" || a === "-h") {
      console.log("Nutzung: pnpm injection [--provider ollama|openai] [--model mistral] [--runs 10] [--host http://localhost:11434] [--mock]");
      console.log("OpenAI: OPENAI_API_KEY als Env setzen, Default-Modell gpt-4.1-mini, optional OPENAI_BASE_URL.");
      process.exit(0);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const variants = buildVariants(root);
  const openai = opts.provider === "openai";
  const model = opts.model ?? (openai ? "gpt-4.1-mini" : "mistral");
  const host = opts.host ?? (openai ? (process.env.OPENAI_BASE_URL ?? OPENAI_DEFAULT_URL) : "http://localhost:11434");
  const apiKey = process.env.OPENAI_API_KEY;
  const client: ChatClient = opts.mock
    ? new MockClient()
    : openai
      ? new OpenAIClient(apiKey ?? "", host)
      : new OllamaClient(host);

  console.log(banner(model, opts.runs, opts.mock, opts.mock ? "mock" : opts.provider));

  // Vorab prüfen, statt 30 identische Fehlerzeilen auszugeben.
  if (!opts.mock) {
    const problem = openai ? await checkOpenAI(apiKey, host, model) : await checkOllama(host, model);
    if (problem) {
      console.error(`\n${c.bgRed(c.bold(" VORAUSSETZUNG FEHLT "))}\n${c.red(problem)}`);
      process.exit(1);
    }
  }

  let current = "";
  const results = await runExperiment(client, model, variants, opts.runs, (r) => {
    if (r.variant !== current) {
      current = r.variant;
      const v = variants.find((x) => x.id === r.variant);
      console.log(variantHeader(r.variant, v?.label ?? ""));
    }
    console.log(runLine(r));
  });

  // Alle Läufe fehlgeschlagen: kein "ROBUST"-Urteil ausgeben, das wäre irreführend.
  if (results.every((r) => r.error)) {
    console.error(c.red(`\nAlle Läufe sind fehlgeschlagen (erster Fehler: ${results[0]?.error}).`));
    console.error(c.red(openai
        ? "Prüfe OPENAI_API_KEY, Modellname und Netzwerk, oder nutze --mock für einen Trockenlauf."
        : "Prüfe, ob Ollama läuft und das Modell geladen ist, oder nutze --mock für einen Trockenlauf."));
    process.exit(1);
  }

  const summaries = variants.map((v) => summarize(v, results));
  console.log(summaryTable(summaries));
  console.log(verdict(summaries));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
