# Running the initial MVP

Learning in Chaos implements three complete, browser-local incidents with guided and free investigation modes. Incidents 002 and 003 are difficult investigations with separate evidence and intervention effects. The interface and scenario content are in Brazilian Portuguese. Gameplay requires no account; analytics, feedback, and email signup use the API.

## Quick start

For the complete local application, copy `.env.example` to `.env`, set `ANALYTICS_ADMIN_PASSWORD`, then run:

```sh
docker compose up -d --build
```

Open `http://localhost:8088`. Set `WEB_PORT` in `.env` if that port is occupied. The admin dashboard is at `/api/dashboard`; sign in as `admin` with the configured password. Nginx proxies `/api/` to the analytics container. SQLite persists in the `analytics-data` volume. See [DEPLOYMENT.md](DEPLOYMENT.md) for production.

For frontend development and tests outside Compose, use Node.js 24 and npm 11. Dependencies are locked in `package-lock.json`.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173`. The standalone frontend defaults to `http://127.0.0.1:3001/api`; use `VITE_ANALYTICS_URL` when the API is elsewhere. Without a reachable API, gameplay still works, but analytics, feedback, and signup do not.

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

The production build is written to `dist/`. Vite's preview command is intended for checking the build locally; a static host also needs an API endpoint configured at build time for analytics, feedback, and signup.

To run browser tests, install Chromium inside this project, then run the browser suite:

```sh
PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/ms-playwright npx playwright install chromium
npm run test:e2e
```

The browser suite builds the app and starts a production preview on port 4173. It covers investigation, filtering logs, inspecting sessions without written hypotheses, applying a rollback, recovery, restoring the report after a reload, free mode, ending an unresolved run, and mobile overflow. The engine harness tests reference recovery strategies across seeds and difficulty modes, instrument installation/removal, replay, explicit targets, per-node failures, and the overhead of optional telemetry.

## Playing

1. Choose a scenario in **Cenário do incidente**, then guided investigation or free exploration and a seed. Incident 001 is the introductory challenge; incidents 002 and 003 are difficult. Incident 003 is **O fim do expediente**; its briefing does not reveal its diagnosis. Scenario difficulty is independent of the investigation mode.
2. Enter the incident room. Time begins advancing automatically.
3. Pause to study the **Dashboard** for component health, p95 latency, errors, traffic, and costs. **Deploys**, **Mensagens de clientes**, and **Alertas** are separate investigation sections, each showing only the relevant event types. Negative timestamps mark events before your shift. The postmortem retains the complete incident timeline. Explore **Endpoints**, **Logs**, and **Arquitetura**.
   In guided mode, **Aplicação** starts with query tools available. In free mode, implement **Planos de execução** in **Observabilidade** first. Then, in **Aplicação**, select an endpoint and its query, then choose **Buscar plano de execução** to inspect its SQL and estimated PostgreSQL-style plan. The result captures the simulation state at fetch time; fetch again after a completed intervention to inspect changes. Switching endpoints hides results belonging to another query. Fetching does not advance time, execute SQL, or modify the replay record. Fetched plans are kept for the current session and cleared on a new run or resume. SQL, query-plan node names, and structured log fields retain their technical notation. Numbers use Brazilian formatting; infrastructure prices remain in US dollars.
   Incidents 002 and 003 show **Métricas e sessões do banco** below the query tools. Guided mode initially exposes active connections, idle transactions, and lock wait time. Free mode requires installing **Sessões e esperas do banco** before those metrics or session inspection are available; this instrumentation is also usable in incident 001. Explicitly choose **Consultar sessões** to reveal the representative session sample. It includes PIDs, application names, database users, connection references, transaction ages, queries, and blockers. Names and users do not identify process ownership by themselves. **Deploys** also lists scheduled job events. In **Endpoints**, **Compras por dimensão** (available after its instrument is installed in free mode) groups checkout latency and errors by SKU or category; endpoint error rates use that endpoint's traffic as their denominator.
4. Interventions are grouped under **Operações**, **Aplicação**, **Arquitetura**, **Capacidade**, **Configuração**, and **Banco de dados**. The available groups depend on investigation mode and scenario. Use **Categoria de intervenção** to filter the tools; filtering does not change the simulation. Expand an intervention to review its trade-offs, then apply it. Only one intervention or instrumentation installation can run at a time. In free mode, select an explicit target for cache, index creation, query rewrites, scaling, restarts, and stopping/resuming operations. Incident 003 also requires explicit query and operation targets for the guided mode. Repeating an action on a different eligible target is allowed; duplicate cache/index/query changes on the same target are rejected.
5. Resume, accelerate to 5× or 20× speed, or advance by 30 simulated seconds. An intervention takes simulated time; pausing also pauses its completion.
6. Keep global p95 latency below 800 ms and errors below 1% for 60 consecutive seconds. Recovery is declared once the window is satisfied and no intervention or instrumentation installation is pending.
7. Open the postmortem to review the diagnosis, inferred possibilities tested through actions, impact, costs, and alternatives. You can also end the investigation early to review an unresolved incident.

Each run has a maximum duration of 60 simulated minutes. Returning to the briefing preserves the most recent run. Starting a new run replaces that browser-local save. Reopening the app offers a resume button; resumed runs are paused.

## Saved progress and replay

The app stores one run in local storage under `learning-in-chaos.run.v1`. A record contains the engine version, scenario ID and version, unsigned 32-bit seed, difficulty, elapsed simulated seconds, and ordered decisions with their timestamps. Older records may include hypothesis decisions. The full replay record remains local; separate analytics events may be sent to the API.

Resume validates the record and reconstructs the run by replaying decisions. Session inspection, target PIDs, resource targets, and instrumentation enable/disable decisions are also recorded. Unsupported versions, malformed data, invalid ordering, or actions after a run has ended are rejected. Incident 002 now uses scenario version `2.0.0`; its previous `1.0.0` saves are rejected because the workload and causal model changed. The engine now uses version `2.0.0` because free-mode telemetry, action validation, and workload semantics changed. Saves from engine `1.0.0` require a new investigation, including incident 001. Scenario versions are separate from the engine version. If browser storage cannot be written, the current run continues in memory and the interface displays a warning. Clearing browser storage loses the save.

The headless TypeScript API can be used in tests or another TypeScript application:

```ts
import {
  createRun,
  advance,
  intervene,
  configureInstrumentation,
  observe,
  replay,
  report,
} from './packages/sim-engine/src';

const run = createRun(42, 'guided');
advance(run, 30);
intervene(run, 'rollback');
advance(run, 300);

const telemetry = observe(run);
const reproduced = replay(run.record);
const postmortem = report(run);

const difficultRun = createRun(42, 'free', 'mercado-02');
configureInstrumentation(difficultRun, 'database-sessions', true);
advance(difficultRun, 60);
intervene(difficultRun, 'cache', undefined, 'GET /orders');
advance(difficultRun, 120);
```

`advance` accepts whole seconds from 0 to 3600 per call and stops when the run ends. Rejected interventions do not change the run. Guided interventions are single-use except session termination and the explicitly targeted query/operation tools in incident 003. Free cache/index/query changes are single-use per target; scaling is bounded, and operational actions can repeat when their targets are eligible. Headless callers can access the report directly; the browser worker only returns it after an incident ends.

### Simulated processes

Scenario JSON may include a `processes` array. Each entry starts running and contributes database work to the primary database. For example:

```json
{
  "id": "inventory-import",
  "pid": 900,
  "databaseWorkPerSecond": 120,
  "locks": [{ "table": "inventory", "rowKeys": ["sku-123"], "mode": "exclusive" }],
  "retryAfterSeconds": 45
}
```

IDs and initial PIDs must be unique among configured processes. Inspecting database sessions exposes running processes; terminating one removes its work and locks, and schedules a retry when `retryAfterSeconds` is present. A retry normally receives the next PID; `reusePid` retains it. Stopping the corresponding operation cancels retries; resuming it starts the process again. A `worker` defines a restart target, and `operation: false` excludes a process from operation controls. Decisions are replayed using the scenario definition.

Checkout segments can declare `"lockResource": { "table": "inventory", "rowKey": "sku-123" }`. A matching running process's exclusive lock makes that segment wait and fail; unrelated rows are unaffected. The stock import, reconciliation job, and customer-read session in the existing incidents use process definitions. This is an aggregate checkout model, not a general SQL lock manager: other endpoints do not yet declare row accesses, and some checkout sessions and incident-specific query behavior remain hard-coded. Avoid PIDs and operation IDs already used by those existing mechanics when defining additional processes.

## Where to work

- `packages/sim-engine/src/index.ts`: deterministic state transitions, ordered event queue, telemetry, reports, and replay. It has no DOM, timer, network, or filesystem dependency.
- `packages/scenario-schema/src/index.ts`: Zod validation for the declarative scenario.
- `packages/scenarios/checkout.json`: the first incident, initial capacity, endpoint mix, and educational postmortem.
- `packages/scenarios/stock-lock.json`: the second incident, independent timeline, misleading leads, and postmortem.
- `packages/scenarios/src/index.ts`: validated scenarios and briefing catalog.
- `packages/educational-content/src/index.ts`: intervention catalog, explanations, costs, durations, and difficulty availability.
- `apps/web/src/session.ts`: the command boundary. The worker owns the real state and returns player observations and the replay record.
- `apps/web/src/App.tsx`: the investigation interface. The client uses a module Web Worker for engine commands.

This is an npm workspace. The README's proposed pnpm/Turborepo setup is deferred; the current single application builds with one root command.

## Simulation model and limits

The engine processes a time-ordered event queue. One-second workload samples advance the physical model, and intervention completions run before samples at the same timestamp. Browser timers only request advancement; they do not enter the engine state. Changing speed or batching time does not change a run with the same timed decisions. Background tab throttling can slow real-time playback; the app does not catch up from wall-clock time.

The database uses a bounded fluid queue measured in work units. Requests create work according to endpoint share and query cost. A deployment raises catalog work per request. Work exceeding service capacity accumulates; overflow estimates failed requests. Queue wait and query service work determine endpoint latency. Global p95 is approximated from the weighted endpoint latency distribution, rather than sampled from individual requests. Database utilization reports the busiest database instance. API utilization is derived from incoming traffic and instance capacity.

The initial queue represents an incident already underway when the operator arrives. A cache reduces database work according to the estimated hit rate and cacheable work fraction described below. A replica splits reads evenly between primary and replica, each with its own queue and capacity; writes remain on the primary. A larger pool permits a longer queue without adding database work capacity. A guided restart rejects all API requests during the intervention while existing database work drains. Free restarts affect the selected node, as described below. Costs accumulate from simulated seconds at the current hourly infrastructure rate.

Guided mode retains the following preset tools. Free mode exposes target selectors for index creation and scaling, while keeping the timeout configurations:

| Intervention                 | Simulated delay | Effect and trade-off                                                                                                                                                                                                                                                                    |
| ---------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criar índice do catálogo     | 300 seconds     | In incident 001, removes the expensive scan while preserving `ORDER BY created_at DESC`. The plan switches to `products_created_at_idx`. A previous rollback or query rewrite keeps its own SQL. Index storage and write-maintenance overhead are explained but not quantified.         |
| Aumentar capacidade do banco | 300 seconds     | Doubles primary database capacity for US$ 0.24/hour; replica capacity stays unchanged. Does not repair the query or remove transaction locks. The model assumes no downtime during the resize.                                                                                          |
| Limitar espera por bloqueios | 60 seconds      | Changes checkout lock waits from five seconds to one second and reduces occupied connections. Failed checkouts still count as errors, so this alone does not recover incident 002.                                                                                                      |
| Limitar transações ociosas   | 60 seconds      | Enables a 180-second idle-transaction timeout. Incident 002's blocking session has already been idle for 90 seconds at the start, so applying this immediately closes it at simulated second 90, then the stability window begins. Ending the session rolls back its unconfirmed batch. |

The current primary capacity and timeout settings appear in **Arquitetura**. Intervention duration, targets, costs, consequences, and instrumentation decisions are reproduced by deterministic replay.

### Free-mode instrumentation and resource choices

Basic traffic, global and endpoint latency/errors, resource utilization, pool occupancy, deploys, job events, customer reports, and basic request logs remain available. Optional detail is omitted at the worker boundary, not merely hidden by the interface. Query-plan requests and session inspection are rejected until the corresponding instrument is active. No written hypothesis is required.

Each instrument takes 60 simulated seconds to install. Its overhead starts at completion and remains active until disabled. Disabling is immediate when no other change is pending; re-enabling requires another installation. Costs add together and are included in database demand, every endpoint's latency, accumulated run cost, and the current hourly rate. These are explicit educational coefficients, not measured exporter benchmarks.

| Instrument          | Added primary database work/s | Added request latency | Added hourly cost |
| ------------------- | ----------------------------- | --------------------- | ----------------- |
| Sessions and waits  | 100                           | 4 ms                  | US$ 0.02          |
| Checkout dimensions | 50                            | 6 ms                  | US$ 0.03          |
| Query plans         | 60                            | 3 ms                  | US$ 0.02          |
| Detailed logs       | 80                            | 8 ms                  | US$ 0.04          |

Detailed logs only collect new records while enabled; installation does not reconstruct earlier SQL plans, SKU outcomes, or lock waits. Previously collected logs remain readable after disabling. Disabling session collection hides session metrics and clears inspection access; disabling query-plan collection clears the fetched plan. Global charts remain available throughout.

Free interventions use the existing categories with explicit selectors:

- **Cache**: choose any endpoint. The hit rate is a steady-state estimate: `reads / (reads + overlapping writes + keys / TTL)`. Rates use baseline endpoint traffic, adjusted for modeled restarts and stopped checkout processing. The educational profiles assume 60-second average expiry, uniform access across 1 catalog key, 100 product keys, 1,000 order keys, or 100 checkout keys. Checkout invalidates product and order keys; only 2% of checkouts invalidate the catalog key. Cache hits remove the cacheable fraction of work: 100% for the three read endpoints and 10% for checkout. Each endpoint costs US$ 0.06/hour. Checkout writes, stock locking, and confirmations still reach the database; cached reads cannot release locks. This equilibrium approximation does not track individual keys, warmup, exact TTLs, or stale values.
- **Index**: select a query and its offered index expression. The catalog `created_at` index repairs incident 001 while preserving SQL; the price-rules expression index repairs incident 002's minor pricing regression while preserving its cast. Existing indexed queries receive no plan improvement from a redundant index. Every free-mode index adds 15 work units/s of primary maintenance and US$ 0.01/hour storage, including unused indexes. These fixed costs represent write/storage overhead rather than modeling a full index builder.
- **Rewrite**: choose the query. Only the relevant catalog or price-rules rewrite repairs its regression; other already-indexed query variants retain their behavior.
- **Scale**: choose API (one additional instance, maximum four, US$ 0.12/hour each), primary database (double capacity, US$ 0.24/hour), or an existing replica (double its capacity, US$ 0.18/hour) or cache (reduces the effective key count in the expiry term by a factor of 1.2, US$ 0.06/hour). The latter three can each be resized once. Capacity does not release transaction locks.
- **Restart**: choose an existing API node, primary, replica, cache, or inventory worker. Duration is 60 seconds. One API node loses its share of requests; a replica loses half the read traffic; primary restart fails all requests and aborts two representative purchases before rolling back open transactions. Cache restart sends its reads back to the database. Restarting the importer rolls back its stock batch, requiring later reprocessing. This is a coarse node-failure model, not failover orchestration.
- **Stop/resume operation**: choose checkout processing, receipt delivery, or the inventory execution when present. Stop takes 120 seconds and resume takes 60. Stopping checkout fails all checkout requests. Stopping receipts adds 120 ms to checkout for fallback handling and leaves receipt work outstanding. Stopping inventory rolls back its lock-holding batch. Resuming inventory represents a corrected short-transaction retry and does not recreate the old long-lived lock. Outstanding stopped operations appear in the postmortem.

The toolkit lists eligible targets from current resources and operations. Additional nodes become restart/scale targets only after they exist. Targets are validated before appending decisions. Pending changes block further operational changes, while reading evidence remains possible. The postmortem names the actual targets and shows remaining instrumentation overhead and stopped operations.

Incident 002 has two independent problems. Version v2.15.0 adds 180 ms to checkout for a slower price-rules lookup, with a small increase in query work. Rollback restores its indexed variant and removes that delay, but leaves the external transaction lock untouched. Checkout represents 20% of traffic. Two electronics SKUs account for 40% of checkouts and fail while locked: the checkout error rate is 40%, while the global error rate is 8%. Home and book purchases continue succeeding. Global p95 uses the weighted SKU distribution. The approximate five-second lock wait is separate from the deployment delay, so rollback visibly improves p95 without clearing the errors. A one-second lock timeout still leaves the 180 ms pricing delay unless rollback has completed.

Waiting requests occupy pool connections without adding CPU work. Session details are absent from observations until an explicit inspection with active session instrumentation; the engine enforces this rule as well as the UI. Automatic logs contain aggregate database evidence and SKU-level outcomes, rather than the blocker PID or an identifying application name. The blocking session 731 and the healthy checkout worker 904 share `mercado-worker` and `mercado_app`. Correlating connection reference `c-6f2` with the scheduled `inventory-sync` execution identifies the importer. Details are a representative sample, not an exhaustive connection list. An API restart temporarily removes its application sessions while the external transaction remains. Free primary-database and importer-worker restarts roll back the import transaction after their delay, at the cost of downtime or batch reprocessing.

**Encerrar sessão do banco** opens the application inspector. Selecting a PID and confirming starts a 30-second simulated intervention. Session inspection is required, unknown PIDs are rejected without mutation, and only one intervention can run at a time. Ending PID 731 rolls back the import and releases its locks. Ending a checkout session aborts one purchase and causes 30 seconds of additional failures among otherwise healthy checkouts while the worker reconnects. The replacement worker receives a new PID. The player may then end another session; guided presets remain single-use; free actions follow their per-target eligibility rules. The report shows directly aborted purchases, includes reconnect failures in total failed requests, and retains target PIDs in the timeline.

**Interromper importação de estoque** remains a 120-second recovery alternative. Idle-transaction timeout can also release the locks. Recovery still requires the normal 60-second stability window. If the lock is removed without rollback, service can satisfy its targets while the smaller pricing regression remains; the postmortem lists it as unfinished work. This is an aggregate lock and connection model, not a PostgreSQL lock manager or transaction simulator.

These are educational approximations, not database benchmarks or an individual-request simulator. Cache warmup, replication lag, stale responses, networking, and real query execution are not simulated; their risks are explained in the toolkit and postmortem. Baseline events and pre-shift logs provide authored context; subsequent metrics and periodic logs derive from the model. Telemetry history keeps the latest 1800 seconds; charts show the latest 120 samples and the log view displays at most 200 matching entries. Runs are limited to 200 decisions.

The implementation has no arbitrary architecture editor, executable user code, player accounts, hosted reports, sharing, or error-monitoring service. The analytics API supports feedback and update subscriptions, with Basic Auth for administrative reads; it does not store or validate game runs. Fonts are loaded from Google Fonts when available, with local font fallbacks. The simulation itself runs entirely in the browser.

Query definitions and plan templates live with each endpoint in the scenario JSON and are validated by the scenario schema. The engine selects the current query variant from its state: rollback or query repair changes the catalog query after completion; cache and replica additions leave that query's plan unchanged. Plan costs and row estimates are authored teaching examples, not live PostgreSQL output or measured timings. The displayed work units come from the same endpoint work model used by the simulation. The reading guide follows PostgreSQL's [EXPLAIN documentation](https://www.postgresql.org/docs/current/using-explain.html): planner costs are relative units, and a node's row estimate describes its output.

### Postmortem inference

There is no hypothesis form or notebook. Only the postmortem infers a possible explanation tested by each intervention, including its selected endpoint, component, operation, or PID. For each intervention it shows timestamped p95 latency, error rate, and queued work before the action, at completion, and in the last available follow-up sample within 60 simulated seconds after completion. A new intervention or instrumentation change ends that follow-up period; inspection and query-plan requests do not. An immediate drop in errors can coexist with high latency while accumulated work drains. The final service state and its recovery window are shown separately. Samples are instantaneous model measurements, not averages over the observation period. These comparisons describe observed changes; simultaneous effects can influence them and they do not establish the player's intent or isolate causality. Unfinished interventions have no reported outcome. Session inspection requires only active instrumentation (included in guided mode) and an explicit request.

Older hypothesis decisions remain readable for replay compatibility but are not shown as player-authored hypotheses in the postmortem.

### Incident 003

Choose **003 · O fim do expediente · Difícil** in the scenario selector. Both investigation modes support this incident, including replay, local save restoration, targeted interventions, and a postmortem. Free mode requires installing optional telemetry with the usual overhead. The cause and solution are intentionally omitted here; the in-game postmortem presents the explanation after the run ends. Existing scenario IDs and saved records remain supported.
