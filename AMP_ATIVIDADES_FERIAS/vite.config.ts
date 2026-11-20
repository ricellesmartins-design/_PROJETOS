import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  assetsInclude: ['**/*.xlsx'],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks: { exceljs: ['exceljs'], supabase: ['@supabase/supabase-js'], react: ['react', 'react-dom'] },
      },
    },
  },
  test: { environment: 'node' },
});
