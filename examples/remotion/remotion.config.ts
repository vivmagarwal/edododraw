import {Config} from '@remotion/cli/config';

Config.setEntryPoint('./src/index.ts');
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

/**
 * Teach the bundler to import a `.edd` file as a plain string.
 *
 * `asset/source` is webpack's built-in "give me the file contents" module type,
 * so `import source from './pipeline.edd'` yields the source text at build time
 * — no fetch, nothing async, and the string is baked into every render worker.
 *
 * If you would rather not touch the bundler config, keep the diagram in a `.ts`
 * file instead: `export const SOURCE = \`scene { a --> b }\`;`
 */
Config.overrideWebpackConfig((config) => ({
  ...config,
  module: {
    ...config.module,
    rules: [...(config.module?.rules ?? []), {test: /\.edd$/, type: 'asset/source'}],
  },
}));
