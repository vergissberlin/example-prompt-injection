import { afterEach, describe, expect, it, vi } from "vitest";
import { checkOllama, checkOpenAI, OpenAIClient } from "./client";

const tags = (...names: string[]) =>
  new Response(JSON.stringify({ models: names.map((name) => ({ name })) }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("checkOllama", () => {
  it("erklärt, wie Ollama gestartet wird, wenn der Server nicht erreichbar ist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const msg = await checkOllama("http://localhost:11434", "mistral");
    expect(msg).toContain("nicht erreichbar");
    expect(msg).toContain("ollama serve");
    expect(msg).toContain("--mock");
  });

  it("empfiehlt `ollama pull`, wenn das Modell fehlt, und listet vorhandene Modelle", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tags("llama3:latest")));
    const msg = await checkOllama("http://localhost:11434", "mistral");
    expect(msg).toContain("ollama pull mistral");
    expect(msg).toContain("--model llama3:latest");
  });

  it("akzeptiert ein Modell ohne Tag, wenn :latest installiert ist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tags("mistral:latest")));
    expect(await checkOllama("http://localhost:11434", "mistral")).toBeNull();
  });
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("OpenAIClient", () => {
  it("sendet Auth-Header, Prompt und kein temperature und liest die Antwort", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ choices: [{ message: { content: "hallo" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const answer = await new OpenAIClient("sk-test", "https://api.example").ask("gpt-x", "ctx", "frage");
    expect(answer).toBe("hallo");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-x");
    expect(body.temperature).toBeUndefined();
    expect(body.messages[0].content).toBe("ctx\n\n---\n\nfrage");
  });

  it("wirft bei HTTP-Fehlern mit API-Meldung, ohne den Key zu nennen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "Rate limit" } }, 429)));
    const err = await new OpenAIClient("sk-geheim").ask("m", "c", "p").catch((e: Error) => e);
    expect((err as Error).message).toContain("429");
    expect((err as Error).message).toContain("Rate limit");
    expect((err as Error).message).not.toContain("sk-geheim");
  });
});

describe("checkOpenAI", () => {
  const url = "https://api.openai.com";

  it("erklärt, wie der Key gesetzt wird", async () => {
    const msg = await checkOpenAI(undefined, url, "gpt-4.1-mini");
    expect(msg).toContain("OPENAI_API_KEY");
    expect(msg).toContain("export");
  });

  it("meldet einen abgelehnten Key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 401)));
    expect(await checkOpenAI("sk-x", url, "gpt-4.1-mini")).toContain("401");
  });

  it("schlägt vorhandene gpt-Modelle vor, wenn das Modell fehlt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ data: [{ id: "gpt-4o-mini" }, { id: "whisper-1" }] })));
    const msg = await checkOpenAI("sk-x", url, "gpt-9");
    expect(msg).toContain("--model gpt-4o-mini");
    expect(msg).not.toContain("whisper");
  });

  it("gibt null zurück, wenn alles passt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ data: [{ id: "gpt-4.1-mini" }] })));
    expect(await checkOpenAI("sk-x", url, "gpt-4.1-mini")).toBeNull();
  });
});
