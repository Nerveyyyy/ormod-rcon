import tseslint from 'typescript-eslint'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  // ── Global ignores ──────────────────────────────────────────────────────────
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'apps/api/src/generated/**',
      // Compiled TypeScript output emitted in-tree (web tsconfig has no outDir)
      // Must be excluded so Prettier/ESLint never touch compiled artifacts
      'apps/web/src/**/*.js',
      'apps/web/src/**/*.js.map',
      'apps/web/src/**/*.d.ts',
      'apps/web/src/**/*.d.ts.map',
    ],
  },

  // ── TypeScript base — all TS/TSX files ──────────────────────────────────────
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
  },

  // ── React overlay — web only ─────────────────────────────────────────────────
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactPlugin.configs.flat.recommended],
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      // eslint-plugin-react@7 calls context.getFilename() when version:'detect',
      // which was removed in ESLint v10. Pin the version explicitly instead.
      react: { version: '19.0' },
    },
    rules: {
      // Only classic hooks rules — this project does not use the React Compiler.
      // react-hooks v7 recommended includes many React Compiler-specific rules
      // (set-state-in-effect, preserve-manual-memoization, etc.) that flag valid
      // non-Compiler patterns. Opt in to only the two classic rules instead.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // React 17+ JSX transform — no need to import React for JSX
      'react/react-in-jsx-scope': 'off',
      // TypeScript handles prop validation — prop-types redundant
      'react/prop-types': 'off',
      // Arrow function components don't need display names; TS handles component typing
      'react/display-name': 'off',
    },
  },

  // ── API-specific rules ───────────────────────────────────────────────────────
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      // API uses pino for logging — console.log is a mistake
      'no-console': 'warn',
    },
  },

  // ── Test overrides ───────────────────────────────────────────────────────────
  {
    files: ['apps/api/tests/**/*.ts'],
    rules: {
      // Tests use console for debugging; any casts common in mocks and factories
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // ── Prettier — MUST be last to disable conflicting formatting rules ───────────
  prettierConfig
)
