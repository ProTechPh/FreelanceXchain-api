import { describe, it, expect } from '@jest/globals';
import { getApiVersion } from '../../utils/version.js';

describe('Version Utility (getApiVersion)', () => {
  it('should return default version 1.0.0 when npm_package_version is not set', () => {
    const originalVersion = process.env['npm_package_version'];
    const originalBuildSha = process.env['APP_BUILD_SHA'];
    delete process.env['npm_package_version'];
    delete process.env['APP_BUILD_SHA'];

    const version = getApiVersion();
    expect(version).toBe('1.0.0');

    if (originalVersion !== undefined) {
      process.env['npm_package_version'] = originalVersion;
    }
    if (originalBuildSha !== undefined) {
      process.env['APP_BUILD_SHA'] = originalBuildSha;
    }
  });

  it('should use npm_package_version when set', () => {
    const originalVersion = process.env['npm_package_version'];
    process.env['npm_package_version'] = '2.5.0';

    const version = getApiVersion();
    expect(version).toBe('2.5.0');

    if (originalVersion !== undefined) {
      process.env['npm_package_version'] = originalVersion;
    } else {
      delete process.env['npm_package_version'];
    }
  });

  it('should append build metadata when APP_BUILD_SHA is set', () => {
    const originalVersion = process.env['npm_package_version'];
    const originalBuildSha = process.env['APP_BUILD_SHA'];
    delete process.env['npm_package_version'];
    process.env['APP_BUILD_SHA'] = '0123456789abcdef';

    const version = getApiVersion();
    expect(version).toBe('1.0.0+build.0123456');

    if (originalVersion !== undefined) {
      process.env['npm_package_version'] = originalVersion;
    }
    if (originalBuildSha !== undefined) {
      process.env['APP_BUILD_SHA'] = originalBuildSha;
    } else {
      delete process.env['APP_BUILD_SHA'];
    }
  });

  it('should fall back to SPACE_REVISION when APP_BUILD_SHA is unset', () => {
    const originalVersion = process.env['npm_package_version'];
    const originalBuildSha = process.env['APP_BUILD_SHA'];
    const originalSpaceRevision = process.env['SPACE_REVISION'];
    delete process.env['npm_package_version'];
    delete process.env['APP_BUILD_SHA'];
    process.env['SPACE_REVISION'] = 'fedcba9876543210';

    const version = getApiVersion();
    expect(version).toBe('1.0.0+build.fedcba9');

    if (originalVersion !== undefined) {
      process.env['npm_package_version'] = originalVersion;
    }
    if (originalBuildSha !== undefined) {
      process.env['APP_BUILD_SHA'] = originalBuildSha;
    } else {
      delete process.env['APP_BUILD_SHA'];
    }
    if (originalSpaceRevision !== undefined) {
      process.env['SPACE_REVISION'] = originalSpaceRevision;
    } else {
      delete process.env['SPACE_REVISION'];
    }
  });

  it('should fall back to RENDER_GIT_COMMIT when APP_BUILD_SHA is unset', () => {
    const originalVersion = process.env['npm_package_version'];
    const originalBuildSha = process.env['APP_BUILD_SHA'];
    const originalRenderCommit = process.env['RENDER_GIT_COMMIT'];
    delete process.env['npm_package_version'];
    delete process.env['APP_BUILD_SHA'];
    process.env['RENDER_GIT_COMMIT'] = 'abc1234def567890';

    const version = getApiVersion();
    expect(version).toBe('1.0.0+build.abc1234');

    if (originalVersion !== undefined) {
      process.env['npm_package_version'] = originalVersion;
    }
    if (originalBuildSha !== undefined) {
      process.env['APP_BUILD_SHA'] = originalBuildSha;
    } else {
      delete process.env['APP_BUILD_SHA'];
    }
    if (originalRenderCommit !== undefined) {
      process.env['RENDER_GIT_COMMIT'] = originalRenderCommit;
    } else {
      delete process.env['RENDER_GIT_COMMIT'];
    }
  });

  it('should ignore the dev placeholder and use the platform fallback', () => {
    const originalVersion = process.env['npm_package_version'];
    const originalBuildSha = process.env['APP_BUILD_SHA'];
    const originalRenderCommit = process.env['RENDER_GIT_COMMIT'];
    delete process.env['npm_package_version'];
    process.env['APP_BUILD_SHA'] = 'dev';
    process.env['RENDER_GIT_COMMIT'] = 'fedcba9876543210';

    const version = getApiVersion();
    expect(version).toBe('1.0.0+build.fedcba9');

    if (originalVersion !== undefined) {
      process.env['npm_package_version'] = originalVersion;
    }
    if (originalBuildSha !== undefined) {
      process.env['APP_BUILD_SHA'] = originalBuildSha;
    } else {
      delete process.env['APP_BUILD_SHA'];
    }
    if (originalRenderCommit !== undefined) {
      process.env['RENDER_GIT_COMMIT'] = originalRenderCommit;
    } else {
      delete process.env['RENDER_GIT_COMMIT'];
    }
  });
});
