import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const projectDir = path.join(rootDir, 'project');
const outfile = path.join(rootDir, 'public', 'app.js');

const files = [
  'shared.jsx', 'home.jsx', 'growth.jsx', 'habits.jsx',
  'travels.jsx', 'gallery.jsx', 'stocks.jsx', 'storage.jsx',
  'tweaks_panel.jsx', 'app.jsx'
];

const combined = files.map(f => {
  const p = path.join(projectDir, f);
  const content = fs.readFileSync(p, 'utf8');
  return `// === ${f} ===\n${content}`;
}).join('\n\n');

// Build with stdin — no resolveDir to avoid picking up extra files
const result = await esbuild.build({
  entryPoints: ['-'],
  stdin: {
    contents: combined,
    sourcefile: 'app.jsx',
    // Don't set resolveDir — avoid esbuild scanning projectDir for multiple inputs
  },
  bundle: true,
  minify: false,
  outfile,
  format: 'iife',
  jsx: 'automatic',
  jsxImportSource: 'react',
  logLevel: 'info',
});

const sizeKB = (fs.statSync(outfile).size / 1024).toFixed(0);
console.log(`Done: ${sizeKB}KB bundle`);
const content = fs.readFileSync(outfile, 'utf8');
console.log('Has Home:', content.includes('function Home'));
console.log('Has Travels:', content.includes('function Travels'));
console.log('Has Stocks:', content.includes('function Stocks'));
console.log('First 300:', content.slice(0, 300));
