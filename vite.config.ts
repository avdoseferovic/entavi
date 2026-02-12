import { defineConfig } from 'vite'

export default defineConfig(() => {
  return {
    // Vite config optimized for Tauri
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },
  }
})