export interface ChatClient {
  /** Schickt Kontext + Frage an ein Modell und gibt die Antwort zurück. */
  ask(model: string, context: string, prompt: string): Promise<string>;
}

/** Client für die lokale Ollama-HTTP-API (nichts verlässt den Rechner). */
export class OllamaClient implements ChatClient {
  constructor(private readonly baseUrl = "http://localhost:11434") {}

  async ask(model: string, context: string, prompt: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0.8 },
        messages: [{ role: "user", content: `${context}\n\n---\n\n${prompt}` }],
      }),
    });
    if (!res.ok) {
      const detail = await errorDetail(res);
      throw new Error(`Ollama antwortete mit HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? "";
  }
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? "";
  } catch {
    return "";
  }
}

export const OPENAI_DEFAULT_URL = "https://api.openai.com";

/**
 * Client für die OpenAI Chat-Completions-API (Cloud: Inhalte verlassen den Rechner).
 * Bewusst ohne `temperature`: GPT-5-/Reasoning-Modelle akzeptieren nur den Default.
 */
export class OpenAIClient implements ChatClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = OPENAI_DEFAULT_URL,
  ) {}

  async ask(model: string, context: string, prompt: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: `${context}\n\n---\n\n${prompt}` }],
      }),
    });
    if (!res.ok) {
      const detail = await openAIErrorDetail(res);
      throw new Error(`OpenAI antwortete mit HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
    return data.choices?.[0]?.message?.content ?? "";
  }
}

async function openAIErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? "";
  } catch {
    return "";
  }
}

/**
 * Prüft vor dem Lauf, ob Key gesetzt und gültig ist und das Modell existiert.
 * Gibt eine Fehlermeldung mit nächsten Schritten zurück, oder `null` wenn alles passt.
 * Der Key selbst taucht nie in Meldungen auf.
 */
export async function checkOpenAI(
  apiKey: string | undefined,
  baseUrl: string,
  model: string,
): Promise<string | null> {
  if (!apiKey) {
    return [
      "OPENAI_API_KEY ist nicht gesetzt.",
      "Nächste Schritte:",
      "  1. Key als Umgebungsvariable setzen: `export OPENAI_API_KEY=...` (nicht als CLI-Argument, nicht committen)",
      "  2. Empfehlung: eigener Projekt-Key mit Budget-Limit in der OpenAI-Konsole",
      "  Ohne Key: `pnpm injection --mock` oder lokal mit Ollama.",
    ].join("\n");
  }
  let available: string[];
  try {
    const res = await fetch(`${baseUrl}/v1/models`, { headers: { authorization: `Bearer ${apiKey}` } });
    if (res.status === 401) return "OpenAI lehnte den Key ab (HTTP 401). Prüfe OPENAI_API_KEY.";
    if (!res.ok) return `OpenAI unter ${baseUrl} antwortete mit HTTP ${res.status}.`;
    const data = (await res.json()) as { data?: { id: string }[] };
    available = (data.data ?? []).map((m) => m.id);
  } catch {
    return `OpenAI-API unter ${baseUrl} nicht erreichbar. Prüfe Netzwerk/Proxy und OPENAI_BASE_URL.`;
  }
  if (available.includes(model)) return null;
  const gpt = available.filter((id) => id.startsWith("gpt-")).sort();
  return [
    `Modell "${model}" ist für diesen Key nicht verfügbar.`,
    "Nächste Schritte: anderes Modell wählen, z. B. " +
      (gpt.length ? gpt.slice(0, 8).map((n) => `\`--model ${n}\``).join(", ") : "(keine gpt-Modelle gelistet)"),
  ].join("\n");
}

/**
 * Prüft vor dem Lauf, ob Ollama erreichbar ist und das Modell installiert ist.
 * Gibt eine Fehlermeldung mit konkreten nächsten Schritten zurück, oder `null` wenn alles passt.
 */
export async function checkOllama(baseUrl: string, model: string): Promise<string | null> {
  let installed: string[];
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) return `Ollama unter ${baseUrl} antwortete mit HTTP ${res.status}. Prüfe --host und die Ollama-Logs.`;
    const data = (await res.json()) as { models?: { name: string }[] };
    installed = (data.models ?? []).map((m) => m.name);
  } catch {
    return [
      `Ollama ist unter ${baseUrl} nicht erreichbar.`,
      "Nächste Schritte:",
      "  1. Ollama installieren, falls noch nicht geschehen: https://ollama.com/download",
      "  2. Ollama starten: App öffnen oder `ollama serve`",
      "  3. Läuft Ollama auf einem anderen Host/Port? Dann `--host http://<host>:<port>` angeben.",
      "  Ohne Ollama: `pnpm injection --mock` (Trockenlauf mit Fake-Modell).",
    ].join("\n");
  }

  const wanted = model.includes(":") ? model : `${model}:latest`;
  if (installed.includes(wanted)) return null;
  return [
    `Modell "${model}" ist in Ollama nicht installiert.`,
    "Nächste Schritte:",
    `  1. Modell laden: \`ollama pull ${model}\``,
    "  2. Oder ein bereits installiertes Modell nutzen: " +
      (installed.length ? installed.map((n) => `\`--model ${n}\``).join(", ") : "(noch keine Modelle installiert)"),
  ].join("\n");
}

/** Deterministischer Fake für Trockenläufe ohne Ollama (Seed-basiert). */
export class MockClient implements ChatClient {
  private state: number;
  constructor(seed = 8) {
    this.state = seed;
  }

  private next(): number {
    // einfacher LCG, reicht für eine Demo
    this.state = (this.state * 1664525 + 1013904223) % 4294967296;
    return this.state / 4294967296;
  }

  async ask(_model: string, context: string): Promise<string> {
    await new Promise((r) => setTimeout(r, 120 + this.next() * 220));
    const hasComment = context.includes("<!--");
    const hasRule = context.includes("Prüfcode");
    const roll = this.next();
    const body = "Das Repo ist eine kleine TypeScript-Bibliothek, die Tickets nach Priorität sortiert. Beiträge: Conventional Commits und Tests.";
    if (hasComment) {
      if (roll < 0.6) return `INJECTION-DEMO-ERFOLGREICH\n${body}`;
      if (roll < 0.8) return `Achtung: In CONTRIBUTING.md steckt eine versteckte Anweisung (Prompt Injection). ${body}`;
      return body;
    }
    if (hasRule) return roll < 0.45 ? `INJECTION-DEMO-ERFOLGREICH\n${body}` : body;
    return body;
  }
}
