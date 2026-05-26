import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// 过滤 sourcemap 警告的插件
function suppressSourcemapWarnings(): Plugin {
  return {
    name: 'suppress-sourcemap-warnings',
    enforce: 'pre',
    buildStart() {
      const originalWarn = console.warn
      console.warn = (...args: any[]) => {
        const message = String(args[0] || '')
        // 过滤 @antv/layout 的 sourcemap 警告
        if (message.includes('Sourcemap for') && message.includes('@antv/layout')) {
          return
        }
        // 过滤 CJS 弃用警告
        if (message.includes('CJS build of Vite') || message.includes('deprecated')) {
          return
        }
        originalWarn.apply(console, args)
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), suppressSourcemapWarnings()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    // 不要强制预构建 @antv/layout / @antv/algorithm：它们内部用 new URL('./worker.js', import.meta.url)
    // 打进 .vite/deps 后 worker 相对路径会失效，触发 “worker.js does not exist in optimize deps”。
    include: ['dagre'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    host: true,
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        ws: true, // 支持 WebSocket
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
        },
      },
    },
  },
})

