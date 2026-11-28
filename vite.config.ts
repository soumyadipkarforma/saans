import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// GitHub Pages can't set headers, so the policy ships as a meta tag. Build only: dev needs inline HMR scripts.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  'connect-src https://air-quality-api.open-meteo.com https://geocoding-api.open-meteo.com https://generativelanguage.googleapis.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const securityMeta = (): Plugin => ({
  name: 'saans-security-meta',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' },
  ],
});

export default defineConfig({
  // GitHub Pages serves the app under /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), securityMeta()],
});
