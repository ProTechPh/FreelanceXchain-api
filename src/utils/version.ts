/**
 * Return the API version, appending build metadata when the image was built
 * from a specific commit. The Docker build (docker-hub.yml) bakes the commit
 * SHA into `APP_BUILD_SHA`, so every push to `main` yields a fresh version
 * like `1.0.1+build.4671a01`.
 *
 * When the image is built by a platform that does not pass build args (e.g.
 * a Hugging Face Space building the repo's Dockerfile directly), the commit
 * is still available at runtime via the auto-set `SPACE_REVISION` variable,
 * so it is used as a fallback. Locally (no env var) it is just the version.
 */
export function getApiVersion(): string {
  const baseVersion = process.env.npm_package_version || '1.0.0';
  const buildSha = process.env.APP_BUILD_SHA || process.env.SPACE_REVISION;
  return buildSha ? `${baseVersion}+build.${buildSha.slice(0, 7)}` : baseVersion;
}
