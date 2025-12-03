import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/__tests__/**/*.ts'],
    exclude: ['node_modules', 'dist', 'openpro-api-react', 'src/**/__tests__/helpers.ts', 'src/**/__tests__/d1TestHelper.ts'],
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
});

