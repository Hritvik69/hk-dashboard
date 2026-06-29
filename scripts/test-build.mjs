import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const projectDir = path.join(rootDir, 'project');

const result = await esbuild.build({
  entryPoints: [path.join(projectDir, 'app.jsx')],
  bundle: true,
  minify: false,
  outfile: path.join(rootDir, 'public', 'app.js'),
  format: 'iife',
  jsx: 'automatic',
  jsxImportSource: 'react',
  logLevel: 'info',
  metafile: true,
});

const files = Object.keys(result.metafile.outputs);
console.log('Output files:', files);
const size = result.metafile.outputs[files[0]].bytes;
console.log('Bundle size:', (size / 1024).toFixed(0), 'KB');
