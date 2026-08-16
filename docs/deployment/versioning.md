# Deployment Versioning & Monitoring

How the API reports its build version, how it changes on every push to
`main`, and how to monitor a live deployment.

## Table of Contents

- [How Versioning Works](#how-versioning-works)
- [Where the Version Is Reported](#where-the-version-is-reported)
- [Confirming a Deployment](#confirming-a-deployment)
- [Verifying the Deployment in CI](#verifying-the-deployment-in-ci)
- [Monitoring a Live Deployment](#monitoring-a-live-deployment)
- [Dependency Monitoring](#dependency-monitoring)
- [Rolling Back](#rolling-back)

---

## How Versioning Works

Every push to `main` triggers the
[Build and Push to Docker Hub](../../.github/workflows/docker-hub.yml)
workflow, which builds a fresh image and tags it with both `latest` and the
commit SHA. The workflow passes the commit SHA into the build as the
`APP_BUILD_SHA` build argument:

```yaml
build-args: |
  APP_BUILD_SHA=${{ github.sha }}
```

The `Dockerfile` bakes it into the image as an environment variable:

```dockerfile
ARG APP_BUILD_SHA=dev
ENV APP_BUILD_SHA=$APP_BUILD_SHA
```

At runtime, `getApiVersion()` in `src/utils/version.ts` combines the
`package.json` version with the baked-in SHA (first 7 characters) using
semver build metadata:

| Environment | `APP_BUILD_SHA` | Reported version |
| --- | --- | --- |
| Local dev (`pnpm run dev`) | unset | `1.0.0` |
| Docker image from push to `main` | `4671a01c...` | `1.0.0+build.4671a01` |

The fallback base version comes from `npm_package_version` (the version in
`package.json`), or `1.0.0` if that is not set.

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

Docker Hub keeps a tag per commit SHA
(`jericko134/freelancexchain-api:<full-sha>`), so the previous build can
always be redeployed. The `version` field makes it easy to confirm the
rollback took effect — the reported SHA should match the previous commit
rather than the latest one.

---

## Related

- [Deployment Configuration](configuration.md) — env vars, Docker, health checks
- [Deployment Overview](README.md) — full deployment documentation index
- [Troubleshooting](troubleshooting.md) — issue resolution guide
