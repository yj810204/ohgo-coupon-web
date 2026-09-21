import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);

register(
  `data:text/javascript,${encodeURIComponent(`
    import { existsSync } from 'node:fs';
    import { fileURLToPath } from 'node:url';

    const rootHref = ${JSON.stringify(root.href)};

    export async function resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('@/')) {
        const bare = new URL(specifier.slice(2), rootHref);
        const candidates = [bare.href, \`\${bare.href}.ts\`, \`\${bare.href}.tsx\`, \`\${bare.href}.mts\`, \`\${bare.href}.js\`];
        for (const href of candidates) {
          try {
            if (href.startsWith('file:') && !existsSync(fileURLToPath(href))) continue;
          } catch {
            continue;
          }
          return nextResolve(href, context);
        }
      }
      return nextResolve(specifier, context);
    }
  `)}`,
  pathToFileURL(fileURLToPath(import.meta.url)),
);
