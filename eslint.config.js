import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const eslint = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const globals = require('globals');

export default [
    // Base ESLint recommended config
    eslint.configs.recommended,

    // TypeScript files configuration (non-test files)
    {
        files: ['src/**/*.ts', 'api/**/*.ts'],
        ignores: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
                project: './tsconfig.json',
            },
            globals: {
                ...globals.node,
                ...globals.es2021,
                Express: 'readonly',
                NodeJS: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
        },
        rules: {
            // TypeScript ESLint recommended rules
            ...tseslint.configs.recommended.rules,

            // Custom rule overrides
            // Strict unused-vars gate (decision: 2026-08): dead imports, unused
            // locals, and unused function args fail CI instead of warning, so
            // `pnpm run lint` (already part of the CI typecheck job) catches them
            // before merge. The intentional escape hatch is a `^_`-prefixed name
            // (e.g. `_req` for an Express param the handler doesn't use). Test
            // files are deliberately exempt — see the test-file block below.
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-namespace': 'off', // Allow namespaces for Express augmentation
            // Clean-code guardrails: cap function length and argument count
            // so regressions fail CI (see AGENTS.md local verification order).
            'max-lines-per-function': ['error', 100],
            'max-params': ['error', 4],
            'no-console': ['error', { allow: ['warn', 'error'] }],
            'no-unused-vars': 'off', // Use TypeScript's rule instead
            'preserve-caught-error': 'off', // Disabled: pre-existing patterns
            'no-useless-assignment': 'off', // Disabled: pre-existing patterns
        },
    },

    // Test files configuration (no project requirement - simpler parsing)
    {
        files: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
                // No project requirement for test files
            },
            globals: {
                ...globals.node,
                ...globals.es2021,
                ...globals.jest,
                Express: 'readonly',
                mockPool: 'readonly',
                mockAppwriteResult: 'readonly',
                mockAppwriteClient: 'readonly',
                mockAppwriteAccount: 'readonly',
                mockAppwriteUsers: 'readonly',
                mockAppwriteStorage: 'readonly',
                createMockBuilder: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
        },
        rules: {
            // Relaxed rules for test files
            '@typescript-eslint/no-explicit-any': 'off',
            // Unused-vars stays off here: test files intentionally declare
            // helpers/mocks that not every test path uses, and jest globals are
            // exercised dynamically. Source files are the strict gate.
            '@typescript-eslint/no-unused-vars': 'off',
            'no-unused-vars': 'off',
        },
    },

    // Ignore patterns
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'coverage/**',
            '*.cjs',
            'hardhat.config.cjs',
            'scripts/**/*.cjs',
            'contracts/**',
            'lint-output.txt',
        ],
    },
];
