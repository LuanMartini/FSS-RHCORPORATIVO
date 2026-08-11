import { defineConfig, type Plugin } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

function bundleAnalysis(): Plugin {
  return {
    name: 'bundle-analysis',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue
        const modules = Object.entries(output.modules)
          .map(([id, details]) => ({ id, bytes: details.renderedLength }))
          .sort((left, right) => right.bytes - left.bytes)
          .slice(0, 20)
        console.log(`\n[chunk-analysis] ${output.fileName} (${output.code.length} bytes)`)
        for (const module of modules) console.log(`${module.bytes}\t${module.id}`)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    ...(mode === 'analyze' ? [bundleAnalysis()] : []),
  ],
  build: {
    chunkSizeWarningLimit: 300,
    // Vite 8 usa Rolldown; codeSplitting.groups e o sucessor nativo de manualChunks.
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler|use-sync-external-store)[\\/]/,
              priority: 40,
              includeDependenciesRecursively: false,
            },
            {
              name: 'vendor-maps',
              test: /node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/,
              priority: 30,
              includeDependenciesRecursively: false,
            },
            {
              name: 'vendor-charts-runtime',
              test: /node_modules[\\/](@reduxjs|react-redux|redux|reselect|immer|decimal\.js-light|d3-[^\\/]+|internmap|victory-vendor|tiny-invariant|es-toolkit|eventemitter3|react-is|clsx|fast-equals)[\\/]/,
              priority: 25,
              includeDependenciesRecursively: false,
            },
            {
              name: 'vendor-charts',
              test: /node_modules[\\/]recharts[\\/]/,
              priority: 20,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './test/setup.ts',
    clearMocks: true,
  },
}))
