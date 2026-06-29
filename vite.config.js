import { defineConfig } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';

export default defineConfig({
  plugins: [
    createHtmlPlugin({
      inject: {
        tags: [
          {
            injectTo: 'body',
            tag: 'script',
            attrs: { src: '/app.js' },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: 'index.html',
      output: {
        // Content hash = browser always fetches fresh file on new deploy
        entryFileNames: 'assets/app.[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
      },
    },
  },
});
