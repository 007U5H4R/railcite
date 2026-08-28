import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  // tsconfig.json sets "jsx": "preserve" (required by Next.js's own SWC compiler).
  // Vite 8's oxc transform inherits that "preserve" setting by default and leaves raw
  // JSX in the output, which fails to parse. Force the automatic JSX runtime for the
  // test pipeline only; Next.js's build is unaffected since it never reads this file.
  oxc: { jsx: { runtime: 'automatic' } },
  test: { globals: true, environment: 'node', setupFiles: ['tests/setup.ts'], include: ['tests/**/*.test.{ts,tsx}'], passWithNoTests: true },
});
