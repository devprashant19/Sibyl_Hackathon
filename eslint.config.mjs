// Shared lint config for every TypeScript package except the dashboard and ui, which carry their own
// (Next.js / React) configs. ESLint 9 finds this file from any package directory.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.next/**', '**/.sibyl/**',
      '**/target/**', '**/*.d.ts', 'packages/dashboard/**', 'packages/ui/**',
      'packages/cli/examples/.*/**', 'packages/e2e/playwright-report/**', 'packages/e2e/test-results/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // The engine deals in arbitrary user payloads and driver internals; `any` is a deliberate choice
      // at those boundaries, not an oversight to be linted away.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },
);
