import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api/ollama': {
          target: process.env.DEV_PROXY_ORIGIN || 'http://localhost:8788',
          changeOrigin: true,
        },
        '/api/keys': {
          target: process.env.DEV_PROXY_ORIGIN || 'http://localhost:8788',
          changeOrigin: true,
        },
        '/api/auth': {
          target: process.env.DEV_PROXY_ORIGIN || 'http://localhost:8788',
          changeOrigin: true,
        },
      },
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.OLLAMA_API_KEY': JSON.stringify(env.OLLAMA_API_KEY),
      'process.env.OLLAMA_URL': JSON.stringify(env.OLLAMA_URL),
      'process.env.OLLAMA_MODEL': JSON.stringify(env.OLLAMA_MODEL)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined;
            }

            if (id.includes('@google/genai')) {
              return 'gemini-chunk';
            }
            if (id.includes('react-markdown') || id.includes('remark')) {
              return 'markdown-chunk';
            }
            if (id.includes('lucide-react')) {
              return 'icons-chunk';
            }
            if (id.includes('motion')) {
              return 'motion-chunk';
            }
            if (id.includes('pdfjs-dist')) {
              return 'pdf-chunk';
            }
            if (id.includes('react')) {
              return 'react-vendor';
            }
            return 'vendor';
          }
        }
      }
    }
  };
});
