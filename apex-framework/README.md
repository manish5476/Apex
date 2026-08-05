# Apex Framework — Modular Monolith Starter

A Node.js + MongoDB + Redis backend structured as a **modular monolith**:
deploys as one process, but every module is isolated enough that you can
lift it out into its own microservice later with minimal rework.

## Quick start

```bash
cp .env.example .env
npm install
docker compose up -d mongo redis   # or run your own local instances
npm run dev
```

API is live at `http://localhost:4000/api/v1`. Try the reference module:

```bash
curl -X POST http://localhost:4000/api/v1/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Wireless Mouse","sku":"WM-001","price":19.99,"stock":50}'

curl http://localhost:4000/api/v1/products
```

## Full module map (entity-level, generated from the real Apex tree)

This scaffold is now **entity-level**, not just domain-level: every real
model/schema from your original `Apex/src` tree got its own fully isolated
module (model → repository → service → controller → routes → events →
cache), nested under its real sub-domain and domain. 86 real entities +
`products` (fully implemented reference) + 7 single-model modules that
only ever had one entity to begin with (activity, ai, analytics,
dashboard, feed, fieldService, uploads) = 867 generated files.

| Namespace | Sub-namespace | Entities |
|---|---|---|
| `accounting` | `billing` | invoice, invoiceAudit |
| | `core` | account, accountEntry, pendingReconciliation |
| | `payments` | emi, payment |
| `hrms` | `attendance` | attendanceDaily, attendanceLog, attendanceMachine, attendanceRequest, attendanceSummary, geoFencing, shift, shiftAssignment, shiftGroup |
| | `core-hr` | companyAsset, department, designation, employee, employeeDocument |
| | `leave-management` | holiday, leaveBalance, leaveRequest, leaveTransaction |
| | `payroll-compensation` | expenseClaim, payslip, salaryStructure, taxDeduction |
| | `performance` | feedback, goal, reviewCycle |
| `inventory` | — | product, purchase, purchaseReturn, sales, salesReturn, stockTransfer, counter |
| `logistics` | — | driver, globalDeliveryPartner, outboxEvent, providerActivation, shipment, shipmentActivity, shipmentAssignment, shipmentEvent, vehicle |
| `organization` | — | branch, channel, customer, organizationProfile*, transferRequest |
| `auth` | — | user, role, session |
| `notification` | — | notificationCore*, message, announcement |
| `notes` | — | note, meeting, noteComment, noteActivity |
| `master` | — | masterRecord*, masterType |
| `webhook` | — | webhookCore*, webhookDelivery |
| `adminPlatform` | — | featureFlag, platformAudit, platformSetting |
| `storefront` | — | platformDeliveryAgent, sectionTemplate, smartRule, storefrontCart, storefrontCartItem, storefrontCoupon, storefrontCustomer, storefrontCustomerAddress, storefrontDeliveryAgent, storefrontFormSubmission, storefrontLayout, storefrontOrder, storefrontPage, storefrontPageSnapshot, storefrontSession, storefrontWishlist |
| `products` | — | fully implemented reference module (not just scaffolded) |
| `activity`, `ai`, `analytics`, `dashboard`, `feed`, `fieldService`, `uploads` | — | single generic module each (your real tree only has one entity/no model here) |

\* Renamed from the literal source name (`organization`, `notification`,
`master`, `webhook`) to avoid a folder being nested inside an
identically-named parent (e.g. avoid `organization/organization/`).

**Still not covered from your real tree** (deliberately, discuss before
generating): `_legacy` module, the full `PublicModules` middleware/service
layer beyond models, `socketHandlers/`, `core/jobs/` (9 cron jobs),
`core/kernel/` (DI container, ModuleRegistry, Clock, Result pattern),
your 11 real middleware files, `Indexes/` registry pattern, upload/email/
geocoder infra, and seed/migration scripts. These are cross-cutting
infrastructure, not repeatable module patterns — they need to be ported
deliberately rather than generated.

**Every entity module is still a functional skeleton, not migrated
business logic.** `hrms/attendance/shift-group` boots and responds, but it
does not yet contain your real shift-group fields or rules — that's the
next step: migrating logic entity-by-entity from `Apex/src` into these
matching skeletons.

## Generate a new module

```bash
npm run make:module -- orders
```

This creates `src/modules/orders/` with the full standard structure —
model, repository, cache, events, service, validator, controller, routes,
and a public `index.js` — all pre-wired to each other and to the core
framework (BaseRepository, CacheService, eventBus, ApiError).

Then mount it in `src/gateway/routes.js`:

```js
router.use('/orders', require('../modules/orders').router);
```

That's it — the module is live.

## Generating a namespace with sub-modules (e.g. HRMS)

A domain like HRMS isn't one module — it's several independent modules
(attendance, employee, leave, payroll, performance) that happen to live
under one URL prefix. Generate each sub-module the same way, just with a
`parent/child` path:

```bash
npm run make:module -- hrms/attendance
npm run make:module -- hrms/employee
npm run make:module -- hrms/leave
npm run make:module -- hrms/payroll
npm run make:module -- hrms/performance
```

Each of these is a **complete, independent module** — its own model, repo,
service, cache, events — nested at `src/modules/hrms/attendance/`,
`src/modules/hrms/employee/`, etc. `attendance` cannot import `employee`'s
internals directly (same isolation rule as top-level modules); they only
talk through the event bus.

The generator automatically creates/updates one aggregator file,
`src/modules/hrms/index.js`, which just mounts each sub-module's router:

```js
router.use('/attendance', require('./attendance').router);
router.use('/employee', require('./employee').router);
router.use('/leave', require('./leave').router);
```

You only add **one line** to the gateway, for the whole namespace:

```js
router.use('/hrms', require('../modules/hrms').router);
```

That exposes `/hrms/attendance/*`, `/hrms/employee/*`, `/hrms/leave/*`, etc.
Adding a 6th HRMS sub-module later (`npm run make:module -- hrms/asset`)
requires zero gateway changes — the aggregator already picks it up.

This also means each HRMS sub-module can be extracted into its own service
independently later (e.g. `attendance` split out while `employee` and
`leave` stay in the monolith) — because they were never coupled to begin
with, just organized under a shared namespace.

## The rules that keep this "microservice-shaped"

1. **Modules never `require()` each other directly.** Communication happens
   through `eventBus.publish/subscribe` or through a module's public
   `index.js` only. This is the single rule that matters most — break it
   and the "extract into a microservice" story falls apart.

2. **Every module owns its data.** Models connect through
   `core/database.js#getConnection(dbName)`, so each module can (optionally)
   live in its own logical Mongo database even while sharing one physical
   deployment. When a module moves to its own service, its data moves with
   it — no untangling shared tables.

3. **Controllers stay thin.** They translate HTTP <-> service calls only.
   Business rules belong in `application/services`.

4. **Caching goes through `core/cache.js`,** never `redis.get/set` directly,
   so cache strategy (namespacing, invalidation, locks) lives in one place.

5. **Slow work goes on a queue** (`jobs/*.js` + a worker in `workers/`), not
   inline in the request/response cycle.

6. **A module's public surface is its `index.js`.** Nothing else — treat
   every other file in the module as private implementation detail.

## Folder structure

```
src/
├── app.js                  # express app assembly
├── server.js                # entrypoint, graceful shutdown
├── core/                    # shared framework code, NOT business logic
│   ├── eventBus.js          # in-process pub/sub -> swap for Kafka/RabbitMQ later
│   ├── database.js          # per-module mongo connections
│   ├── redisClient.js
│   ├── cache.js             # CacheService abstraction
│   ├── BaseRepository.js    # shared CRUD so repos aren't reinvented per module
│   ├── ApiError.js
│   ├── catchAsync.js
│   └── errorHandler.js
├── gateway/
│   └── routes.js            # the ONE file allowed to know about all modules
└── modules/
    └── products/             # reference module — copy this pattern
        ├── api/
        │   ├── controllers/
        │   ├── routes/
        │   └── validators/
        ├── application/
        │   └── services/
        ├── domain/
        │   └── repositories/
        ├── infrastructure/
        │   └── models/
        ├── events/
        ├── cache/
        ├── jobs/
        ├── tests/
        └── index.js          # public interface — only this is import-safe

workers/
└── product.worker.js         # standalone process consuming BullMQ queues

scripts/
├── make-module.js            # the generator
└── templates/
    └── moduleTemplates.js
```

## When (and how) to actually split a module into its own service

You'll know it's time when a module needs independent scaling, a different
language/runtime, a separate deploy cadence, or a separate team boundary —
not before. When that day comes:

1. Copy `src/modules/<name>/` into its own repo with its own
   `package.json`, `app.js`, `server.js` (copy the pattern from this repo).
2. Swap `eventBus.publish/subscribe` for a real broker client
   (RabbitMQ/Kafka/SQS) — the module's internal code doesn't change,
   only `core/eventBus.js`'s implementation.
3. In the monolith's `gateway/routes.js`, replace the `router.use(...)`
   line with a reverse proxy rule pointing at the new service.
4. Point the extracted module's `core/database.js` connection at its own
   Mongo deployment if desired (it's already logically separated by
   database name, so this is a `mongodump`/`mongorestore`, not a schema
   migration).

No big-bang rewrite required — that's the entire point of building it this
way from the start.
