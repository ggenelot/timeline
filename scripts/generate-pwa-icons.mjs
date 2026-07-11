// Génère les icônes PWA (standard + maskable + apple-touch-icon) à partir de
// public/logo.png. À relancer si le logo change :
//   npm install -D sharp && node scripts/generate-pwa-icons.mjs && npm uninstall sharp
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const source = path.join(root, 'public', 'logo.png');
const outDir = path.join(root, 'public', 'icons');

const BRAND_COLOR = '#002D74';

async function main() {
  await mkdir(outDir, { recursive: true });

  // Icônes standard ("any") : simple redimensionnement, fond transparent.
  for (const size of [192, 512]) {
    await sharp(source)
      .resize(size, size)
      .png()
      .toFile(path.join(outDir, `icon-${size}.png`));
  }

  // Icônes maskable : logo réduit à ~70% et centré sur un fond opaque, pour
  // respecter la "safe zone" (le contenu important doit rester dans le
  // cercle central sous peine d'être rogné par le masque Android).
  for (const size of [192, 512]) {
    const inner = Math.round(size * 0.7);
    const logo = await sharp(source).resize(inner, inner).toBuffer();
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: BRAND_COLOR
      }
    })
      .composite([{ input: logo, gravity: 'center' }])
      .png()
      .toFile(path.join(outDir, `icon-maskable-${size}.png`));
  }

  // apple-touch-icon : iOS affiche du noir sur la transparence, donc fond
  // opaque obligatoire. Pas de masque à appliquer, iOS s'en charge.
  const appleInner = Math.round(180 * 0.9);
  const appleLogo = await sharp(source).resize(appleInner, appleInner).toBuffer();
  await sharp({
    create: {
      width: 180,
      height: 180,
      channels: 4,
      background: BRAND_COLOR
    }
  })
    .composite([{ input: appleLogo, gravity: 'center' }])
    .png()
    .toFile(path.join(outDir, 'apple-touch-icon.png'));

  console.log(`Icônes PWA générées dans ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
