import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderHtmlReport } from "./injection/report-html";
import { parseManifest, renderModelReport, renderSummary, sortEntries, type ReportEntry, type RunData } from "./injection/report";

/** Liest `<base>.json`; fehlt die Datei oder ist sie kaputt, gibt es schlicht kein Ergebnis. */
async function loadData(path: string): Promise<RunData | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as RunData;
  } catch {
    return undefined;
  }
}

async function main() {
  const i = process.argv.indexOf("--dir");
  const dir = resolve(i >= 0 ? (process.argv[i + 1] ?? "recordings") : "recordings");
  const manifest = join(dir, "manifest.tsv");
  if (!existsSync(manifest)) {
    console.error(`Keine ${manifest} gefunden. Zuerst scripts/run-models.sh ausführen.`);
    process.exit(1);
  }

  const rows = sortEntries(parseManifest(await readFile(manifest, "utf8")));
  const entries: ReportEntry[] = [];
  for (const row of rows) {
    entries.push({
      ...row,
      data: await loadData(join(dir, `${row.base}.json`)),
      cast: existsSync(join(dir, `${row.base}.cast`)),
      gif: existsSync(join(dir, `${row.base}.gif`)),
    });
  }

  for (const e of entries) await writeFile(join(dir, `${e.base}.md`), renderModelReport(e));
  const generatedAt = new Date().toISOString();
  await writeFile(join(dir, "summary.md"), renderSummary(entries, generatedAt));
  await writeFile(join(dir, "report.html"), renderHtmlReport(entries, generatedAt));
  console.log(`${entries.length} Berichte, summary.md und report.html in ${dir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
