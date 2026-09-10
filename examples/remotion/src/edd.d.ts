/**
 * `import source from './pipeline.edd'` — the `asset/source` webpack rule in
 * remotion.config.ts turns a `.edd` file into a string; this tells TypeScript.
 */
declare module '*.edd' {
  const content: string;
  export default content;
}
