import esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

const entries = {
  'content/content.js': 'content/content.ts',
  'background/background.js': 'background/background.ts',
  'popup/popup.js': 'popup/popup.ts',
};

async function build() {
  const builds = Object.entries(entries).map(([outfile, entry]) =>
    esbuild.build({
      entryPoints: [resolve(__dirname, entry)],
      outfile: resolve(__dirname, outfile),
      bundle: true,
      format: 'iife',
      target: ['chrome100', 'firefox100'],
      platform: 'browser',
    }),
  );

  await Promise.all(builds);
  console.log('Extension built successfully.');
}

if (isWatch) {
  const ctxs = await Promise.all(
    Object.entries(entries).map(([outfile, entry]) =>
      esbuild.context({
        entryPoints: [resolve(__dirname, entry)],
        outfile: resolve(__dirname, outfile),
        bundle: true,
        format: 'iife',
        target: ['chrome100', 'firefox100'],
        platform: 'browser',
      }),
    ),
  );

  await Promise.all(ctxs.map((ctx) => ctx.watch()));
  console.log('Watching for changes...');
} else {
  build().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
