# Technical implementation

This document describes the current implementation of Learning in Chaos for contributors. It separates the running system from the product plans in [README.md](README.md). For detailed gameplay and simulation coefficients, see [DEVELOPMENT.md](DEVELOPMENT.md); for production deployment, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Run and verify

The project is an npm workspace. Use Node.js 24 and npm 11:

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run build
```

Vite prints the local web address, normally `http://127.0.0.1:5173`. The build writes static assets to `dist/`. The browser game runs without the analytics service.

To run analytics locally, set `ANALYTICS_ADMIN_PASSWORD` in the shell and start `npm run dev:analytics` in a separate terminal. The default API address is `http://127.0.0.1:3001/api`, and its dashboard is at `/api/dashboard`. Run its integration tests with `npm --workspace @learning-in-chaos/analytics run test:integration`. Browser tests require Playwright's Chromium; see [DEVELOPMENT.md](DEVELOPMENT.md) for installation and `npm run test:e2e`.

## Context and boundaries

The game teaches incident investigation using simulated systems, rather than connecting to real infrastructure. It currently includes three incidents, guided and free investigation modes, structured interventions, and postmortems. The interface and scenario content are in Brazilian Portuguese. Players do not need accounts.

The simulation is browser-local. The optional analytics service stores usage events and feedback; it is not a game-state server and does not validate or replay runs. The system does not execute player code or operate real databases and services. The README also contains proposed features that should not be assumed to exist.

## System components

```text
Browser
  React interface ── commands ──> Web Worker ──> simulation engine
       │                         │                    │
       │                         └── observations, replay record, report
       ├── localStorage: saved run and analytics retry data
       └── HTTP: optional analytics and feedback
                                      │
                              NestJS analytics API ──> SQLite
```

| Component | Responsibility | Entry point |
| --- | --- | --- |
| Web application | Investigation UI, time controls, local persistence, analytics and feedback clients | `apps/web/src/App.tsx` |
| Worker boundary | Serializes commands and returns player-facing snapshots; the worker owns the active run | `apps/web/src/session.ts`, `apps/web/src/simulation.worker.ts` |
| Simulation engine | State transitions, timed events, observations, interventions, replay and reports; no DOM, network or filesystem | `packages/sim-engine/src/index.ts` |
| Scenario definitions | Declarative incident data, validated with Zod and exposed through a catalog | `packages/scenarios/src/index.ts`, `packages/scenario-schema/src/index.ts` |
| Educational content | Intervention descriptions, availability, costs and durations | `packages/educational-content/src/index.ts` |
| Analytics service | Session and event ingestion, feedback and authenticated administrative reads | `apps/analytics/src/app.module.ts` |

## Run lifecycle and simulation

1. The player selects a scenario, investigation mode and seed. The interface sends a `start` command to the worker.
2. The worker creates the run and returns an observation and replay record. Commands are matched to responses by request ID; errors reject the corresponding client promise.
3. Browser timers request simulated time advancement. The engine processes its ordered event queue, including one-second workload samples. Intervention completions precede samples at the same simulated time. Browser timer throttling can slow playback; the application does not catch up based on wall-clock time.
4. Investigation commands expose the available metrics, logs, query plans and session details. Free mode requires installing optional instrumentation for some detail. These restrictions are enforced at the engine/worker boundary, not only by the UI.
5. Interventions take simulated time and only one intervention or instrumentation change can be pending. Target eligibility is checked before decisions are recorded. The player can pause, change playback speed or advance time manually.
6. Recovery requires p95 below 800 ms and errors below 1% for 60 consecutive simulated seconds, with no change pending. A run can also be ended early and is limited to 60 simulated minutes. The worker returns the postmortem after the run ends.

The model uses a bounded fluid queue for database work, endpoint traffic and query costs to estimate demand, queueing, failures and latency. It approximates global p95 from endpoint distributions, rather than simulating individual requests. Costs accrue with simulated time. Scenario-specific workload, interventions and authored evidence shape each incident. Query plans are educational templates, not real SQL execution or PostgreSQL measurements. See [simulation model and limits](DEVELOPMENT.md#simulation-model-and-limits) for coefficients and scenario-specific behavior.

The architecture favors reproducible, fast educational approximations over a production-faithful database or distributed-system simulator. For example, replication lag, real networking and cache warmup are not simulated. Observations should not be interpreted as benchmarks.

## Persistence and replay

The browser saves one run under `learning-in-chaos.run.v1`. Its record includes engine and scenario versions, seed, mode, elapsed simulated time and ordered, timestamped decisions. Restoring validates the record and reconstructs state by replaying decisions; restored runs are paused. Version mismatches, malformed or invalid decision sequences are rejected. Starting a new run replaces the saved run.

Replay is deterministic for the same supported versions, seed and timed decisions; browser playback speed and tick batching do not change that result. This is local reconstruction, not server-side validation or a guarantee that old saves remain compatible across versions. If local storage is unavailable, gameplay continues in memory with a warning, but progress may be lost. Clearing browser storage removes the save. Query-plan results are temporary and are cleared on a new run or restore.

## Analytics and feedback

The frontend can create an analytics session and submit events independently of the simulation. If session creation fails, the client returns no analytics session; it does not block gameplay or queue the failed creation. Once a session exists, events are buffered and sent in batches of up to 100, including when the queue reaches 20 events. Failed batches are retained in local storage where possible; persistence keeps at most the latest 500 queued events for that session. Failed finish requests are also stored for later retry. Online events and subsequent client creation trigger retry attempts. Storage failures are ignored so telemetry cannot interrupt the game.

This is best-effort delivery, not exactly-once delivery. In particular, event IDs are generated by the server on ingestion, so retrying a batch after an ambiguous response can create duplicates. Events that cannot be persisted can be lost, and a failed initial session creation is not recovered by this queue. Finishing a session is idempotent: a repeat finish returns `alreadyFinished` without changing the original finish data.

The NestJS service uses SQLite with WAL and foreign keys enabled. It creates `sessions`, `events` and `feedback` tables at startup. The default database path is `apps/analytics/data/analytics.sqlite`; `ANALYTICS_DATABASE` overrides it. Event batches are validated and inserted in a transaction. The API uses the `/api` prefix:

| Route | Access | Purpose |
| --- | --- | --- |
| `POST /sessions` | Public | Create an analytics session |
| `POST /sessions/:id/events` | Public | Ingest 1–100 events for an existing session |
| `POST /sessions/:id/finish` | Public | Record the session outcome and duration |
| `GET /sessions`, `GET /sessions/:id`, `GET /sessions/:id/events` | Basic Auth | Read sessions and events |
| `POST /feedback` | Public | Submit feedback |
| `GET /feedback`, `GET /dashboard` | Basic Auth | Review feedback and dashboard |

The dashboard username is `admin`; configure its password through `ANALYTICS_ADMIN_PASSWORD`. The client defaults to `http://127.0.0.1:3001/api`; `VITE_ANALYTICS_URL` selects a different build-time endpoint. `ANALYTICS_CORS_ORIGIN` accepts comma-separated origins; if omitted, the service allows any origin. Public ingestion is not authenticated, so analytics data is not a trusted game result. Protect administrative credentials with HTTPS and restrict network exposure as appropriate. Feedback may include a name and email, so SQLite and its backups need appropriate access controls.

## Deployment and operational concerns

The production Compose setup serves the web image through nginx and proxies `/api/` to the internal analytics container. SQLite persists in the `analytics-data` volume. Image publishing, configuration and rollback are described in [DEPLOYMENT.md](DEPLOYMENT.md). Persist and back up the SQLite volume separately from container images; recreating an image is not a database backup.

An analytics outage should not stop the local simulation, but may leave analytics sessions incomplete or events missing or duplicated. A worker failure rejects outstanding commands; the UI advises reloading to restore the last saved run. Browser storage loss prevents recovery of both saved progress and locally queued telemetry. These paths should be considered when interpreting dashboard totals.

## Tests and change points

- `tests/` covers engine behavior, replay, scenarios, session boundaries and UI behavior with Vitest.
- `tests/e2e/` exercises browser flows with Playwright against a production preview.
- `apps/analytics/tests/integration.mjs` exercises the analytics API and persistence.
- Add or change scenario data under `packages/scenarios/`, update the Zod schema when its contract changes, and test both modes and replay compatibility. Changes to simulation semantics or scenario data can invalidate saved records and require versioning decisions.

## Open questions

- What retention, backup and deletion policy should apply to analytics and user-provided feedback?
- Should analytics delivery gain client-generated event IDs and a durable retry mechanism for failed session creation?
- What compatibility policy should govern saved runs when engine or scenario versions change?
