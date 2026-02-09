import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const root = process.cwd();
const iconsDir = path.join(root, "public", "icons");

const arg = (name, fallback) => {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
};

const input = arg("--input", path.join(iconsDir, "source.png"));
// Background fill for generated icons.
// Use --background "auto" (default) to sample from the source image.
const bg = arg("--background", "auto");
// If auto sampling produces a near-white background, fall back to this.
// This avoids the iOS home-screen icon showing a light/white "border" around the rounded mask.
const fallbackBg = arg("--fallback-background", "#171b3c");
// Non-maskable icon style:
// - badge (default): circular badge behind the logo (helps splash look rounded even if OS/browser shows square icons)
// - fullbleed: use the source image as full canvas
const anyStyle = String(arg("--any-style", "fullbleed")).toLowerCase();
const anyBadgeOpacity = Number(arg("--any-badge-opacity", "0.08"));
// When true, non-maskable icons are exported with transparent outer area.
// This helps the splash/logo read as a true circle even on devices that use a squircle mask.
// Keep maskable icons opaque.
const anyAlpha = String(arg("--any-alpha", "false")).toLowerCase() !== "false";
// Default keeps a safe zone for Android adaptive masks while still letting the logo feel large.
// You can override per-run: `npm run icons:generate -- --maskable-scale 0.72`
const maskableScale = Number(arg("--maskable-scale", "0.78"));
const trimThreshold = Number(arg("--trim-threshold", "6"));
// Non-maskable icon logo size (regular PWA icon + iOS apple-touch-icon)
const logoScale = Number(arg("--logo-scale", "0.86"));
// Optional: shrink logo a bit for PWA "any" icons so it reads circular on splash.
const anyLogoScale = Number(arg("--any-logo-scale", "0.78"));
// If the source image contains a subtle frame/border near the edges, crop a tiny amount
// before resizing to avoid visible edge outlines on launchers.
// Set to 0 to disable. Typical values: 0.01 - 0.04
const bleedCrop = Number(arg("--bleed-crop", "0.03"));

const hexToRgba = (hex, alpha = 1) => {
  const h = String(hex || "").trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 11, g: 18, b: 32, alpha };
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b, alpha };
};

const toHex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const rgbToHex = (r, g, b) => `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;

let resolvedBg = bg;

const hexToRgb = (hex) => {
  const h = String(hex || "").trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};

const relativeLuminance = (rgb) => {
  const toLin = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = toLin(rgb.r);
  const g = toLin(rgb.g);
  const b = toLin(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const clamp01 = (n, fallback) => {
  const v = Number.isFinite(n) ? n : fallback;
  return Math.max(0.01, Math.min(0.99, v));
};

const makeBase = (size) =>
  sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: hexToRgba(resolvedBg, 1),
    },
  });

const makeTransparentBase = (size) =>
  sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

const finalizeOpaquePng = (img) =>
  img
    // Flatten guarantees an opaque RGB output (some launchers treat any alpha channel as black).
    .flatten({ background: hexToRgba(resolvedBg, 1) })
    .removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: true });

const finalizePng = (img) =>
  img.png({ compressionLevel: 9, adaptiveFiltering: true });

const makeTrimmedLogoBuffer = async (size) => {
  return sharp(input)
    .ensureAlpha()
    // Remove transparent padding so the logo fills more of the icon.
    .trim({ threshold: Number.isFinite(trimThreshold) ? trimThreshold : 6 })
    .resize(size, size, { fit: "contain" })
    .png()
    .toBuffer();
};

const clampOpacity = (n, fallback) => {
  const v = Number.isFinite(n) ? n : fallback;
  return Math.max(0, Math.min(1, v));
};

const makeBadgeSvg = (size) => {
  const cx = size / 2;
  const cy = size / 2;
  // Slightly smaller badge so the icon reads circular even when the OS applies a squircle mask.
  const r = size * 0.385;
  const fillA = clampOpacity(anyBadgeOpacity, 0.08);
  // Slight inner highlight + soft shadow to make the badge read as circular on splash.
  return Buffer.from(`
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g" cx="30%" cy="25%" r="75%">
          <stop offset="0%" stop-color="rgba(255,255,255,${Math.min(0.14, fillA + 0.06)})" />
          <stop offset="65%" stop-color="rgba(255,255,255,${fillA})" />
          <stop offset="100%" stop-color="rgba(0,0,0,${Math.min(0.12, fillA + 0.05)})" />
        </radialGradient>
        <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="rgba(0,0,0,0.28)" />
        </filter>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#g)" filter="url(#s)" />
      <circle cx="${cx}" cy="${cy}" r="${r - Math.max(2, Math.round(size * 0.008))}" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="${Math.max(2, Math.round(size * 0.008))}" />
    </svg>
  `);
};

const makeLogoIcon = async (size, scale) => {
  const s = clamp01(scale, 0.86);

  // If explicitly requested, keep the prior full-bleed behavior.
  if (anyStyle === "fullbleed" && s >= 0.999) {
    const src = sharp(input).ensureAlpha();
    const meta = await src.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;

    const crop = clamp01(bleedCrop, 0.03);
    const useCrop = Number.isFinite(bleedCrop) && bleedCrop > 0.0001 && w > 0 && h > 0;
    const inset = useCrop ? Math.round(Math.min(w, h) * crop) : 0;
    const extracted = useCrop && inset > 0
      ? src.extract({ left: inset, top: inset, width: Math.max(1, w - inset * 2), height: Math.max(1, h - inset * 2) })
      : src;

    return finalizeOpaquePng(extracted.resize(size, size, { fit: "cover", position: "centre" }));
  }

  // Default: circular badge look. Even if an OS/browser renders the icon as a square on splash,
  // the visible content reads as circular and avoids the "square edges" feel.
  const innerSize = Math.round(size * s);
  const pad = Math.round((size - innerSize) / 2);
  const inner = await makeTrimmedLogoBuffer(innerSize);
  const badge = makeBadgeSvg(size);
  return finalizeOpaquePng(
    makeBase(size).composite([
      { input: badge, top: 0, left: 0 },
      { input: inner, left: pad, top: pad },
    ])
  );
};

const makeAppleTouchIcon = async (size) => {
  // iOS home-screen icons are always rendered as a rounded rect mask.
  // If we export a badge-style icon (circle in a square) and the background is light,
  // it reads as an ugly border. For apple-touch-icon, always export full-bleed.
  const src = sharp(input).ensureAlpha();
  const meta = await src.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;

  const crop = clamp01(bleedCrop, 0.03);
  const useCrop = Number.isFinite(bleedCrop) && bleedCrop > 0.0001 && w > 0 && h > 0;
  const inset = useCrop ? Math.round(Math.min(w, h) * crop) : 0;
  const extracted = useCrop && inset > 0
    ? src.extract({ left: inset, top: inset, width: Math.max(1, w - inset * 2), height: Math.max(1, h - inset * 2) })
    : src;

  return finalizeOpaquePng(extracted.resize(size, size, { fit: "cover", position: "centre" }));
};

const makeAnyIcon = async (size) => {
  // For non-maskable PWA icons, prefer full-bleed output (like app icons) to avoid
  // visible borders/edges when the OS applies its own rounded-rect mask.
  if (anyStyle === "fullbleed") {
    const src = sharp(input).ensureAlpha();
    const meta = await src.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;

    const crop = clamp01(bleedCrop, 0.03);
    const useCrop = Number.isFinite(bleedCrop) && bleedCrop > 0.0001 && w > 0 && h > 0;
    const inset = useCrop ? Math.round(Math.min(w, h) * crop) : 0;
    const extracted = useCrop && inset > 0
      ? src.extract({ left: inset, top: inset, width: Math.max(1, w - inset * 2), height: Math.max(1, h - inset * 2) })
      : src;

    return finalizeOpaquePng(extracted.resize(size, size, { fit: "cover", position: "centre" }));
  }

  // For non-maskable icons we optionally keep alpha outside the badge.
  // This makes the visible icon read as a circle on splash screens.
  const s = clamp01(anyLogoScale, 0.78);
  const innerSize = Math.round(size * s);
  const pad = Math.round((size - innerSize) / 2);
  const inner = await makeTrimmedLogoBuffer(innerSize);
  const badge = makeBadgeSvg(size);

  const canvas = anyAlpha ? makeTransparentBase(size) : makeBase(size);
  const out = canvas.composite([
    { input: badge, top: 0, left: 0 },
    { input: inner, left: pad, top: pad },
  ]);
  return anyAlpha ? finalizePng(out) : finalizeOpaquePng(out);
};

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const exists = async (p) => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

const makeMaskable = async (size) => {
  // Maskable icons: clean solid background + large trimmed logo inside a safe inset.
  const safe = Math.max(1, Math.min(size, Math.round(size * clamp01(maskableScale, 0.78))));
  const pad = Math.round((size - safe) / 2);
  const inner = await makeTrimmedLogoBuffer(safe);
  return finalizeOpaquePng(makeBase(size).composite([{ input: inner, left: pad, top: pad }]));
};

const main = async () => {
  await ensureDir(iconsDir);

  if (!(await exists(input))) {
    console.error(`Missing input image: ${input}`);
    console.error(
      "Place your new icon image at public/icons/source.png (or pass --input path) and rerun."
    );
    process.exit(1);
  }

  // Resolve background color.
  // Many Android launchers will show the canvas background around your artwork.
  // If we default to a dark color, it looks like "black borders". Instead, sample
  // the average color from the source image so the background blends seamlessly.
  if (!resolvedBg || String(resolvedBg).trim().toLowerCase() === "auto") {
    // Sample the "edge" background color instead of the global average.
    // This avoids a visible border when the artwork is brighter in the center.
    const sample = await sharp(input)
      .ensureAlpha()
      .resize(64, 64, { fit: "cover", position: "centre" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const data = sample.data;
    const w = sample.info.width;
    const h = sample.info.height;
    const c = sample.info.channels;

    const get = (x, y) => {
      const i = (y * w + x) * c;
      return { r: data[i], g: data[i + 1], b: data[i + 2], a: c >= 4 ? data[i + 3] : 255 };
    };

    const inset = Math.max(2, Math.round(Math.min(w, h) * 0.12));
    const points = [
      [inset, inset],
      [w - 1 - inset, inset],
      [inset, h - 1 - inset],
      [w - 1 - inset, h - 1 - inset],
      [Math.floor(w / 2), inset],
      [Math.floor(w / 2), h - 1 - inset],
    ];

    let r = 0, g = 0, b = 0, n = 0;
    for (const [x, y] of points) {
      const p = get(x, y);
      // If source has transparency, prefer opaque samples.
      if (p.a < 16) continue;
      r += p.r;
      g += p.g;
      b += p.b;
      n += 1;
    }

    if (n === 0) {
      // Fallback: global average if everything was transparent (unlikely).
      const px = await sharp(input)
        .ensureAlpha()
        .resize(1, 1, { fit: "cover", position: "centre" })
        .removeAlpha()
        .raw()
        .toBuffer();
      resolvedBg = rgbToHex(px[0], px[1], px[2]);
    } else {
      resolvedBg = rgbToHex(r / n, g / n, b / n);
    }
    console.log(`ℹ Using auto background: ${resolvedBg}`);

    // If the sampled background is near-white, it will show up as a visible border
    // once iOS applies a rounded-rect mask to the home-screen icon.
    const rgb = hexToRgb(resolvedBg);
    if (rgb) {
      const lum = relativeLuminance(rgb);
      if (lum >= 0.92) {
        console.log(`⚠ Auto background is very light (${resolvedBg}); using fallback ${fallbackBg}`);
        resolvedBg = fallbackBg;
      }
    }
  }

  // Output set used by your index.html + manifest
  const outputs = [
    { file: "stratax-ai-192.png", build: async () => await makeAnyIcon(192) },
    { file: "stratax-ai-512.png", build: async () => await makeAnyIcon(512) },

    // iOS best-practice
    { file: "apple-touch-icon.png", build: async () => await makeAppleTouchIcon(180) },
  ];

  for (const out of outputs) {
    const p = path.join(iconsDir, out.file);
    const img = await out.build();
    await img.toFile(p);
    console.log(`✓ Wrote ${path.relative(root, p)}`);
  }

  console.log("Done.");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
