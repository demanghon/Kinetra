# Issue tracker: Local Markdown (Git-Versioned)

Issues, system specifications, and implementation tickets for Kinetra are versioned directly in Git as markdown files.

## Conventions

- System-wide normative specifications live in `specs/00-architecture.md` through `specs/06-api-contracts.md`.
- Tracer-bullet implementation tickets live one file per ticket at `specs/tickets/<NN>-<slug>.md` (or `.scratch/<feature-slug>/issues/<NN>-<slug>.md` for isolated feature spikes), numbered from `01`, never a single combined tickets file.
- Triage state is recorded as a `Status:` line near the top of each ticket file (see `triage-labels.md` for the role strings).
- Blocking edges are recorded as `Blocked by: NN, NN` near the top of each ticket file.
- Comments and conversation history append to the bottom of the file under a `## Comments` heading.

## When a skill says "publish to the issue tracker"

Create or update the corresponding spec file in `specs/` or ticket file under `specs/tickets/` (or `.scratch/<feature-slug>/`).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path in `specs/tickets/` or `.scratch/`.
