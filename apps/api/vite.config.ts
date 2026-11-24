import { builtinModules } from 'node:module';
import { defineConfig } from 'vitest/config';

const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((mod) => `node:${mod}`)]);

const externalDependencies = new Set([
  '@hono/node-server',
  '@supabase/supabase-js',
  'hono',
  'sharp',
  'zod',
]);

export default defineConfig({
  build: {
    ssr: true,
    outDir: 'dist',
    target: 'node22',
    sourcemap: true,
    rolldownOptions: {
      input: {
        index: 'src/index.ts',
        vercel: 'src/vercel.ts',
      },
      external: (id) =>
        nodeBuiltins.has(id) ||
        externalDependencies.has(id) ||
        [...externalDependencies].some((dep) => id.startsWith(`${dep}/`)),
    },
  },
  test: {
    environment: 'node',
  },
});
