import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve, dirname } from 'path'

/**
 * Vite plugin that redirects resolved imports of Tauri composables
 * to their web equivalents. Object-key aliases don't work here because
 * shared components use *relative* imports (e.g. '../composables/useTauri')
 * which are never matched against absolute alias keys. This plugin hooks
 * into resolveId after the relative path is resolved to an absolute path.
 */
function redirectTauriImports(): Plugin {
  const redirects: Record<string, string> = {
    [resolve(__dirname, '../src/composables/useTauri')]: resolve(__dirname, 'src/composables/useWeb.ts'),
    [resolve(__dirname, '../src/composables/useTauriEvents')]: resolve(__dirname, 'src/composables/useWebEvents.ts'),
  }

  return {
    name: 'redirect-tauri-imports',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return null
      const resolved = resolve(dirname(importer), source)
      return redirects[resolved] ?? null
    },
  }
}

export default defineConfig({
  plugins: [redirectTauriImports(), vue()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../src'),
    },
  },
  server: {
    port: 5173,
  },
})
