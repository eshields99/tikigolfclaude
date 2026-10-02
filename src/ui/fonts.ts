// Latin-only WOFF2 faces (inlined as data URIs in the single-file build) registered via the FontFace API.
import lilita400 from '@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2?url';
import fredoka400 from '@fontsource/fredoka/files/fredoka-latin-400-normal.woff2?url';
import fredoka500 from '@fontsource/fredoka/files/fredoka-latin-500-normal.woff2?url';
import fredoka600 from '@fontsource/fredoka/files/fredoka-latin-600-normal.woff2?url';
import fredoka700 from '@fontsource/fredoka/files/fredoka-latin-700-normal.woff2?url';

export async function loadFonts(timeoutMs = 2500) {
  if (!('fonts' in document) || typeof FontFace === 'undefined') return;
  const faces = [
    new FontFace('Lilita One', `url(${lilita400}) format('woff2')`, { weight: '400', display: 'swap' }),
    new FontFace('Fredoka', `url(${fredoka400}) format('woff2')`, { weight: '400', display: 'swap' }),
    new FontFace('Fredoka', `url(${fredoka500}) format('woff2')`, { weight: '500', display: 'swap' }),
    new FontFace('Fredoka', `url(${fredoka600}) format('woff2')`, { weight: '600', display: 'swap' }),
    new FontFace('Fredoka', `url(${fredoka700}) format('woff2')`, { weight: '700', display: 'swap' }),
  ];
  for (const f of faces) document.fonts.add(f);
  await Promise.race([Promise.all(faces.map((f) => f.load().catch(() => null))), new Promise((r) => setTimeout(r, timeoutMs))]);
}
