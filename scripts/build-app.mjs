import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const projectDir = path.join(rootDir, 'project');
const outfile = path.join(rootDir, 'public', 'app.js');

// Vendor files define window globals (Home, Growth, etc.) — load before app.jsx
const vendorFiles = [
  'shared.jsx',
  'home.jsx',
  'growth.jsx',
  'habits.jsx',
  'travels.jsx',
  'gallery.jsx',
  'stocks.jsx',
  'storage.jsx',
  'tweaks_panel.jsx',
];

// Bundle each vendor file individually — use outdir to avoid multi-entry error
const vendorCode = [];
const tmpDir = path.join(rootDir, '.tmp-vendor');
fs.mkdirSync(tmpDir, { recursive: true });

for (const file of vendorFiles) {
  const outBase = path.join(tmpDir, file.replace('.jsx', '') + '.js');
  await esbuild.build({
    entryPoints: [path.join(projectDir, file)],
    bundle: true,
    outdir: tmpDir,
    outbase: projectDir,
    format: 'iife',
    jsx: 'automatic',
    jsxImportSource: 'react',
    logLevel: 'warning',
  });
  vendorCode.push(fs.readFileSync(outBase, 'utf8'));
  fs.unlinkSync(outBase);
}

// Combine all vendor code then app.jsx entry
const appCode = fs.readFileSync(path.join(projectDir, 'app.jsx'), 'utf8');
const combined = vendorCode.join('\n') + '\n' + appCode;

// Write combined code to a temp entry file (stdin+sourcefile trips newer esbuild)
const tmpEntry = path.join(tmpDir, 'app.jsx');
fs.writeFileSync(tmpEntry, combined);

// Final minified production bundle
await esbuild.build({
  entryPoints: [tmpEntry],
  bundle: true,
  minify: true,
  outdir: path.join(rootDir, 'public'),
  outbase: tmpDir,
  format: 'iife',
  jsx: 'automatic',
  jsxImportSource: 'react',
  logLevel: 'info',
});

fs.unlinkSync(tmpEntry);
fs.rmSync(tmpDir, { recursive: true });

const sizeKB = (fs.statSync(outfile).size / 1024).toFixed(1);
console.log(`✓ Built → public/app.js (${sizeKB}KB)`);
