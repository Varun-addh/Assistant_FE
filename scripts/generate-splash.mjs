import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const root = process.cwd();
const outDir = path.join(root, "public", "splash");

const arg = (name, fallback) => {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
};

const bg = String(arg("--background", "#171b3c")).trim();

const hexToRgba = (hex) => {
  const h = String(hex || "").trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 23, g: 27, b: 60, alpha: 1 };
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b, alpha: 1 };
};

// Icon to composite on the startup image. Prefer the opaque apple-touch-icon if present,
// otherwise fall back to the source file.
const iconsDir = path.join(root, "public", "icons");
const preferredIcon = path.join(iconsDir, "apple-touch-icon.png");
const fallbackIcon = path.join(iconsDir, "source.png");
const iconPath = await (async () => {
  try {
    await fs.access(preferredIcon);
    return preferredIcon;
  } catch { }
  try {
    await fs.access(fallbackIcon);
    return fallbackIcon;
  } catch { }
  return null;
})();

// Common iOS startup image sizes (portrait). These cover most devices.
// Filenames are kept deterministic so we can reference them from index.html.
const SIZES = [
  // iPhones
  { w: 1170, h: 2532, dpr: 3 }, // iPhone 12/13/14
  { w: 1284, h: 2778, dpr: 3 }, // iPhone 12/13/14 Pro Max
  { w: 1125, h: 2436, dpr: 3 }, // iPhone X/XS/11 Pro
  { w: 1242, h: 2688, dpr: 3 }, // iPhone XS Max/11 Pro Max
  { w: 828, h: 1792, dpr: 2 }, // iPhone XR/11
  { w: 750, h: 1334, dpr: 2 }, // iPhone 6/7/8/SE2/SE3
  { w: 1242, h: 2208, dpr: 3 }, // iPhone 6+/7+/8+

  // iPads
  { w: 1536, h: 2048, dpr: 2 }, // iPad portrait
  { w: 1668, h: 2224, dpr: 2 }, // iPad Pro 10.5"
  { w: 1668, h: 2388, dpr: 2 }, // iPad Pro 11"
  { w: 2048, h: 2732, dpr: 2 }, // iPad Pro 12.9"
];

const main = async () => {
  await fs.mkdir(outDir, { recursive: true });

  for (const s of SIZES) {
    const file = `ios-${s.w}x${s.h}.png`;
    const outPath = path.join(outDir, file);

    // Create a plain background and composite the app icon centered, if available.
    let canvas = sharp({
      create: {
        width: s.w,
        height: s.h,
        channels: 4,
        background: hexToRgba(bg),
      },
    }).png({ compressionLevel: 9, adaptiveFiltering: true });

    if (iconPath) {
      try {
        // Resize the icon to be about 36% of the shorter edge so it reads well on all screens.
        const iconSize = Math.round(Math.min(s.w, s.h) * 0.36);

        // Stronger emblem extraction pipeline:
        // 1) Resize a large working copy of the icon.
        // 2) Produce a mask by greyscaling + blur + threshold to isolate the bright emblem
        //    from a darker rounded-rect background baked into the artwork.
        // 3) Apply the mask (dest-in) to the original icon to remove the rounded rect.
        // 4) Resize to final icon size and flatten onto the target background.
        let iconBuffer;
        try {
          const workSize = Math.max(1024, iconSize * 2);
          const source = sharp(iconPath).ensureAlpha().resize(workSize, workSize, { fit: 'contain' });

          // Create mask: dark background becomes black, bright emblem becomes white
          // Tune threshold (0-255) if needed.
          const mask = await source.clone().greyscale().blur(1).threshold(120).png().toBuffer();

          // Original high-res icon buffer
          const iconHigh = await source.png().toBuffer();

          // Apply mask to icon (keep only masked area)
          const masked = await sharp(iconHigh).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();

          // Final resize and flatten to remove any remaining transparent edges
          iconBuffer = await sharp(masked).resize(iconSize, iconSize, { fit: 'contain' }).flatten({ background: hexToRgba(bg) }).png().toBuffer();
        } catch (e) {
          // If mask pipeline fails, fall back to previous conservative approach.
          try {
            iconBuffer = await sharp(iconPath).ensureAlpha().resize(iconSize, iconSize, { fit: 'contain' }).flatten({ background: hexToRgba(bg) }).png().toBuffer();
          } catch (err) {
            throw err;
          }
        }

        // Composite at center
        canvas = canvas.composite([{ input: iconBuffer, left: Math.round((s.w - iconSize) / 2), top: Math.round((s.h - iconSize) / 2) }]);
      } catch (err) {
        // If compositing fails, fall back to a plain background.
        console.warn('Warning: failed to composite icon into splash:', err.message || err);
      }
    }

    await canvas.toFile(outPath);
    console.log(`✓ Wrote ${path.relative(root, outPath)}`);
  }

  console.log("Done.");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
