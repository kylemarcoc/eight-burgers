import { builtinModules } from 'node:module';
import { defineConfig } from 'vitest/config';

const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((mod) => `node:${mod}`)]);

const externalDependencies = new Set(['@hono/node-server', '@supabase/supabase-js', 'hono', 'zod']);

export default defineConfig({
  build: {
    ssr: 'src/index.ts',
    outDir: 'dist',
    target: 'node22',
    sourcemap: true,
    rolldownOptions: {
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
