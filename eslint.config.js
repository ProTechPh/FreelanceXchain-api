import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import globals from 'globals';

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
            '@typescript-eslint/no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-namespace': 'off', // Allow namespaces for Express augmentation
            'no-console': ['error', { allow: ['warn', 'error'] }],
            'no-unused-vars': 'off', // Use TypeScript's rule instead
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
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
        },
        rules: {
            // Relaxed rules for test files
            '@typescript-eslint/no-explicit-any': 'off',
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
