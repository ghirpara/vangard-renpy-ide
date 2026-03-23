/**
 * @file vite.config.ts
 * @description Vite build configuration for the Vangard Ren'Py IDE.
 * Configures React plugin, environment variables, build optimization,
 * sourcemap generation, and Vitest test runner.
 */

/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Vite configuration exported as a function.
 * Supports different configurations for development and production modes.
 * @param {Object} config - Vite config object
 * @param {string} config.mode - Build mode ('development' or 'production')
 * @returns {Object} Vite configuration object
 */
export default defineConfig(({ mode }) => {
  const isDevelopment = mode === 'development';
  
  // Load environment variables from .env files
  // Third parameter '' loads all variables regardless of VITE_ prefix
  const env = loadEnv(mode, (process as any).cwd(), '');

  // Read package.json to inject application version
  const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf-8'));
  
  return {
    // React plugin for JSX transformation
    plugins: [react()],
    // Use relative paths for assets (supports Electron/standalone builds)
    base: './',
    // Global variable definitions for client-side code
    define: {
      /**
       * API key for external services (Gemini/Google GenAI)
       * Loaded from environment variables: GEMINI_API_KEY or API_KEY
       */
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.API_KEY),
      /**
       * Application version from package.json
       */
      'process.env.APP_VERSION': JSON.stringify(packageJson.version),
      /**
       * Build number for tracking builds
       * Defaults to 'dev' if not specified
       */
      'process.env.BUILD_NUMBER': JSON.stringify(env.BUILD_NUMBER || 'dev'),
    },
    // Strip console.log and console.warn from production builds.
    // console.error is kept — those indicate real problems.
    ...(!isDevelopment && {
      esbuild: {
        pure: ['console.log', 'console.warn'],
      },
    }),
    // Build optimization settings
    build: {
      // Always generate sourcemaps for debugging (even in production)
      sourcemap: true,
      // Disable minification in development to preserve line numbers for debugging
      minify: isDevelopment ? false : 'esbuild',
      // Support for CommonJS modules in ES modules build
      commonjsOptions: {
        transformMixedEsModules: true,
      },
      // Externalize dynamic imports for optional dependencies
      rollupOptions: {
        external: ['openai', '@anthropic-ai/sdk'],
      },
    },
    // Pre-bundle optimization for frequently used dependencies
    optimizeDeps: {
      include: ['use-immer', 'immer'],
    },
    // Resolve aliases for test environment
    resolve: {
      alias: {
        // useFileSystemManager.ts imports immer from a CDN URL; remap to the local package
        'https://aistudiocdn.com/immer@^10.1.1': 'immer',
      },
    },
    // Vitest test runner configuration
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
      include: ['**/*.test.{ts,tsx}'],
      exclude: ['node_modules', 'dist', 'release'],
      coverage: {
        provider: 'v8',
        include: ['components/**', 'hooks/**', 'contexts/**', 'App.tsx'],
        exclude: ['**/*.test.{ts,tsx}', 'test/**'],
      },
    },
  }
})
