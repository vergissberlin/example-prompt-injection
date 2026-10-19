# AGENTS.md

Hinweise für Coding-Agents und Mitwirkende.

## Workflow: Trunk-Based Development

- Es gibt nur einen langlebigen Branch: `main` (der Trunk).
- Änderungen gehen direkt in `main`, **ohne Pull Requests**.
- Commits klein halten und häufig integrieren, `main` bleibt immer lauffähig.
- Vor jedem Push lokal prüfen: `pnpm test` und `pnpm lint`.
- Keine Feature-Branches und keine langlebigen Branches.

## Befehle

```bash
pnpm install
pnpm test
pnpm lint
```

## Struktur

- `src/ticket.ts`: Sortierlogik
- `docs/CONTRIBUTING.md`: Hinweise für Mitwirkende
