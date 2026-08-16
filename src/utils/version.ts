/**
 * Return the API version, appending build metadata when the image was built
 * from a specific commit. The Docker build (docker-hub.yml) bakes the commit
 * SHA into `APP_BUILD_SHA`, so every push to `main` yields a fresh version
 * like `1.0.1+build.4671a01`.
 *
 * When the image is built by a platform that does not pass build args, the
 * commit is still available at runtime via platform env vars:
 * - Render.com: `RENDER_GIT_COMMIT` (commit SHA of the deployed version)
 * - Hugging Face Spaces: `SPACE_REVISION` (commit SHA of the space build)
 *
 * The `dev` placeholder (the Dockerfile's default for `APP_BUILD_SHA`) is
 * ignored so these runtime fallbacks can take effect. Locally (no env var)
 * it is just the version.
 */
export function getApiVersion(): string {
  const baseVersion = process.env.npm_package_version || '1.0.0';
  const buildSha = [
    process.env.APP_BUILD_SHA,
    process.env.RENDER_GIT_COMMIT,
    process.env.SPACE_REVISION,
  ].find((value) => value && value !== 'dev');
  return buildSha ? `${baseVersion}+build.${buildSha.slice(0, 7)}` : baseVersion;
}
