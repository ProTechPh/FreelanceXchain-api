import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load environment variables exactly once per process. Some test suites delete
// an env var and then re-import modules (jest.resetModules); a second dotenv
// pass would re-inject the value from the env file and change behavior under
// test. quiet: suppress dotenv's "injected env" console.log — the values are
// still loaded, and this keeps test suites that capture console output
// deterministic.
const g = globalThis as { __freelancexchainDotenvLoaded?: boolean };
if (!g.__freelancexchainDotenvLoaded) {
  const cwdEnv = resolve(process.cwd(), '.env');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkgEnv = resolve(__dirname, '../../.env');

  if (existsSync(cwdEnv)) {
    dotenv.config({ path: cwdEnv, quiet: true });
  } else if (existsSync(pkgEnv)) {
    dotenv.config({ path: pkgEnv, quiet: true });
  } else {
    dotenv.config({ quiet: true });
  }
  g.__freelancexchainDotenvLoaded = true;
}
