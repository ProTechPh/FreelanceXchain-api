import dotenv from 'dotenv';

// Load environment variables exactly once per process. Some test suites delete
// an env var and then re-import modules (jest.resetModules); a second dotenv
// pass would re-inject the value from the env file and change behavior under
// test. quiet: suppress dotenv's "injected env" console.log — the values are
// still loaded, and this keeps test suites that capture console output
// deterministic.
const g = globalThis as { __freelancexchainDotenvLoaded?: boolean };
if (!g.__freelancexchainDotenvLoaded) {
  dotenv.config({ quiet: true });
  g.__freelancexchainDotenvLoaded = true;
}
