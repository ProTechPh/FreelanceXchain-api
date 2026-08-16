/**
 * Return the API version, appending build metadata when the image was built
 * from a specific commit. The Docker build (docker-hub.yml) bakes the commit
 * SHA into `APP_BUILD_SHA`, so every push to `main` yields a fresh version
 * like `1.0.0+build.4671a01`. Locally (no env var) it is just `1.0.0`.
 */
export function getApiVersion(): string {
  const baseVersion = process.env.npm_package_version || '1.0.0';
  const buildSha = process.env.APP_BUILD_SHA;
  return buildSha ? `${baseVersion}+build.${buildSha.slice(0, 7)}` : baseVersion;
}
