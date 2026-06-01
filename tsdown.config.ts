import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/extension.ts'],
  format: 'esm',
  outDir: 'out',
  platform: 'node',
  target: 'es2022',
  fixedExtension: false,
  sourcemap: true,
  clean: true,
  // `vscode` is injected by the extension host, never a real dependency on disk.
  deps: { neverBundle: ['vscode'] },
});
