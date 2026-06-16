/**
 * Generate trayTemplate.png (16x16) and trayTemplate@2x.png (32x32)
 * from tray1.svg.
 *
 * macOS template images must be black-on-transparent (the OS tints them).
 * The SVG uses currentColor, so we replace it with black before rendering.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'src', 'renderer', 'public');

// Read SVG and replace currentColor with black for template image
const svgRaw = readFileSync(join(publicDir, 'tray1.svg'), 'utf-8');
const svgBlack = svgRaw.replace(/currentColor/g, '#000000');

async function main() {
  // Dynamically import sharp
  const { default: sharp } = await import('sharp');

  // 1x — 16×16
  const buf16 = await sharp(Buffer.from(svgBlack))
    .resize(16, 16)
    .png()
    .toBuffer();
  writeFileSync(join(publicDir, 'trayTemplate.png'), buf16);
  console.log('✔  trayTemplate.png   (16×16)');

  // 2x — 32×32
  const buf32 = await sharp(Buffer.from(svgBlack))
    .resize(32, 32)
    .png()
    .toBuffer();
  writeFileSync(join(publicDir, 'trayTemplate@2x.png'), buf32);
  console.log('✔  trayTemplate@2x.png (32×32)');
}

main().catch(err => {
  console.error('Failed to generate tray icons:', err);
  process.exit(1);
});
