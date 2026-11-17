# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

## File structure

Single-context repo:

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-sdd-normative-ears-and-json-schema.md
│   └── 0002-rust-wasm-deterministic-physics-core.md
├── specs/
├── schemas/
├── fixtures/simulation/
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in a spec requirement, an issue title, a schema property, or a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding.
