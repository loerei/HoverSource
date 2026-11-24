# Reference-Only Subdocument Router (`!REF`)

Use this index when `!REF` is active to select ONLY the matching reviewer guides and domain subdocuments without scanning `<skill_dir>`.

| Document | When to Read |
| :--- | :--- |
| [`ARCHITECT-REVIEWER-GUIDE.md`](ARCHITECT-REVIEWER-GUIDE.md) | Structural boundaries, data models, placement altitude, tech debt cleanup, or brownfield decommissioning parity |
| [`ARCH-DATA-DOMAIN-ENTITIES.md`](ARCH-DATA-DOMAIN-ENTITIES.md) | Domain models, Value Objects, branded types, or ingress parsing membranes |
| [`ARCH-DATA-STATE-NORMALIZATION.md`](ARCH-DATA-STATE-NORMALIZATION.md) | In-memory state stores, normalized entities, state machines, or collection topology |
| [`ARCH-DISTRIBUTED-STATE.md`](ARCH-DISTRIBUTED-STATE.md) | Multi-node consensus, distributed locks, fencing tokens, or multi-step sagas |
| [`ARCH-EVENT-DRIVEN.md`](ARCH-EVENT-DRIVEN.md) | Message brokers, event streams, pub/sub, transactional outboxes, or DLQs |
| [`ARCH-FRONTEND-COMPOSITION.md`](ARCH-FRONTEND-COMPOSITION.md) | Frontend UI component composition, hooks/controllers, slots, or root global listeners |
| [`ARCH-LIBRARY-SDK.md`](ARCH-LIBRARY-SDK.md) | Reusable libraries, SDKs, plugins, or shared monorepo packages |
| [`ARCH-MONOLITH-SEAMS.md`](ARCH-MONOLITH-SEAMS.md) | Module boundaries, cross-package APIs, timeouts/watchdogs, or bootstrap lifecycle isolation |
| [`ARCH-PREPARATORY-REFACTORING.md`](ARCH-PREPARATORY-REFACTORING.md) | Legacy/tangled modules, high-complexity functions, or $S \to B$ preparatory refactoring |
| [`PROGRESS-REVIEWER-GUIDE.md`](PROGRESS-REVIEWER-GUIDE.md) | WBS slicing, ticket dependencies, DAG ordering, or replacement/decommissioning lineage |
| [`PROG-COMMON-WBS.md`](PROG-COMMON-WBS.md) | Universal WBS, dot-splitting, $S \to B$ isolation, and checkbox granularity |
| [`PROG-CONTINUOUS-OPERATION.md`](PROG-CONTINUOUS-OPERATION.md) | 24/7 live services requiring zero-downtime $N$/$N+1$ vertical slices |
| [`PROG-NON-CONTINUOUS-OPERATION.md`](PROG-NON-CONTINUOUS-OPERATION.md) | Offline upgrades/refactors, desktop/CLI apps, or isolated branches (`!NC` / `!NC0`) |
| [`READINESS-REVIEWER-GUIDE.md`](READINESS-REVIEWER-GUIDE.md) | Build systems, dependencies, lockfiles, compiler baselines, configs, or runtime readiness |
| [`READ-BUILD-MODULE-SYSTEM.md`](READ-BUILD-MODULE-SYSTEM.md) | ESM/CJS, `tsconfig.json`, Vite/Electron/Tauri bundlers, stylesheet cascade, CSP, or OS paths |
| [`READ-LIBRARY-PACKAGING.md`](READ-LIBRARY-PACKAGING.md) | Package `exports`, dual-package hazards, or `peerDependencies` |
| [`READ-NATIVE-CROSSPLATFORM.md`](READ-NATIVE-CROSSPLATFORM.md) | Cgo/Rust/C++ FFI boundaries, native binaries, or cross-compilation flags |
| [`READ-RUNTIME-CONTAINER.md`](READ-RUNTIME-CONTAINER.md) | Dockerfiles, Kubernetes manifests, container images, or process entrypoints |
| [`SECURITY-REVIEWER-GUIDE.md`](SECURITY-REVIEWER-GUIDE.md) | Threat boundaries, input parsing, authz/authn, secret hygiene, or CSP/IPC security |
| [`SEC-COMMON-INVARIANTS.md`](SEC-COMMON-INVARIANTS.md) | Cryptographic primitives, secret storage, and fail-fast boundary parsing |
| [`SEC-CLIENT-WEB.md`](SEC-CLIENT-WEB.md) | Browser DOM XSS, HTML/Markdown/SVG sanitization, `postMessage`, CSRF, or CSP |
| [`SEC-CLIENT-DESKTOP-IPC.md`](SEC-CLIENT-DESKTOP-IPC.md) | Electron/Tauri IPC bridges, subprocess execution, or external URL openers |
| [`SEC-CLIENT-CREDENTIALS.md`](SEC-CLIENT-CREDENTIALS.md) | Client-side auth tokens, refresh rotation, API keys, or local secret persistence |
| [`SEC-SERVER-AUTHZ-BOLA.md`](SEC-SERVER-AUTHZ-BOLA.md) | REST/GraphQL/gRPC BOLA/IDOR, BOPLA/mass assignment, or tenant authorization |
| [`SEC-SERVER-INGRESS-ABUSE.md`](SEC-SERVER-INGRESS-ABUSE.md) | Public unauthenticated endpoints, rate limits, bot mitigation, or DoS defenses |
| [`SEC-SERVER-INTEGRATION.md`](SEC-SERVER-INTEGRATION.md) | Inbound webhooks, outbound SSRF defenses, or CORS headers |
| [`SEC-DATA-RLS.md`](SEC-DATA-RLS.md) | PostgreSQL/Supabase schemas, RLS policies, `SECURITY DEFINER`, or DB roles |
| [`SEC-LIBRARY-SDK.md`](SEC-LIBRARY-SDK.md) | Library/SDK secret encapsulation, prototype pollution, or untrusted parser bounds |
| [`SEC-AI-LLM-INTEGRATION.md`](SEC-AI-LLM-INTEGRATION.md) | LLM prompts, RAG retrieval, AI agents, MCP servers, or tool-calling workflows |
| [`DATA-MIGRATION-REVIEWER-GUIDE.md`](DATA-MIGRATION-REVIEWER-GUIDE.md) | Schema evolution, storage contracts, $V_1 \to V_2$ migrations, or data integrity |
| [`DATA-CONTRACT-INVARIANTS.md`](DATA-CONTRACT-INVARIANTS.md) | Cross-tier serialization, schema version registers, and payload boundaries |
| [`DATA-LOCAL-SIDE-FILEJSON.md`](DATA-LOCAL-SIDE-FILEJSON.md) | Local JSON/YAML/TOML persistence, atomic swaps, and desktop/CLI state files |
| [`DATA-LOCAL-SIDE-INDEXEDDB.md`](DATA-LOCAL-SIDE-INDEXEDDB.md) | Browser `IndexedDB` / `idb` schema upgrades, transactions, and tab coordination |
| [`DATA-LOCAL-SIDE-SQLITE.md`](DATA-LOCAL-SIDE-SQLITE.md) | Embedded SQLite (`better-sqlite3`, `sqlite3`) migrations and crash recovery |
| [`DATA-SERVER-SIDE-RELATIONAL.md`](DATA-SERVER-SIDE-RELATIONAL.md) | PostgreSQL/MySQL DDL migrations, index/constraint locks, and rollouts |
| [`DATA-SERVER-SIDE-NOSQL.md`](DATA-SERVER-SIDE-NOSQL.md) | DynamoDB/MongoDB/Cassandra schema evolution, partition keys, and backfills |
| [`DATA-SERVER-SIDE-EVENTSTORE.md`](DATA-SERVER-SIDE-EVENTSTORE.md) | Append-only event stores, stream versioning, optimistic concurrency, and upcasting |
| [`DATA-SYNC-LOCALFIRST-RECONCILIATION.md`](DATA-SYNC-LOCALFIRST-RECONCILIATION.md) | PowerSync/ElectricSQL/Zero/CRDT local-first sync and tombstones |
| [`DATA-SYNC-OFFLINE-OUTBOX.md`](DATA-SYNC-OFFLINE-OUTBOX.md) | Offline mutation queues, optimistic sync replay, and idempotency |
| [`TESTABILITY-REVIEWER-GUIDE.md`](TESTABILITY-REVIEWER-GUIDE.md) | Test seams, anti-tautology, mock schema parity, determinism, or brownfield test parity |
| [`TEST-UNIT-INTEGRATION.md`](TEST-UNIT-INTEGRATION.md) | Unit/integration test determinism, DI seams, fixture isolation, and legacy test porting |
| [`TEST-E2E-HARNESS.md`](TEST-E2E-HARNESS.md) | End-to-end browser/app test harnesses (Playwright/Cypress) and environment isolation |
| [`TEST-LIBRARY-CONTRACT.md`](TEST-LIBRARY-CONTRACT.md) | Library public entrypoint tests, type-level assertions, and dual-format verification |
| [`LOGIC-REVIEWER-GUIDE.md`](LOGIC-REVIEWER-GUIDE.md) | State machines, async concurrency, clocks, string normalization, or brownfield field/i18n parity |
| [`LOGIC-STATE-MACHINE.md`](LOGIC-STATE-MACHINE.md) | Stateful workflows, transitions, reducers, and post-commit side-effect isolation |
| [`LOGIC-CONCURRENCY-ALGO.md`](LOGIC-CONCURRENCY-ALGO.md) | Async races, `AbortController`, locks, monotonic clocks, Unicode NFC, and exact math |
| [`DATA-SCIENCE-REVIEWER-GUIDE.md`](DATA-SCIENCE-REVIEWER-GUIDE.md) | Statistical validity, ML splits, ONNX export parity, or analytical reporting |
| [`DS-COMMON-FOUNDATIONS.md`](DS-COMMON-FOUNDATIONS.md) | Leakage prevention, CV splits, causal lags, tensor shapes, and reproducibility |
| [`DS-CUSTOM-DL-AND-ONNX.md`](DS-CUSTOM-DL-AND-ONNX.md) | Custom neural architectures, training loops, quantization, and ONNX runtime parity |
| [`DS-PRODUCTION-BUSINESS-ML.md`](DS-PRODUCTION-BUSINESS-ML.md) | Production ML utility alignment, calibration, train-serve skew, and drift monitoring |
| [`DS-COMPETITIVE-BENCHMARKING.md`](DS-COMPETITIVE-BENCHMARKING.md) | OOF ensembling, metric-aligned blending, prior-shift inversion, and submission bounds |
| [`DS-EDA-AND-REPORTING.md`](DS-EDA-AND-REPORTING.md) | Statistical EDA, Facts vs. Hypotheses segregation, finite JSON, and figure integrity |
| [`EDGECASE-REVIEWER-GUIDE.md`](EDGECASE-REVIEWER-GUIDE.md) | Boundary inputs, upstream ingress validation, OS/filesystem hazards, or resource cleanup |
| [`EDGE-LOCAL-FILESYSTEM.md`](EDGE-LOCAL-FILESYSTEM.md) | Atomic writes, `EXDEV`/`EBUSY`/`ENOSPC` handling, symlinks, and `AbortSignal` cleanup |
| [`EDGE-RESOURCE-CLEANUP.md`](EDGE-RESOURCE-CLEANUP.md) | File descriptors, `stream.pipeline`, subprocess hardening, and graceful teardown |
| [`EDGE-NETWORK-PARTITION.md`](EDGE-NETWORK-PARTITION.md) | Outbound timeouts, bounded retries with jitter, idempotency keys, and circuit breakers |
| [`EDGE-LIBRARY-BOUNDARIES.md`](EDGE-LIBRARY-BOUNDARIES.md) | Library disposal (`Symbol.asyncDispose`), `AbortSignal` cleanup, and callback isolation |
| [`PERFORMANCE-REVIEWER-GUIDE.md`](PERFORMANCE-REVIEWER-GUIDE.md) | Complexity, event-loop/IPC throughput, query efficiency, memory bounds, or virtualization |
| [`PERF-LOCAL-RUNTIME.md`](PERF-LOCAL-RUNTIME.md) | Main-thread/IPC blocking, stream backpressure, embedded SQLite `WAL`, and memory leaks |
| [`PERF-BACKEND-DATABASE.md`](PERF-BACKEND-DATABASE.md) | Relational/NoSQL queries, covering indexes, N+1 prevention, and connection pools |
| [`PERF-FRONTEND-DOM.md`](PERF-FRONTEND-DOM.md) | Frontend DOM virtualization, rendering budgets, and layout thrashing |
| [`OBSERVABILITY-REVIEWER-GUIDE.md`](OBSERVABILITY-REVIEWER-GUIDE.md) | Error context, crash boundaries, stream hygiene, telemetry, or feature flag lifecycle |
| [`OBS-COMMON-INVARIANTS.md`](OBS-COMMON-INVARIANTS.md) | Error `cause` chaining, silent failure elimination, and PII/secret redaction |
| [`OBS-PIPELINE-ANALYTICAL.md`](OBS-PIPELINE-ANALYTICAL.md) | Offline batch pipelines, ETL, and scientific ML training/eval runners |
| [`OBS-CLI-DEVUTIL.md`](OBS-CLI-DEVUTIL.md) | Interactive CLI/TUI tools, `--json`/`-q`, TTY checks, and POSIX exit codes |
| [`OBS-CLIENT-DESKTOP.md`](OBS-CLIENT-DESKTOP.md) | Electron/Tauri/native desktop crash capture, local log rotation, and privacy |
| [`OBS-FRONTEND-RUM.md`](OBS-FRONTEND-RUM.md) | Browser SPA/PWA Core Web Vitals, error boundaries, and RUM transport |
| [`OBS-SERVER-TELEMETRY.md`](OBS-SERVER-TELEMETRY.md) | Backend OpenTelemetry tracing, W3C context propagation, and structured JSON logs |
| [`OBS-SERVER-METRICS-HEALTH.md`](OBS-SERVER-METRICS-HEALTH.md) | Server health probes (`/healthz`), RED/USE metrics, cardinality bounds, and DLQs |
| [`OBS-FEATURE-FLAGS.md`](OBS-FEATURE-FLAGS.md) | Feature flag archetypes, TTLs, removal criteria, and strategy seam isolation |
| [`OBS-LIBRARY-SDK.md`](OBS-LIBRARY-SDK.md) | Library Bring-Your-Own-Logger (`NoOpLogger`), API-only OTel, and zero stream pollution |
| [`UXUI-REVIEWER-GUIDE.md`](UXUI-REVIEWER-GUIDE.md) | Interaction flows, focus retention, CLS, Product-First Precedence, or front-end DX |
| [`UX-PRAGMATIC-INTERACTION-DX.md`](UX-PRAGMATIC-INTERACTION-DX.md) | Pragmatic desktop/product UX (`PRAGMATIC_PRODUCT_UX` default; omit if `!A11Y`) |
| [`UX-STRICT-ACCESSIBILITY-WCAG.md`](UX-STRICT-ACCESSIBILITY-WCAG.md) | Strict WCAG 2.1 AA / WAI-ARIA APG (`!A11Y` / `!WCAG` only) |
| [`UX-DESKTOP-LAYOUT-PERFORMANCE.md`](UX-DESKTOP-LAYOUT-PERFORMANCE.md) | Desktop window layout stability, `min-width: 0`, and optimistic UI (`DESKTOP_ONLY`) |
| [`UX-MOBILE-RESPONSIVE-PERFORMANCE.md`](UX-MOBILE-RESPONSIVE-PERFORMANCE.md) | Mobile/tablet breakpoints, `100dvh`, and touch targets (`!MOBILE` / `!RESPONSIVE` only) |
