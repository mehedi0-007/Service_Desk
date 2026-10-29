# Service Desk: Real-Time Service Request Management

Operators submit service requests. Each request is queued and processed in the background by a pool of concurrent workers, which move it through simulated stages. Supervisors monitor everything live. Every change reaches the browsers that are allowed to see it over WebSockets; nothing polls.

- **Operator:** submits requests, follows their own requests live, cancels them while they are queued or running.
- **Supervisor:** sees all requests on a live dashboard, cancels and retries them, changes priority, assigns them to a supervisor.

## Where to find each deliverable

| Assignment deliverable | Location |
|---|---|
| **1. System analysis** | [`docs/analysis.md`](docs/analysis.md) |
| Problem statement, business objectives, users | [§1 Problem statement](docs/analysis.md#1-problem-statement) · [§2 Business objectives](docs/analysis.md#2-business-objectives) · [§3 Users and stakeholders](docs/analysis.md#3-users-and-stakeholders) |
| Assumptions and scope | [§4 Assumptions](docs/analysis.md#4-assumptions) · [§5 Scope](docs/analysis.md#5-scope) |
| Functional requirements | [§6 Functional requirements](docs/analysis.md#6-functional-requirements) (FR-01 to FR-20) · [§6.1 Request lifecycle (state diagram)](docs/analysis.md#61-request-lifecycle) · [§6.2 Use cases per actor](docs/analysis.md#62-use-cases-per-actor) |
| Non-functional requirements, with justification | [§7 Non-functional requirements](docs/analysis.md#7-non-functional-requirements) |
| **2. System design** | [`docs/design.md`](docs/design.md) |
| High-level architecture diagram | [§1 High-level architecture](docs/design.md#1-high-level-architecture) |
| Component diagram | [§2 Component design](docs/design.md#2-component-design) · [§3 Layered architecture](docs/design.md#3-layered-architecture) |
| Database design (ERD) | [§4 Database design](docs/design.md#4-database-design): ER diagram, constraints, indexes |
| API design | [§5 API design](docs/design.md#5-api-design): conventions, endpoints, validation, examples |
| WebSocket communication flow | [§6 WebSocket communication](docs/design.md#6-websocket-communication): [processing sequence](docs/design.md#61-request-processing-flow), [cancel sequence](docs/design.md#62-cancel-while-in-progress) |
| Concurrency model | [§7 Concurrency model](docs/design.md#7-concurrency-model): [job lifecycle diagram](docs/design.md#72-job-lifecycle), [race conditions and mitigations](docs/design.md#73-race-conditions-and-mitigations) |
| Technology stack justification | [§8 Technology stack justification](docs/design.md#8-technology-stack-justification) |
| Security and deployment (extra) | [§9 Security design](docs/design.md#9-security-design) · [§10 Deployment view](docs/design.md#10-deployment-view) |
| **3. Implementation** | [`backend/`](backend) (NestJS API, workers, WebSockets) · [`frontend/`](frontend) (Next.js web app) · tests in [`backend/test`](backend/test) and `backend/src/**/*.spec.ts` |
| **4. README** | This file: [setup](#getting-started), [architecture](#architecture-overview), [technology stack](#technology-stack), [assumptions](#assumptions), [build and run](#getting-started), [API](#api-documentation), [WebSocket events](#websocket-events), [database setup](#database-setup) |
| Git history | Conventional Commits; the analysis and design documents were committed before the first line of application code |

All 9 diagrams are written in Mermaid, so GitHub renders them in place: the request lifecycle (state diagram), high-level architecture, components, ER diagram, three sequence diagrams (processing, cancel, session lifecycle), the job lifecycle and the deployment view.

## Live demo

| | URL |
|---|---|
| Web app | _Vercel URL_ |
| API | _Render URL_`/api/v1` |
| Swagger UI | _Render URL_`/docs` |

The API runs on Render's free tier. It sleeps after 15 minutes without traffic, so the first request can take about a minute; after that it responds immediately.

**Demo accounts** (password for all: `Password123!`). The login page lists them; click one to fill the form.

| Email | Name | Role |
|---|---|---|
| `operator1@demo.test` | Olivia Operator | Operator |
| `operator2@demo.test` | Oscar Operator | Operator |
| `supervisor@demo.test` | Sam Supervisor | Supervisor |
| `supervisor2@demo.test` | Sara Supervisor | Supervisor |

## Screenshots

| Supervisor dashboard (live) | Request in progress |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Request detail](docs/screenshots/request-detail.png) |

| Requests list | Login | Mobile (360 px) |
|---|---|---|
| ![Requests list](docs/screenshots/requests-list.png) | ![Login](docs/screenshots/login.png) | ![Mobile](docs/screenshots/mobile.png) |

## Features

- **Requests:**
  - Create with validation shown on the form, both client-side and from the server.
  - Paginated list: a table on desktop, cards on mobile.
  - Search by text or by reference number (`SR-00042`, `42`).
  - Filter by status, priority and category, with four sort orders.
  - Filters live in the URL, so they survive a refresh and can be shared.
  - Detail page with a status timeline showing who did what and when.
- **Real-time:**
  - Socket.IO push for created, updated and progress events.
  - Live progress bars and the stage of each running request.
  - Rows flash when they change, and the dashboard has a live activity feed.
  - Operators get a toast when their request completes or fails.
  - A connection indicator shows the link state, and data resyncs after a reconnect.
- **Background processing:**
  - BullMQ worker pool with configurable concurrency.
  - Three simulated stages with progress and a configurable failure rate.
  - Cancelling a running request stops it at the next step.
  - Interrupted work is recovered after a restart.
- **Consistency:**
  - Status changes are checked by a state machine.
  - Every transition writes an audit row in the same transaction.
  - Optimistic locking returns `409` when two people edit the same request.
- **Security:**
  - JWT authentication and role-based access control, enforced in REST and in WebSocket rooms.
  - Sessions: a 15-minute access token kept in memory and a rotating refresh token in an httpOnly cookie. Reusing an old refresh token revokes the session.
  - Logging out ends the session on the server at once, including its open WebSocket connections. Users can also sign out of all devices and change their password (which signs out their other devices).
  - Login gives the same error and takes the same time for unknown emails and wrong passwords, so accounts cannot be enumerated.
  - Operators cannot see other operators' requests; those requests return `404`.
  - Rate limiting (login 5/min/IP), Helmet headers, a CORS allow-list and an origin check on WebSocket upgrades.
- **Operations:**
  - Structured JSON logs with request ids.
  - `/health` checks the database and Redis.
  - Supervisor statistics are cached in Redis and stay available when Redis is down.
  - Swagger documentation.
  - Docker images and graceful shutdown.

## Architecture overview

```mermaid
flowchart LR
    subgraph Client["Browser - Next.js app on Vercel"]
        UI["Next.js web app"]
    end

    subgraph API["NestJS API service on Render"]
        REST["REST controllers /api/v1"]
        WS["Socket.IO gateway /realtime"]
        SVC["Services and repositories"]
        WRK["BullMQ worker pool (N concurrent jobs)"]
    end

    PG[("PostgreSQL")]
    RD[("Redis: job queue + cache")]

    UI -- "HTTPS / JSON (REST)" --> REST
    WS -- "WSS push events" --> UI
    REST --> SVC
    SVC --> PG
    SVC -- "enqueue / remove jobs, stats cache" --> RD
    RD -- "jobs" --> WRK
    WRK --> PG
    SVC -- "domain events" --> WS
    WRK -- "domain events" --> WS
```

1. The browser calls the REST API. The API validates the input and writes the change, together with its audit row, to PostgreSQL in one transaction.
2. New and retried requests get a job in the Redis-backed BullMQ queue **after** the commit. The API answers immediately and never waits for processing.
3. Workers inside the API process claim jobs (up to `WORKER_CONCURRENCY` at once) and move each request through its stages, writing progress to the database.
4. Every committed change raises an internal domain event. The Socket.IO gateway forwards it only to the users allowed to see that request: all supervisors, the owner and the assignee.
5. The browser updates its cache from those events and re-renders, with no polling.

Component, database, sequence and deployment diagrams are in [`docs/design.md`](docs/design.md).

## Technology stack

| Layer | Technology | Why |
|---|---|---|
| Backend | NestJS 11 (TypeScript, Node 24) | Modules and dependency injection keep controller → service → repository layering; guards, pipes and first-class WebSocket and BullMQ support |
| Database | PostgreSQL 16 + Prisma 6 | Relational integrity, transactions for status + history, trigram indexes for search; type-safe client and versioned migrations |
| Queue / workers | BullMQ 5 on Redis 7 | Durable jobs that survive restarts, configurable concurrency, job ids for de-duplication |
| Real-time | Socket.IO 4 | Rooms for per-user and per-role delivery, handshake authentication, automatic reconnection |
| Cache | Redis via `@nestjs/cache-manager` | Cache-aside statistics with event-driven invalidation |
| Frontend | Next.js 15 + React 19 | File-based routing, simple hosting on Vercel |
| UI | shadcn/ui (Radix) + Tailwind CSS 4 | Accessible components owned in the repo, consistent look without custom design work |
| Client state | TanStack Query + Zustand | Server state cached and updated straight from socket events; small client state (session, connection) |
| Forms | react-hook-form + zod | Validation that mirrors the backend rules |
| Packaging / hosting | Docker, Render, Vercel | Same images locally and in the cloud; Render runs the long-lived process that WebSockets and workers need |

## Project structure

The repository root holds only `backend/`, `frontend/`, `docs/` and this README. Each app is self-contained, with its own `package.json`, Dockerfile, Compose file and `.env.example`.

```
backend/
  prisma/                 schema, migrations, seed script
  src/
    auth/                 login, sessions and refresh tokens, JWT strategy, password change
    users/                users and supervisor list
    requests/             controller, service, repository, state machine, DTOs, stats, domain events
    processing/           BullMQ queue, worker (processor), startup recovery
    realtime/             Socket.IO gateway, event listener, adapter with origin check
    health/               /health (database + Redis)
    common/ config/ prisma/   errors, filters, validation, env schema, Prisma service
  test/                   end-to-end tests (real Postgres + Redis)
frontend/
  src/
    app/                  pages: login, requests, request detail, new request, dashboard
    components/           feature components + components/ui (shadcn/ui)
    hooks/                TanStack Query hooks, useRealtime (socket → cache)
    lib/                  API client, types, zod schemas, formatting, permissions
    stores/               Zustand: auth session, connection status, activity feed
docs/                     analysis.md, design.md, screenshots/
```

## Getting started

**Prerequisites:** Node.js 24 and Docker.

### Option A: everything in Docker

```bash
cd backend  && docker compose --profile app up -d --build   # PostgreSQL + Redis + API on :3001
cd ../frontend && docker compose up -d --build              # web app on :3000
```

Open http://localhost:3000 and sign in with a demo account. The API applies migrations and seeds the demo data on first start.

### Option B: local development

```bash
cd backend
docker compose up -d                    # PostgreSQL :5432 + Redis :6379
cp .env.example .env
npm ci
npx prisma generate                     # recent npm versions skip dependency install scripts
npx prisma migrate deploy && npm run db:seed
npm run start:dev                       # API on http://localhost:3001, Swagger on /docs

cd ../frontend
cp .env.example .env.local
npm ci
npm run dev                             # http://localhost:3000
```

## Configuration

### Backend (`backend/.env`)

All variables are validated at startup; the app refuses to start with an invalid configuration.

| Variable | Default / example | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `production` or `test` |
| `PORT` | `3001` | HTTP port (Render injects its own) |
| `DATABASE_URL` | `postgresql://servicedesk:servicedesk@localhost:5432/servicedesk?schema=public` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis for the queue and the cache (`rediss://` for TLS) |
| `JWT_SECRET` | at least 32 characters | Signs access tokens |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | A session ends after this many days without use |
| `SESSION_MAX_AGE_DAYS` | `30` | A session ends this many days after login, used or not |
| `REFRESH_REUSE_GRACE_SECONDS` | `30` | A replaced refresh token presented again after this long revokes the session (shorter means two tabs refreshing at once is a race, not theft) |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated allowed browser origins (REST and WebSocket) |
| `WORKER_CONCURRENCY` | `4` | Jobs processed at the same time (1–32) |
| `JOB_STAGE_MIN_MS` / `JOB_STAGE_MAX_MS` | `2000` / `5000` | Duration range of each of the 3 stages |
| `JOB_FAILURE_RATE` | `0.1` | Probability that processing fails (0–1) |
| `STATS_CACHE_TTL_SECONDS` | `15` | Upper bound for cached statistics (also invalidated by events) |
| `LOG_LEVEL` | `info` | Pino log level |
| `SEED_ON_START` | `false` | Seed demo users and sample requests on start if the tables are empty |

### Frontend (`frontend/.env.local`)

| Variable | Example | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api/v1` | REST base URL |
| `NEXT_PUBLIC_WS_URL` | `http://localhost:3001` | Socket.IO server (namespace `/realtime` is added) |

`NEXT_PUBLIC_*` values are compiled into the browser bundle, so set them before building.

## Database setup

- **Engine:** PostgreSQL 16, started by `backend/docker-compose.yml` (a second database, `servicedesk_test`, is created for the e2e tests).
- **Migrations:** `backend/prisma/migrations`.
  - `init`: tables, enums and foreign keys.
  - `constraints_and_search`: check constraints (progress 0–100, `finished_at ≥ started_at`, version ≥ 1, …), the reference-number sequence (`SR-00001`) and `pg_trgm` GIN indexes for case-insensitive search.
  - Apply with `npx prisma migrate deploy`; the Docker image does this on every start.
- **Seed:** `npm run db:seed` creates the four demo users and twelve sample requests. It is idempotent: users are upserted, and samples are only added to an empty table.
- **Reset (development):** `npx prisma migrate reset` drops, re-migrates and re-seeds the dev database.
- **Tables:**
  - `users`
  - `service_requests`: the current state, including `version` for optimistic locking and the live `progress` and `stage`.
  - `request_status_history`: the append-only audit trail.
  - ERD and the reasoning behind each index are in [`docs/design.md` §4](docs/design.md#4-database-design).

## API documentation

Interactive documentation: **Swagger UI at `/docs`** (for example http://localhost:3001/docs). Base path `/api/v1`; send `Authorization: Bearer <token>` on every endpoint except health and the cookie endpoints (`login`, `refresh`, `logout`). The refresh token is only ever sent in the `sd_refresh` cookie (`HttpOnly`, `Path=/api/v1/auth`); browsers must call those endpoints with `credentials: "include"`.

| Method | Path | Roles | Description |
|---|---|---|---|
| `GET` | `/health` | public | Database and Redis status (`503` if either is down) |
| `POST` | `/auth/login` | public (5/min/IP) | `{ email, password }` → `{ accessToken, expiresIn, user }` and sets the refresh cookie |
| `POST` | `/auth/refresh` | refresh cookie | New access token; the cookie is rotated. `401 SESSION_EXPIRED` when the session has ended, `409 REFRESH_CONFLICT` when a parallel refresh won (retry once) |
| `POST` | `/auth/logout` | refresh cookie or access token | Ends this session → `204`, clears the cookie |
| `POST` | `/auth/logout-all` | any | Ends all of the user's sessions → `204` |
| `PATCH` | `/auth/password` | any (5/min/IP) | `{ currentPassword, newPassword }` → `204`; other sessions are signed out |
| `GET` | `/auth/me` | any | Current user |
| `GET` | `/users?role=SUPERVISOR` | Supervisor | Users, e.g. for the assignee list |
| `POST` | `/requests` | Operator | Create → `201`, status `QUEUED` |
| `GET` | `/requests` | any | Paginated list; operators see only their own |
| `GET` | `/requests/stats` | Supervisor | Counts by status and priority, queue size, average processing time (cached) |
| `GET` | `/requests/:id` | any | Detail; another operator's request → `404` |
| `GET` | `/requests/:id/history` | any | Status timeline, oldest first |
| `PATCH` | `/requests/:id` | Supervisor | `{ priority?, assignedToId?, version }` |
| `PATCH` | `/requests/:id/status` | Operator (cancel own), Supervisor | `{ status: "CANCELLED" \| "QUEUED", note?, version }` (cancel / retry) |

**List parameters:**
- `q`: text, or a reference such as `SR-42` or `42`.
- `status` and `priority`: comma-separated lists.
- `category`.
- Supervisors only: `assignedToId` (a user id or `unassigned`) and `createdById`.
- `createdFrom` / `createdTo`: inclusive dates.
- `sortBy`: `createdAt`, `updatedAt`, `priority` or `referenceNo`; `sortOrder`: `asc` or `desc`.
- `page`, and `pageSize` up to 100.

The UI exposes search, status, priority, category and sorting; the creator, assignee and date filters are available through the API.

**Errors** always have the same shape:

```json
{
  "statusCode": 409,
  "code": "VERSION_CONFLICT",
  "message": "The request was modified by someone else. Reload and try again.",
  "details": null,
  "path": "/api/v1/requests/1f0c…/status",
  "timestamp": "2026-10-27T10:00:00.000Z",
  "requestId": "b2c1…"
}
```

The codes are:
- `VALIDATION_ERROR`: `details` lists `{ field, messages[] }`.
- `BAD_REQUEST`, `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `FORBIDDEN`, `NOT_FOUND`.
- `INVALID_TRANSITION`, `VERSION_CONFLICT`, `CONFLICT`.
- `RATE_LIMITED`, `SERVICE_UNAVAILABLE`.
- `INTERNAL_ERROR`, which never leaks internals.

**Example:**

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"operator1@demo.test","password":"Password123!"}' | jq -r .accessToken)

curl -s -X POST http://localhost:3001/api/v1/requests \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Laptop does not boot","description":"Black screen after the latest update.","category":"HARDWARE","priority":"HIGH"}'
```

## WebSocket events

```ts
import { io } from "socket.io-client";

const socket = io(`${API_HOST}/realtime`, { auth: { token }, transports: ["websocket"] });
socket.on("request.updated", ({ request }) => { /* … */ });
```

- **Authentication:**
  - The JWT and its session are checked during the handshake. A missing or invalid token gets `error { code: "UNAUTHORIZED" }` and is disconnected.
  - A socket is closed when its access token expires; the client reconnects with a fresh one (pass `auth` as a function so every handshake reads the current token).
  - Browser origins outside `CORS_ORIGIN` are refused, because browsers do not apply CORS to WebSocket upgrades.
- **Rooms:**
  - Every socket joins `user:{id}` and `session:{id}`; supervisors also join `role:SUPERVISOR`.
  - Each event goes to `role:SUPERVISOR`, the owner and the assignee in a single emit, so other operators never receive it.
- **Ordering:** events are emitted only after the database transaction commits.

| Event (server → client) | Payload | When |
|---|---|---|
| `request.created` | `{ request: RequestDto }` | A request was submitted |
| `request.updated` | `{ request: RequestDto }` | Any status, priority or assignment change, by a user or the worker |
| `request.progress` | `{ id, referenceNo, status, progress, stage, updatedAt }` | Every worker tick (a small delta, not the full object) |
| `session.revoked` | `{ reason }` (`LOGOUT`, `LOGOUT_ALL`, `PASSWORD_CHANGED`, `TOKEN_REUSE`) | The socket's session was ended; the server closes the socket right after |

There are no client → server events. The client updates its query cache from these events and refetches its queries after every (re)connect, so nothing is missed while it was offline.

## Concurrency and background processing

- **Execution model:**
  - Jobs run in a BullMQ worker inside the API process, with `WORKER_CONCURRENCY` jobs at a time.
  - The work is timer- and I/O-bound, so it never blocks the event loop: `GET /requests` answers in milliseconds while jobs run.
  - CPU-heavy work would move to sandboxed processors or worker threads.
- **Exactly one worker per request:**
  - A worker claims a request with a compare-and-set: `UPDATE … WHERE id = ? AND status = 'QUEUED'`.
  - Duplicate or late jobs match 0 rows and stop.
- **Cancel always wins:**
  - Every progress write is guarded by `status = 'IN_PROGRESS'`, so after a cancel the next write matches 0 rows and the job stops within one tick.
  - Completion is guarded the same way.
- **Concurrent edits:** users send the `version` they saw. A stale version returns `409 VERSION_CONFLICT`. Progress ticks do not bump the version, so users can still act on a running request.
- **Ordering:** the database commit happens first, then the job is enqueued. If Redis is down the request stays `QUEUED`, and startup recovery enqueues it.
- **Recovery:** on start, requests left `IN_PROGRESS` by a crash go back to `QUEUED`, and queued requests without a pending job are re-enqueued.

The race-condition table and the scaling path are in [`docs/design.md` §7](docs/design.md#7-concurrency-model).

## Testing

```bash
cd backend
npm run typecheck        # TypeScript across src and test
npm test                 # unit tests
npm run test:cov         # unit tests with coverage
npm run test:e2e         # end-to-end tests: needs the Docker PostgreSQL + Redis (uses servicedesk_test and Redis DB 1)
npm run test:e2e:cov     # end-to-end tests with coverage
```

| Suite | Tests | What it proves |
|---|---|---|
| Unit | 164 | State machine (every allowed and rejected transition); service rules (enqueue after commit, visibility, version conflicts, cancel and retry); processor (lost claim, 12 progress ticks, cancel mid-run, failure, unexpected errors never leave a request in progress); statistics cache (a change during a rebuild never caches stale numbers; no Redis use once shutdown starts); login (same work for unknown emails); sessions (only hashes stored, rotation, maximum age, reuse inside and after the grace period, parallel refresh); password change; revoked sessions rejected; CSRF origin check |
| End-to-end | 34 | Real app, database, queue and sockets: auth and roles; operator isolation; search, filters and paging limits; cancel/retry with versions; two simultaneous edits → one `200`, one `409`; **at most `WORKER_CONCURRENCY` jobs in progress at once**; API stays responsive while jobs run; cancel stops a running job; WebSocket delivery to supervisors and the owner only; refresh cookie attributes, rotation and reuse detection; logout rejects the access token at once (with or without the cookie); sign out everywhere; password change; foreign origins refused; sockets closed on logout and on token expiry |

**Coverage:**
- The end-to-end suite covers **88.4 % of lines** (69 % of branches) of the backend source.
- Unit tests cover the state machine at 100 %, the processor at 90 %, the request service at 78 %, the auth service at 100 % and the session service at 96 %.

**Isolation:**
- The e2e global setup refuses any database whose name does not end in `_test`.
- It applies the migrations, truncates the tables and seeds the users.
- Each test starts from empty tables.

**Not covered:**
- Frontend unit tests are out of scope, a deliberate trade-off for this backend-focused submission.
- The UI was instead verified with scripted browser runs: two users, live updates, forms, filters and a 360 px layout.

## Performance notes

All numbers are measured locally against PostgreSQL and Redis in Docker.

| What | Result |
|---|---|
| Text search on 200 000 rows (`count` with `ILIKE`) | 6.3 ms with the `pg_trgm` GIN indexes vs 179 ms without (28×) |
| API response times (server-side, p50) | `GET /requests/:id` 6 ms · list / search 6–9 ms · stats (cached) 3 ms · create 16 ms; unchanged while 4 jobs are processing |
| List endpoint | Page and total count run in parallel instead of in one transaction: p50 9 → 6 ms |
| CORS preflights | Cached for 10 minutes (`Access-Control-Max-Age`); before, half of all browser calls needed an extra `OPTIONS` round trip |
| Live update latency | A cancel reaches other browsers in about 20 ms; a new request appears on the supervisor dashboard in about 0.5 s, including the form submit |

## Deployment

The backend runs as a Docker web service on Render, with Render PostgreSQL and Render Key Value (Redis). The frontend runs on Vercel.

1. **Render Key Value (Redis):** create an instance with maximum memory policy **`noeviction`** (BullMQ stores jobs as keys). Copy its *internal* URL.
2. **Render PostgreSQL:** create a database and copy its *internal* URL. The free instance expires after 30 days.
3. **Render Web Service:** connect the repository.
   - Settings: Root Directory **`backend`**, runtime **Docker**, health check path **`/api/v1/health`**.
   - Environment variables:
     - `DATABASE_URL` and `REDIS_URL`: the internal URLs from steps 1 and 2.
     - `JWT_SECRET`: a long random string.
     - `NODE_ENV=production` and `SEED_ON_START=true`.
     - `CORS_ORIGIN`: set this after step 4.
   - Render injects `PORT`. On every start the container applies pending migrations and seeds an empty database.
4. **Vercel:** import the repository.
   - Settings: Root Directory **`frontend`**, framework Next.js.
   - Environment variables: `NEXT_PUBLIC_API_URL=https://<api>.onrender.com/api/v1` and `NEXT_PUBLIC_WS_URL=https://<api>.onrender.com`.
   - Deploy.
5. Back on Render, set `CORS_ORIGIN` to the Vercel URL (for example `https://service-desk.vercel.app`; separate several with commas), then redeploy.

## Assumptions

1. Requests are processed automatically on submission. The "long-running operation" is a simulated three-stage job, 6–15 s in total by default, with a configurable random failure rate.
2. There are two roles (Operator, Supervisor) and the users are seeded. There is no self-registration or forgotten-password reset; signed-in users can change their password.
3. Requests are assigned to supervisors, acting as the responsible owner; there is no separate technician role.
4. Failed processing is not retried automatically: retry is a supervisor decision, which keeps the audit trail meaningful. Only infrastructure errors that stop a job before processing starts are retried by the queue, up to 3 times with backoff.
5. A request in progress can be cancelled; the worker stops at its next progress tick, at most about 1.25 s later.
6. Access tokens last 15 minutes; the refresh token keeps a session alive for 7 days without use, and at most 30 days after login.
7. A single API instance runs on the free cloud tier; the design documents how to scale horizontally.
8. All timestamps are stored in UTC and displayed in local time.

## Design decisions and trade-offs

- **Access token in memory, refresh token in an httpOnly cookie:** scripts can never read the long-lived credential, and nothing is kept in `localStorage`. The frontend (Vercel) and the API (Render) are on different sites, so the cookie is cross-site (`SameSite=None; Secure`); the cookie endpoints accept only the frontend's origins to block cross-site request forgery. The UI hides buttons for convenience, but the API enforces every rule.
- **Sessions in the database:** the access token names its session, and the lookup that loads the user also checks the session, so a logout takes effect immediately without an extra query.
- **Workers inside the API process:** this is simple and enough for I/O-bound simulated work. The queue is in Redis, so workers can move to a separate service without code changes.
- **Database as the source of truth:** BullMQ job state is never trusted on its own. Guarded writes and startup recovery make the system correct even if jobs are duplicated, lost or late.
- **No automatic retry of failed requests:** it keeps failures visible and the history honest; supervisors decide.
- **Server push only:** progress is stored on the request row, so a client that (re)connects reads the current state over REST and then follows the events. There's no event replay and no polling.
- **Single instance:** scaling out needs `@socket.io/redis-adapter`, so events reach sockets on every instance, plus separate worker processes. Both are documented in the design.
- **Functional, accessible UI:** built from shadcn/ui defaults rather than a custom design; the effort went into backend robustness.
- **No CI/CD pipeline** in this scope; see possible improvements.

## Known limitations

- A request created while Redis is unreachable stays `QUEUED` until the next API start, when recovery enqueues it. A periodic sweep would remove this window.
- The refresh cookie is a third-party cookie, because the frontend and the API are on different sites. Browsers that block those (Safari, Chrome private windows, Brave) cannot renew a session: signing in works, but a reload or an expired access token sends the user back to the login page. Serving the API under the frontend's domain (a rewrite proxy or a shared parent domain) would make the cookie first-party.
- `npm audit` still reports issues that need major upgrades (Prisma 7, Next 16, zod 4, Swagger 12). They affect build tooling or client-side form validation, not request handling; the one in the request path (`multer`) is patched through an override.
- The rate limiter identifies clients by `X-Forwarded-For` (`trust proxy` is set for Render's proxy). If the API were exposed without a proxy, clients could spoof that header to get around the limits.
- The Render free tier sleeps after inactivity, so processing pauses while the service is asleep.

## Possible improvements

- A CI/CD pipeline (lint, unit and e2e tests, image build, deploy on merge).
- Serve the API under the frontend's domain, so the refresh cookie is first-party and works in every browser.
- A list of active sessions (device, last used) with sign-out per device.
- `@socket.io/redis-adapter` and a separate worker deployment for horizontal scaling.
- A periodic sweep that enqueues stranded `QUEUED` requests without waiting for a restart.
- Frontend component and end-to-end tests (Playwright).
- Assignee, creator and date filters in the UI (already supported by the API).
- SLA timers, notifications and metrics (Prometheus / OpenTelemetry).
