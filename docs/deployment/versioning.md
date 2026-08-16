# Deployment Versioning & Monitoring

How the API reports its build version, how it changes on every push to
`main`, and how to monitor a live deployment.

## Table of Contents

- [How Versioning Works](#how-versioning-works)
- [Where the Version Is Reported](#where-the-version-is-reported)
- [Confirming a Deployment](#confirming-a-deployment)
- [Verifying the Deployment in CI](#verifying-the-deployment-in-ci)
- [Recording Deployments in CHANGELOG.md](#recording-deployments-in-changelogmd)
- [Publishing GitHub Release Notes](#publishing-github-release-notes)
- [Monitoring a Live Deployment](#monitoring-a-live-deployment)
- [Dependency Monitoring](#dependency-monitoring)
- [Rolling Back](#rolling-back)

---

## How Versioning Works

Every push to `main` triggers the
[Build and Push to Docker Hub](../../.github/workflows/docker-hub.yml)
workflow, which:

1. **Bumps the patch version** in `package.json` (and mirrors it into the
   OpenAPI spec) via `scripts/bump-version.cjs` — `1.0.0` → `1.0.1` → `1.0.2`
2. **Builds a fresh image** tagged `latest`, the commit SHA, and the bumped
   version, passing the commit SHA and version as build arguments:

   ```yaml
   build-args: |
     APP_BUILD_SHA=${{ github.sha }}
     APP_VERSION=${{ steps.bump.outputs.version }}
     APP_REVISION=${{ github.sha }}
   ```

3. **Pushes the version bump** to `main` only after the image was built and
   pushed, so a failed build never leaves an unreleased version bump behind
4. **Posts a deployment summary comment** on the pushed commit with the
   version, commit SHA, image tags, and a Docker Hub link

Runs are serialized (`concurrency` group), so rapid pushes each bump and
build cleanly.

The `Dockerfile` bakes `APP_BUILD_SHA` into the image as an environment
variable, but only when CI passes it — otherwise it stays empty so the
runtime can fall back to the platform's own commit variable:

```dockerfile
ARG APP_BUILD_SHA
ENV APP_BUILD_SHA=${APP_BUILD_SHA:-}
```

At runtime, `getApiVersion()` in `src/utils/version.ts` combines the
`package.json` version (already bumped at build time) with the commit
SHA (first 7 characters) using semver build metadata. It resolves the
build SHA from the first available source, ignoring the `dev` placeholder:

1. `APP_BUILD_SHA` — baked in by the Docker build (docker-hub.yml)
2. `RENDER_GIT_COMMIT` — set by Render.com at runtime (deployed commit)
3. `SPACE_REVISION` — set by Hugging Face Spaces at runtime (space build)

| Environment | Build SHA source | Reported version |
| --- | --- | --- |
| Local dev (`pnpm run dev`) | unset | current `package.json` version (e.g. `1.0.1`) |
| Docker image from push to `main` | `APP_BUILD_SHA` = `4671a01c...` | `1.0.1+build.4671a01` |
| Render.com (builds the repo Dockerfile) | `RENDER_GIT_COMMIT` (auto-set) | `1.0.1+build.<commit>` |
| Hugging Face Space (builds the repo Dockerfile) | `SPACE_REVISION` (auto-set) | `1.0.1+build.<revision>` |

The fallback base version comes from `npm_package_version` (the version in
`package.json`), or `1.0.0` if that is not set. Because the `dev`
placeholder is ignored, platforms that build the repo directly (without
Docker build args) still report a real commit instead of `build.dev`.

> Note: `APP_BUILD_SHA` is set by CI only — it should not be committed to
> `.env`. See `.env.example` for the documented variable.

## Where the Version Is Reported

The version is included in two endpoints:

| Endpoint | Purpose | Version field |
| --- | --- | --- |
| `GET /` | Health check with app metadata | `version` |
| `GET /api/health` | Liveness & readiness probes | `version` |

### Root endpoint

```bash
curl https://your-api-domain.com/
```

```json
{
  "status": "success",
  "message": "FreelanceXchain API is running",
  "version": "1.0.0+build.4671a01"
}
```

### Health endpoint

```bash
curl https://your-api-domain.com/api/health
```

```json
{
  "status": "ok",
  "version": "1.0.0+build.4671a01",
  "timestamp": "2026-08-16T11:50:00.000Z",
  "uptime": 86400.12,
  "services": {
    "database": "ok",
    "api": "ok"
  }
}
```

`/api/health` returns **200** when the Appwrite database is reachable and
**503** when it is not — the `version` field is present in both cases, so a
monitor can always tell which build answered.

## Confirming a Deployment

After a push to `main`, verify the live deployment picked up the new build:

1. Get the latest commit SHA on `main`:

   ```bash
   git fetch origin && git rev-parse --short origin/main
   ```

2. Compare it with the reported version:

   ```bash
   curl -s https://your-api-domain.com/api/health | node -e \
     "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.version)})"
   ```

   The suffix after `+build.` should match the short SHA from step 1.

   The image itself also carries OCI metadata labels, so a deployment can be
   identified even without running it:

   ```bash
   docker inspect jericko134/freelancexchain-api:1.0.1 \
     --format '{{json .Config.Labels}}'
   ```

   → `org.opencontainers.image.version` = `1.0.1`,
   `org.opencontainers.image.revision` = full commit SHA, and
   `org.opencontainers.image.source` = the repository URL.

## Verifying the Deployment in CI

The repository ships a ready-to-use workflow,
`.github/workflows/verify-deployment.yml`, that automatically verifies the
live version after every Docker image build:

- **Trigger:** runs whenever the *Build and Push to Docker Hub* workflow
  finishes successfully on `main`
- **Behavior:** polls `DEPLOYED_URL/api/health` every 10 seconds (up to 30
  attempts) until the reported `version` ends with `+build.<sha7>` of the
  pushed commit; it fails if the deployment never catches up
- **Enabled by:** setting a repository **variable** named `DEPLOYED_URL`
  (Settings → Secrets and variables → Actions → Variables) to the public
  base URL of the API, e.g. `https://your-api-domain.com`
- **Safety:** until `DEPLOYED_URL` is set, the job is skipped — the workflow
  never fails CI while unconfigured

This catches stale deployments automatically: if the version stays on an old
SHA after a push (image build failed, or the deployment target did not pull
the new `latest` image), the check fails and alerts the team.

## Recording Deployments in CHANGELOG.md

The `.github/workflows/update-changelog.yml` workflow records every
successful deployment in `CHANGELOG.md`:

- **Trigger:** runs after the *Build and Push to Docker Hub* workflow
  succeeds, so an entry is only added when a deployment version actually
  exists
- **Entry:** a `## Deployments` section is kept right before
  `## [Unreleased]`, with one bullet per deployment, newest first:

  ```text
  ## Deployments

  - **1.0.0+build.def4567** (2026-08-16) - commit `def4567`: fix: another thing
  - **1.0.0+build.abc1234** (2026-08-16) - commit `abc1234`: feat: something
  ```

- **Idempotent:** a commit SHA already present in `CHANGELOG.md` is never
  recorded twice
- **No loop:** the update is committed with `github-actions[bot]`; commits
  made with `GITHUB_TOKEN` do not re-trigger the build workflows
- **Resilient:** the push retries, so two deployments in a row both get
  recorded

## Publishing GitHub Release Notes

The `.github/workflows/create-release.yml` workflow publishes a GitHub
Release for every deployment, right after it is recorded in `CHANGELOG.md`:

- **Trigger:** runs after the *Update Changelog* workflow succeeds
- **Tag:** `1.0.0+build.<sha7>` (no `v` prefix, so the tag-based
  `release.yml` workflow is never triggered by it)
- **Notes:** deployment version, deployed commit, commit message, and a
  link to the `#deployments` section of `CHANGELOG.md`
- **Idempotent:** a deployment that already has a release is skipped
- **Manual releases unchanged:** pushing a `v*` tag still goes through
  `release.yml`, which builds a versioned Docker image and publishes its
  own release notes

## Monitoring a Live Deployment

Recommended monitor configuration (any uptime service such as UptimeRobot,
Healthchecks, or a cron + `curl`):

| Setting | Value |
| --- | --- |
| URL | `https://your-api-domain.com/api/health` |
| Expected status | `200` |
| Interval | 1–5 minutes |
| Alert on | status `503` (database down) or `5xx` |

A simple polling loop that alerts when the version stops changing:

```bash
#!/usr/bin/env bash
# usage: check-live-version.sh <sha7>
EXPECTED="$1"
VERSION="$(curl -s https://your-api-domain.com/api/health | sed -E 's/.*"version":"([^"]+)".*/\1/')"
if [[ "$VERSION" != *"+build.${EXPECTED}"* ]]; then
  echo "ALERT: live version ${VERSION} does not match build ${EXPECTED}" >&2
  exit 1
fi
echo "OK: ${VERSION}"
```

### Distinguishing a stale deployment

The version only changes when a **new image is deployed**. If the monitor
reports an old SHA after a push, either the image build failed or the
deployment target (e.g. a Hugging Face Space) has not pulled the new
`latest` image yet. Check the Docker Hub build status and the deployment
target's redeploy settings.

## Dependency Monitoring

The repository ships a Dependabot alert check that uses the GitHub CLI:

```bash
pnpm run security:alerts   # exit 1 if any open Dependabot alerts
```

It reports open alerts with severity, package, and patched version. See
`scripts/check-dependabot-alerts.sh`.

## Rolling Back

Docker Hub keeps a tag per commit SHA and per version
(`jericko134/freelancexchain-api:<full-sha>` and
`jericko134/freelancexchain-api:<version>`), so the previous build can
always be redeployed. The `version` field makes it easy to confirm the
rollback took effect — the reported SHA should match the previous commit
rather than the latest one.

---

## Related

- [Deployment Configuration](configuration.md) — env vars, Docker, health checks
- [Deployment Overview](README.md) — full deployment documentation index
- [Troubleshooting](troubleshooting.md) — issue resolution guide
