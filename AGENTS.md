# AGENTS.md

Hinweise für Coding-Agents und Mitwirkende.

## Workflow: Trunk-Based Development

- Es gibt nur einen langlebigen Branch: `main` (der Trunk).
- Änderungen gehen direkt in `main`, **ohne Pull Requests**.
- Commits klein halten und häufig integrieren, `main` bleibt immer lauffähig.
- Vor jedem Push lokal prüfen: `pnpm test` und `pnpm lint`.
- Keine langlebigen Branches. Wird ausnahmsweise ein kurzlebiger Branch gebraucht (z. B. in einer Agent-Session), gilt die Namenskonvention unten.

## Branch-Namen

- Schema: `<kategorie>/<kurze-beschreibung>`, kleingeschrieben, Wörter mit Bindestrich (z. B. `feature/ui-tests`, `bugfix/verdict-no-result`).
- Kategorien analog zu Conventional Commits:
  - `feature/`: neue Funktion (Commit-Typ `feat:`)
  - `bugfix/`: Fehlerbehebung (`fix:`)
  - `docs/`: Dokumentation (`docs:`)
  - `test/`: Tests (`test:`)
  - `chore/`: Wartung, Tooling, Abhängigkeiten (`chore:`)
  - `refactor/`: Umbau ohne Verhaltensänderung (`refactor:`)
- Keine Tool- oder Agent-Präfixe wie `claude/` im Branch-Namen.

## Commits

- Claude Code (oder andere Agents) nicht als Co-Autor eintragen: keine `Co-Authored-By`-Zeilen in Commit-Messages.

## Befehle

```bash
pnpm install
pnpm test
pnpm lint
```

## Struktur

- `src/ticket.ts`: Sortierlogik
- `tests/`: Tests (spiegeln die Struktur von `src/`)
- `CONTRIBUTING.md`: Hinweise für Mitwirkende
