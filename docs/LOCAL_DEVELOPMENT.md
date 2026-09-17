# UEI — Windows Local Development

## 1. Status and Intended Workflow

Project root: `D:\work Dir\UEI`
Repository: https://github.com/sanjaymaverick-cmd/UEI

The folder was empty when inspected on 2026-09-16. This delivery contains documentation only. The commands below are target commands from the approved master prompt and intended Windows adaptations; they have not been validated against an implemented application. Application scaffolding, package scripts, Compose services, migrations, and seed data must be created before these commands can run successfully.

## 2. Prerequisites

Prepare Git, a project-compatible Node.js version, pnpm, Docker Desktop with Linux containers, Android Studio with Android SDK/emulator, and a compatible JDK. Pin exact versions during bootstrap; the approved documents do not specify them.

Use PowerShell and quote paths containing spaces. Android is the initial local validation target. Local native iOS compilation requires macOS/Xcode; use a Mac or an appropriate remote build environment for later iOS validation.

## 3. Repository Setup

For a fresh checkout into a new empty destination:

```powershell
Set-Location -LiteralPath 'D:\work Dir'
git clone https://github.com/sanjaymaverick-cmd/UEI UEI
Set-Location -LiteralPath 'D:\work Dir\UEI'
```

The current target now contains documentation. Do not clone over this nonempty directory or discard its contents. When beginning development, inspect repository state and reconcile the documentation with the repository checkout.

For subsequent work in the prepared repository:

```powershell
Set-Location -LiteralPath 'D:\work Dir\UEI'
git status
pnpm install
```

## 4. Environment Configuration

Bootstrap must provide validated environment configuration and `.env.example`. If a local environment file does not already exist:

```powershell
if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}
```

Configure database, Redis, ONIX, auth, and application endpoints according to the implemented environment schema. Keep secrets out of Git. Use the local/dev OTP provider when production credentials are unavailable. Clearly distinguish simulated protocol behavior from actual UEI integration.

## 5. Target Startup Commands

Approved target sequence, after scaffolding:

```powershell
pnpm install
docker compose up -d
pnpm prisma migrate dev
pnpm prisma db seed
pnpm dev
```

The implementation must provide these root commands or document the exact working replacements if workspace/package layout requires adjustment. Do not claim these commands pass until tested.

## 6. Android Development

Start an Android Studio emulator or connect a configured Android device. Use Expo Development Build, with the exact mobile package command documented during bootstrap. The approved source does not define a runnable Android package script yet.

Validate OTP navigation, vehicle selection, loading/error states, permissions, QR/camera support, secure storage, UPI deep-link return handling, SSE reconnection, and background/foreground recovery as the relevant features are implemented.

Configure mobile API access for the chosen emulator/device; a device's localhost is not the Windows host. Document actual ports and host addresses with the implemented environment.

## 7. iOS Readiness

Keep shared TypeScript, API contracts, query logic, navigation, and native abstractions cross-platform. Preserve the iOS project structure and document temporary Android-specific shortcuts. After Android Phase 1 passes, validate an iOS build in a suitable environment before major feature expansion.

## 8. First Milestone Validation

Demonstrate:

```text
OTP Login → Save User → Select Vehicle
→ Search UEI → Receive on_search responses
→ Show compatible results → Select charger
→ Receive on_select → Persist immutable quote
→ Init → Receive on_init → Normalize payment terms
→ Inspect full admin transaction timeline
```

Verify clean-database migrations, seeding, Android startup, intact iOS structure, persisted protocol messages, duplicate callback handling, asynchronous callbacks, and appropriate tests. Document actual lint, type-check, test, and build commands when scripts exist.

## 9. Local Operations

After Compose configuration exists:

```powershell
docker compose ps
docker compose logs --tail 100
docker compose stop
```

Stopping services preserves local data. Database reset/removal is not part of the normal startup workflow.

## 10. Documentation Maintenance

Keep this file and the project README aligned with commands that actually work. Record architecture changes in DECISIONS.md. Implementation must wait for the complete PRD, ARCHITECTURE, and IMPLEMENTATION_SPEC source documents if they have not yet been restored.
