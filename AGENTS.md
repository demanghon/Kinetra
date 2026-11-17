# Kinetra — Agent Instructions & SDD Governance

Kinetra is a real-time golf swing biomechanical and ballistic analysis platform combining an external club-mounted BLE IMU sensor (GeoTrick), synchronized dual-smartphone video capture (Face-On + Down-The-Line), AI club bag onboarding (Bag Scanner), a deterministic 3D ballistic & shaft deflection engine, and a deterministic CI/CD Simulation Harness.

## Spec-Driven Development (SDD) Rules

1. **Zero Application Code Before Spec Sign-Off**: Do not write implementation code in `src/` until all normative specifications in `specs/` and formal data contracts in `schemas/` are validated.
2. **Normative Requirement Traceability (EARS)**: Every functional or physical requirement in `specs/*.md` carries a unique identifier (`REQ-<DOMAIN>-<NNN>`) written in EARS syntax (*When / While / If … the system shall …*) and links to:
   - Its formal data contract in `schemas/*.schema.json`
   - Its deterministic verification scenario in `fixtures/simulation/`
3. **Single Source of Truth for Contracts**: All cross-language payloads (Rust `imu-engine` & `ballistic-core`, TypeScript `video-sync` & `client-app`, Python `bag-scanner`) are governed by JSON Schema Draft 2020-12 files in `schemas/`.

## Agent skills

### Issue tracker

Specs live in `specs/` and implementation tickets live as local markdown files in `specs/tickets/` (and `.scratch/<feature-slug>/` for feature work). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role triage vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`GLOSSARY.md` at the repo root and ADRs in `docs/adr/`). See `docs/agents/domain.md`.
