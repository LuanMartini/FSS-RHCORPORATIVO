import { defineConfig } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: './test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 35,
        functions: 30,
        branches: 20,
        statements: 35,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 300,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replaceAll('\\', '/');
          if (!moduleId.includes('/node_modules/')) return;
          if (moduleId.includes('/react/') || moduleId.includes('/react-dom/') || moduleId.includes('/scheduler/')) return 'vendor-react';
          if (moduleId.includes('/leaflet/') || moduleId.includes('/react-leaflet/')) return 'vendor-maps';
          if (moduleId.includes('/victory-vendor/') || moduleId.includes('/d3-') || moduleId.includes('/internmap/')) return 'vendor-charts-primitives';
          if (moduleId.includes('/recharts/') || moduleId.includes('/react-redux/') || moduleId.includes('/redux') || moduleId.includes('/immer/') || moduleId.includes('/reselect/')) return 'vendor-charts';
          if (moduleId.includes('/socket.io-client/') || moduleId.includes('/engine.io-client/')) return 'vendor-realtime';
          if (moduleId.includes('/@tanstack/react-virtual/')) return 'vendor-virtual-list';
        },
      },
    },
  },
})
