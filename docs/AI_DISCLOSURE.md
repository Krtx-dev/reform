# AI-assisted development disclosure

This project was developed with substantial assistance from an AI coding agent (Anthropic's Claude, running in Claude Code). Working from a detailed product brief written by the team, the agent:

- designed the architecture and wrote the application code, computational core, tests, scripts and documentation in this repository;
- ran the unit, property and end-to-end test suites, the production build and the benchmark script, and inspected the running application in a browser to fix defects.

The team defined the product concept, requirements and constraints, and is responsible for reviewing, running and presenting the work. Benchmark figures in `docs/BENCHMARKS.md` were produced by actually executing `scripts/benchmark.ts`; they were not written by hand.

The running application does **not** use any AI model or external AI service. All optimization, validation and image processing are deterministic algorithms implemented in this repository.
