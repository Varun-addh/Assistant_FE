import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "byok");
const outFile = path.join(outDir, "byok-demo.mp4");

fs.mkdirSync(outDir, { recursive: true });

const ffmpegPath = ffmpegInstaller?.path;
if (!ffmpegPath) {
  console.error("Could not resolve ffmpeg binary from @ffmpeg-installer/ffmpeg");
  process.exit(1);
}

const winFont = "C:/Windows/Fonts/segoeui.ttf";
const fontfile = fs.existsSync(winFont) ? winFont : "";

function dt({ text, y, color = "white", size = 42, enable, boxColor = "black@0.55" }) {
  // Escape characters that ffmpeg drawtext treats specially.
  const safeText = String(text)
    .replaceAll("\\", "\\\\")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'");

  const parts = [];
  if (fontfile) parts.push(`fontfile=${fontfile}`);
  parts.push(
    `text='${safeText}'`,
    `x=(w-text_w)/2`,
    `y=${y}`,
    `fontsize=${size}`,
    `fontcolor=${color}`,
    `box=1`,
    `boxcolor=${boxColor}`,
    `boxborderw=18`,
    `enable='${enable}'`,
  );
  return `drawtext=${parts.join(":")}`;
}

// 21s, 30fps, 1280x720. Three scenes via timed overlays.
const vf = [
  // Title
  dt({ text: "Connect your AI Keys", y: 90, size: 64, enable: "between(t,0,7)" }),
  dt({ text: "Step 1: Open Groq Console", y: 220, size: 40, enable: "between(t,0,7)", color: "#fb923c" }),
  dt({ text: "console.groq.com/keys", y: 290, size: 36, enable: "between(t,0,7)", color: "#fb923c" }),
  dt({ text: "Create a key and copy it (looks like gsk_…)", y: 360, size: 32, enable: "between(t,0,7)" }),

  // Groq focus
  dt({ text: "Interview Engine = Groq", y: 90, size: 60, enable: "between(t,7,14)", color: "#fb923c" }),
  dt({ text: "Paste Groq key into Interview Engine field", y: 240, size: 36, enable: "between(t,7,14)" }),
  dt({ text: "This unlocks: Questions • Mock • Search", y: 310, size: 32, enable: "between(t,7,14)" }),

  // Gemini focus
  dt({ text: "Answer Engine = Gemini", y: 90, size: 60, enable: "between(t,14,21)", color: "#60a5fa" }),
  dt({ text: "Open Google AI Studio", y: 240, size: 36, enable: "between(t,14,21)" }),
  dt({ text: "aistudio.google.com/app/apikey", y: 305, size: 32, enable: "between(t,14,21)", color: "#60a5fa" }),
  dt({ text: "Create key, then paste it (often looks like AIza…)", y: 370, size: 30, enable: "between(t,14,21)" }),

  // Footer note across whole video
  dt({
    text: "Note: Creating keys is usually free on provider free tiers, but rate limits/quotas can apply.",
    y: 640,
    size: 22,
    enable: "between(t,0,21)",
    color: "#cbd5e1",
    boxColor: "#0b1220@0.65",
  }),
].join(",");

const args = [
  "-y",
  "-f",
  "lavfi",
  "-i",
  "color=c=#0b0b10:s=1280x720:r=30:d=21",
  "-vf",
  vf,
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  outFile,
];

console.log("Generating:", outFile);
execFileSync(ffmpegPath, args, { stdio: "inherit" });
console.log("Done.");
