// Turns the camera originals (5712px, ~8MB each) into 2400px web masters.
// Astro then generates responsive AVIF/WebP sizes from these at build time.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const SRC = path.resolve('..');
const OUT = path.resolve('src/assets/photos');
// Photos without bystanders' faces or readable third-party number plates.
const KEEP = {
  '0532': 'side-street', '0531': 'side-street-rear', '0547': 'deck-front',
  '0603': 'yard-side', '0604': 'yard-side-2', '0605': 'yard-hitch',
  '0606': 'yard-three-quarter', '0607': 'ramps', '0608': 'ramps-2',
  '0609': 'deck-length', '0610': 'axles', '0611': 'rear-quarter',
};
await mkdir(OUT, { recursive: true });
for (const [id, name] of Object.entries(KEEP)) {
  await sharp(path.join(SRC, `IMG_${id}.JPG`))
    .rotate()
    .resize({ width: 2400, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(path.join(OUT, `${name}.jpg`));
  console.log('✓', name);
}
