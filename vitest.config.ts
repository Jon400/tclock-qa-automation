import { defineConfig } from 'vitest/config'

// Unit tests for the framework (src/), the gate and driver (tools/), and the hooks.
// They never open a browser and never reach TClock.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 60_000
  }
})
