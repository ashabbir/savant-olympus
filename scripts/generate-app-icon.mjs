/**
 * Generate build/icon.icns from main1.svg using sharp + iconutil.
 *
 * macOS .icns requires an iconset folder with specific sizes:
 *   16x16, 32x32 (16@2x), 32x32, 64x64 (32@2x),
 *   128x128, 256x256 (128@2x), 256x256, 512x512 (256@2x),
 *   512x512, 1024x1024 (512@2x)
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'src', 'renderer', 'public', 'main1.svg');
const iconsetDir = join(root, 'build', 'icon.iconset');
const icnsPath = join(root, 'build', 'icon.icns');
const pngPath = join(root, 'build', 'icon.png');

const svgRaw = readFileSync(svgPath);

const sizes = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
];

async function main() {
  const { default: sharp } = await import('sharp');

  // Create iconset directory
  mkdirSync(iconsetDir, { recursive: true });

  // Generate each size
  for (const { name, size } of sizes) {
    const buf = await sharp(svgRaw, { density: Math.max(72, Math.round(72 * size / 512 * 4)) })
      .resize(size, size)
      .png()
      .toBuffer();
    writeFileSync(join(iconsetDir, name), buf);
    console.log(`  ✔  ${name} (${size}×${size})`);
  }

  // Also generate build/icon.png at 512x512 for electron-builder
  const png512 = await sharp(svgRaw, { density: 288 })
    .resize(512, 512)
    .png()
    .toBuffer();
  writeFileSync(pngPath, png512);
  console.log(`  ✔  icon.png (512×512)`);

  // Use macOS iconutil to create .icns
  execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`);
  console.log(`\n✔  ${icnsPath}`);

  // Clean up iconset directory
  execSync(`rm -rf "${iconsetDir}"`);
}

main().catch(err => {
  console.error('Failed to generate icon:', err);
  process.exit(1);
});
