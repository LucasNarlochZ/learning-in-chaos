import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/dist/**',
    '**/node_modules/**',
    'test-results/**',
    'playwright-report/**',
    'coverage/**',
  ]),
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.worker } },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': ['error', { args: 'none' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['apps/analytics/src/database/database.service.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  prettier,
);
