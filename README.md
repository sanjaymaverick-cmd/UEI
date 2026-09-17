# UEI

Cross-platform EV charging application with a NestJS API/worker, React Native mobile app, React admin console, and PostgreSQL persistence. The current development slice uses a labeled protocol simulator for discovery, quote selection, and order initialization. Live UEI, payment capture, and charger control are not enabled.

## Local setup (PowerShell)

Use Node.js 22.13 or later, pnpm 10.17.1, and Docker Desktop with Linux containers. From the repository root:

```powershell
pnpm install
if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

These commands map to the current package scripts; the full startup sequence was not validated during the session-recovery continuation. The older `docs/LOCAL_DEVELOPMENT.md` contains initial planning assumptions and should be read with this status in mind.

The API defaults to port 3000 and the admin app to 5173. Android emulator requests default to `http://10.0.2.2:3000`. Configure `EXPO_PUBLIC_API_URL` for other devices and configure API `HOST` for device access. For a native Android development build, install Android Studio/JDK and run `pnpm --filter @uei/mobile android`. Native iOS builds require macOS/Xcode.

## Checks

```powershell
pnpm test
pnpm lint
pnpm typecheck
```

If pnpm is unavailable but dependencies are already installed, local checks can run directly:

```powershell
& ./node_modules/.bin/vitest.cmd run --no-file-parallelism
& ./node_modules/.bin/eslint.cmd apps packages tests prisma --max-warnings=0
$projects = @('apps/mobile','apps/api','apps/worker','apps/admin','packages/config','packages/database','packages/domain')
foreach ($project in $projects) {
    & ./node_modules/.bin/tsc.cmd --noEmit -p "$project/tsconfig.json"
    if ($LASTEXITCODE -ne 0) { throw "Typecheck failed: $project" }
}
```

Verified on 2026-09-16 after adding payment authorization and order confirmation (`confirm`/`on_confirm`): all 29 tests passed with database tests enabled, lint passed, and all seven workspace type checks passed. Validation used the docker-compose PostgreSQL/PostGIS and Redis containers, with an isolated `uei_test` database, the two committed migrations, and fixture seed. The standalone `apps/worker` process was separately run against these same containers and confirmed to drain the outbox over live Redis/BullMQ (not just the in-process test harness).

The default test run skips seven database tests. To enable them, provision a dedicated database whose name contains `uei_test`, then run:

```powershell
$env:DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:5432/uei_test'
pnpm db:migrate
pnpm db:seed
$env:RUN_DB_TESTS = '1'
pnpm test
Remove-Item Env:RUN_DB_TESTS
Remove-Item Env:DATABASE_URL
```

Use test-only credentials in the placeholder URL. Do not use a development or production database. Tests retain their records and run serially because each worker drains the shared database outbox. Do not run another worker or test process against this database during validation. The HTTP suite starts the actual API on an ephemeral loopback port and drives the domain worker directly, accelerating simulator callback delivery. It covers authentication, strict input, search/select/init, immutable quotes, idempotency, user isolation, admin access, and SSE cursor replay.

Android/iOS native execution and real ONIX interoperability remain unverified. See [implementation plan](docs/IMPLEMENTATION_PLAN.md) and [HTTP specification](docs/IMPLEMENTATION_SPEC.md) for current scope.
