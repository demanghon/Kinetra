# 0001 — Normative EARS Specifications & JSON Schema Draft 2020-12 as Single Source of Truth

We adopt an integrated Spec-Driven Development (SDD) workflow where system specifications in `specs/*.md` use EARS syntax with traceable requirement IDs (`REQ-<DOMAIN>-<NNN>`), and all cross-language data contracts live in `schemas/*.schema.json` (JSON Schema Draft 2020-12).

## Context & Trade-offs

Kinetra spans Rust (`imu-engine`, `ballistic-core`), TypeScript (`video-sync`, `sim-harness`, `client-app`), and Python (`bag-scanner`), while `protoc`/`buf` are not required on the base host and `fixtures/simulation/` datasets must be human-auditable and directly validated in CI. JSON Schema Draft 2020-12 provides a single canonical contract format from which Rust (`serde`/`schemars`), TypeScript, and Python (`pydantic`) types and validators can be derived without binary compiler lock-in, while raw BLE GATT packet layouts are specified at the byte level in `specs/01-hardware-imu-shaft.md`.
