import { build } from 'esbuild';

const entryPoints = {
  api: 'src/api/lambda.ts',
};

for (const [name, entry] of Object.entries(entryPoints)) {
  await build({
    entryPoints: [entry],
    outfile: `build/lambda/${name}/index.mjs`,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    minify: true,
    sourcemap: true,
    external: ['pg-native'],
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
  });
  console.log(`Built build/lambda/${name}/index.mjs`);
}
