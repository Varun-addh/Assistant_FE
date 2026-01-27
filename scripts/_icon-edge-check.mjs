import sharp from "sharp";

async function borderStats(file) {
  const meta = await sharp(file).metadata();
  if (!meta.width || !meta.height) throw new Error(`Missing dimensions for ${file}`);

  // Decode pixels without forcing alpha so we can see what the PNG actually contains.
  const decoded = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const raw = decoded.data;
  const w = decoded.info.width;
  const h = decoded.info.height;
  const channels = decoded.info.channels;

  const px = (x, y) => {
    const i = (y * w + x) * channels;
    return [raw[i], raw[i + 1], raw[i + 2]];
  };

  const step = Math.max(1, Math.floor(Math.min(w, h) / 64));

  const samples = [];
  for (let x = 0; x < w; x += step) {
    samples.push(px(x, 0), px(x, h - 1));
  }
  for (let y = 0; y < h; y += step) {
    samples.push(px(0, y), px(w - 1, y));
  }

  const avg = samples
    .reduce((a, [r, g, b]) => [a[0] + r, a[1] + g, a[2] + b], [0, 0, 0])
    .map((v) => Math.round(v / samples.length));

  const inset = Math.max(1, Math.floor(Math.min(w, h) / 128) * 4);
  const samples2 = [];
  for (let x = inset; x < w - inset; x += step) {
    samples2.push(px(x, inset), px(x, h - 1 - inset));
  }
  for (let y = inset; y < h - inset; y += step) {
    samples2.push(px(inset, y), px(w - 1 - inset, y));
  }
  const avg2 = samples2
    .reduce((a, [r, g, b]) => [a[0] + r, a[1] + g, a[2] + b], [0, 0, 0])
    .map((v) => Math.round(v / samples2.length));

  return {
    file,
    width: meta.width,
    height: meta.height,
    fileChannels: meta.channels,
    fileHasAlpha: meta.hasAlpha,
    decodedChannels: channels,
    borderAvg: avg,
    insetAvg: avg2,
    step,
    inset,
  };
}

const files = [
  "public/icons/stratax-ai-512.png",
  "public/icons/stratax-ai-maskable-512.png",
  "public/icons/stratax-ai-192.png",
  "public/icons/stratax-ai-maskable-192.png",
];

for (const f of files) {
  const stats = await borderStats(f);
  console.log(JSON.stringify(stats, null, 2));
}
