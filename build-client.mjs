import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
const { name } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await build({
  absWorkingDir: root, entryPoints: ['client-source.jsx'], outfile: 'client.js',
  bundle: true, format: 'cjs', platform: 'browser', target: ['chrome120'],
  jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  loader: { '.css': 'text' }, define: { 'process.env.NODE_ENV': '"production"' },
  sourcemap: false, minify: false, legalComments: 'inline',
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(name)}, factory(require) {\nconst module = { exports: {} };\nconst exports = module.exports;` },
  footer: { js: '\nreturn module.exports;\n} });' },
});
console.log('Built client.js with bundled Three.js and host-provided React.');
