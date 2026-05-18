import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // /graphql is server-side proxied to backend, so the friend only needs
      // port 5173 open. No CORS dance, no cross-origin cookie weirdness.
      '/graphql': { target: 'http://localhost:4000', changeOrigin: true },
      // OIDC SSO endpoints (status probe + the 302 redirect dance) run
      // on the backend; proxy so the SPA origin stays single-port and
      // the session cookies land same-site.
      '/auth/oidc': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
