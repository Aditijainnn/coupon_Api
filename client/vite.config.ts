import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The Coupon API runs on port 3000 (`npm run dev` in the coupon-api folder).
// Vite forwards the API's paths to it, so the page and the API share one address
// (http://localhost:5173) and the API needs no CORS setup.
const API_URL = 'http://localhost:3000';
const apiProxy = {
  '/coupons': API_URL,
  '/health': API_URL,
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: apiProxy },
  preview: { port: 4173, proxy: apiProxy },
});
