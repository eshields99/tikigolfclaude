// Converts the single-file Vite build into an HTML fragment (no <html>/<head>/<body> wrapper)
// suitable for publishing as a self-contained page: title first, then styles, markup and the module script.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('dist-single/index.html', 'utf8');
const title = (src.match(/<title>([\s\S]*?)<\/title>/) ?? [, 'Tiki Golf'])[1].trim();
const styles = [...src.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]);
const scripts = [...src.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
const body = (src.match(/<body[^>]*>([\s\S]*?)<\/body>/) ?? [, ''])[1].replace(/<script[\s\S]*?<\/script>/g, '').trim();
const out = [`<title>${title}</title>`, ...styles, body, ...scripts].join('\n');
writeFileSync('dist-single/tiki-golf.html', out);
console.log(`wrote dist-single/tiki-golf.html (${(out.length / 1024).toFixed(0)} KB), title "${title}", ${styles.length} style, ${scripts.length} script`);
