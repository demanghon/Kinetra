# 0002 — Rust (Native + WebAssembly) for Deterministic IMU & Ballistic Core

We select Rust (`rustc 1.92+`) over C++20 for `imu-engine` and `ballistic-core`, compiled both as native libraries (for the Node.js orchestrator and CI Simulation Harness) and as WebAssembly modules (for zero-latency client-side execution and 3D replay).

## Context & Trade-offs

The shaft deflection compensation solver and the 6-DOF aerodynamic ballistic integrator (Magnus lift/drag + spin decay) must produce bit-identical or strictly bounded deterministic outputs across the mobile/web client and the backend CI Simulation Harness. Rust guarantees memory safety without garbage collection pauses and provides first-class `wasm32-unknown-unknown` portability from a single codebase.
