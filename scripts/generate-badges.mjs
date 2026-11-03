#!/usr/bin/env node
/**
 * Generate professional SVG badge images for the Hakawi badges page.
 * One file per badge key per locale (ar/en), matching the site design system.
 *
 * Output: frontend/public/images/badges/<key>-<locale>.svg
 *
 * Design tokens (from frontend/src/app/globals.css):
 *   canvas   #140a1f  deep eggplant velvet
 *   surface  #1f122b  elevated velvet purple
 *   accent   #d4af37  warm matte gold
 *   chrome   #1a5e63  deep teal
 *   ink      #f5f5f0  soft cream white
 *   ink-muted #c9b8d6 muted lilac
 */

import fs from "fs";
import path from "path";

const OUT_DIR = path.join(process.cwd(), "frontend", "public", "images", "badges");
fs.mkdirSync(OUT_DIR, { recursive: true });

// Design tokens
const T = {
  canvas: "#140a1f",
  surface: "#1f122b",
  surfaceRaised: "#2b1a40",
  line: "#3a2e4e",
  accent: "#d4af37",
  accentFill: "#1a5e63",
  ink: "#f5f5f0",
  inkMuted: "#c9b8d6",
  inkFaint: "#9a8aa8",
};

// Icon geometry drawn on a 0-1000 grid (scaled up from the 24px icon set).
// Each icon is a single <path> meant to be centered in the medallion.
const ICONS = {
  "contest-champion": {
    // Trophy (adapted from existing trophy path, scaled to 1000 grid)
    d:
      "M300 170h400v150a180 180 0 0 1-360 0ZM300 220h-60a20 20 0 0 0-20 22c-5 140-100 200-160 200M650 240h60a20 20 0 0 1 20 22c-15 130-100 160-130 160M400 540h200v130a60 60 0 0 1-60 60h-40a60 60 0 0 1-60-60Z",
    fill: T.accent,
  },
  "contest-legend": {
    // Crown
    d:
      "M200 700v-50l60-100a40 40 0 0 1 80 0l60 100v50h60v-100a40 40 0 0 1 80 0l60 100v100h-560ZM340 700c-22 0-40-18-40-40v-260c0-22 18-40 40-40s40 18 40 40v260c0 22-18 40-40 40ZM500 700c-22 0-40-18-40-40v-260c0-22 18-40 40-40s40 18 40 40v260c0 22-18 40-40 40ZM660 700c-22 0-40-18-40-40v-260c0-22 18-40 40-40s40 18 40 40v260c0 22-18 40-40 40Z",
    fill: T.accent,
  },
  "first-publication": {
    // Feather / quill
    d:
      "M500 900q-60 0-100-60l-40-100c-20-50-30-100-30-150s10-100 30-140l40-100c20-50 70-70 100-20l100 100c30 50 20 100-30 140s-10 100-30 150l-40 100q-40 60-100 60ZM500 100q-40 0-60-40l-30-80c-20-50-10-100 20-120l50-50c20-20 50-30 80-20s50 10 60 40l40 80c10 30 0 60-20 80s-40 40-70 40ZM500 900q40 0 60-40l30-80c20-50 10-100-20-120l-50-50c-20-20-50-30-80-20s-50 10-60 40l-40 80c-10 30 0 60 20 80s40 40 70 40Z",
    fill: T.accentFill,
  },
  "prolific-author": {
    // Books (stacked books)
    d:
      "M200 300h600v500H200ZM240 340h520v30H240ZM240 390h520v30H240ZM240 440h520v30H240ZM300 520h400v30H300Z",
    fill: T.accentFill,
  },
  "rising-author": {
    // Users (people icon)
    d:
      "M500 300c-80 0-150 65-150 150s70 150 150 150 150-65 150-150-70-150-150-150ZM500 450c-30 0-55-25-55-55s25-55 55-55 55 25 55 55-25 55-55 55ZM200 900c-60 0-110-45-110-100v-100c0-55 45-100 100-100s100 45 100 100v100c0 55-50 100-110 100ZM800 900c-60 0-110-45-110-100v-100c0-55 45-100 100-100s100 45 100 100v100c0 55-50 100-110 100Z",
    fill: T.accentFill,
  },
  "community-pillar": {
    // Star
    d:
      "M500 200l60 180a20 20 0 0 0 35 25l150 110a20 20 0 0 0 30-50l-110-150a20 20 0 0 0-35 0l-110 150a20 20 0 0 0 30 50l150-110a20 20 0 0 0 35-25l60-180Z",
    fill: T.accent,
  },
  guardian: {
    // Shield
    d:
      "M500 100c-90 0-160 70-160 150 0 90 120 220 160 260 40-40 160-170 160-260 0-80-70-150-160-150ZM500 320l0 160l0-160Z",
    fill: T.accentFill,
  },
  "steward": {
    // Shield with check
    d:
      "M500 100c-90 0-160 70-160 150 0 90 120 220 160 260 40-40 160-170 160-260 0-80-70-150-160-150ZM430 430l60 80l120-160Z",
    fill: T.accentFill,
  },
};

// Badge catalog: key -> { name ar/en, description ar/en, iconKey, threshold, tierColor }
const CATALOG = {
  "contest-champion": {
    ar: { name: "بطل المسابقة", desc: "فاز في مسابقة كتابة" },
    en: { name: "Contest Champion", desc: "Won a writing contest" },
    icon: "contest-champion",
    threshold: 1,
  },
  "contest-legend": {
    ar: { name: "أسطورة المسابقات", desc: "فاز في ثلاث مسابقات كتابة" },
    en: { name: "Contest Legend", desc: "Won three writing contests" },
    icon: "contest-legend",
    threshold: 3,
  },
  "first-publication": {
    ar: { name: "أول منشور", desc: "نشر قصته الأولى" },
    en: { name: "First Publication", desc: "Published a first story" },
    icon: "first-publication",
    threshold: 1,
  },
  "prolific-author": {
    ar: { name: "كاتب غزير", desc: "نشر خمس قصص" },
    en: { name: "Prolific Author", desc: "Published five stories" },
    icon: "prolific-author",
    threshold: 5,
  },
  "rising-author": {
    ar: { name: "كاتب صاعد", desc: "حصل على عشرة متابعين" },
    en: { name: "Rising Author", desc: "Gained ten followers" },
    icon: "rising-author",
    threshold: 10,
  },
  "community-pillar": {
    ar: { name: "ركيزة المجتمع", desc: "حصل على مئة متابع" },
    en: { name: "Community Pillar", desc: "Gained one hundred followers" },
    icon: "community-pillar",
    threshold: 100,
  },
  guardian: {
    ar: { name: "حارس", desc: "اتخذ إجراء إشرافياً أول" },
    en: { name: "Guardian", desc: "Took a first moderation action" },
    icon: "guardian",
    threshold: 1,
  },
  steward: {
    ar: { name: "أمين", desc: "اتخذ عشرة إجراءات إشرافية" },
    en: { name: "Steward", desc: "Took ten moderation actions" },
    icon: "steward",
    threshold: 10,
  },
};

// Tier color by threshold (rarity)
function tierColor(threshold) {
  if (threshold >= 100) return T.accent; // gold - legendary
  if (threshold >= 10) return "#7aa8ff"; // info blue - epic
  if (threshold >= 5) return T.accentFill; // teal - rare
  return "#9a8aa8"; // faint - common
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildSVG({ key, locale, catalog }) {
  const c = catalog[key];
  const icon = ICONS[c.icon];
  const color = tierColor(c.threshold);
  const isAr = locale === "ar";
  const name = c[locale].name;
  const desc = c[locale].desc;

  // Font stack matching the site
  const arFont =
    "Amiri, Cairo, 'Noto Naskh Arabic', 'Segoe UI Arabic', serif";
  const latinFont = "Inter, system-ui, -apple-system, sans-serif";
  const titleFont = isAr ? arFont : latinFont;
  const bodyFont = isAr ? arFont : latinFont;

  // Determine text direction attributes
  const dir = isAr ? "rtl" : "ltr";

  // Title text fit: scale down long titles
  const titleFontSize = name.length > 20 ? 56 : 64;
  const descFontSize = 34;

  // Center title horizontally; for RTL keep alignment start but anchor middle still centers visually
  const titleX = 500;
  const titleY = 700;
  const descY = 790;
  const tierY = 850;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000" dir="${dir}" role="img" aria-label="${esc(name)} — ${esc(desc)}">
  <defs>
    <radialGradient id="medallionGrad" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="${T.surfaceRaised}" />
      <stop offset="100%" stop-color="${T.surface}" />
    </radialGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${color}" />
      <stop offset="100%" stop-color="${T.accent}" />
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="20" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background canvas -->
  <rect width="1000" height="1000" fill="${T.canvas}" />

  <!-- Outer medallion ring (gold) -->
  <circle cx="500" cy="500" r="430" fill="none" stroke="${T.accent}" stroke-width="14" />
  <circle cx="500" cy="500" r="400" fill="url(#medallionGrad)" stroke="${T.line}" stroke-width="4" />

  <!-- Inner accent ring -->
  <circle cx="500" cy="500" r="340" fill="none" stroke="${color}" stroke-width="6" opacity="0.35" />

  <!-- Icon centered -->
  <g transform="translate(500,500)">
    <path d="${icon.d}" fill="${icon.fill}" transform="scale(0.42) translate(-1250,-1250)" />
  </g>

  <!-- Badge name (title) -->
  <text
    x="${titleX}"
    y="${titleY}"
    text-anchor="middle"
    dominant-baseline="middle"
    fill="${T.ink}"
    font-family="${titleFont}"
    font-size="${titleFontSize}"
    font-weight="700"
    letter-spacing="0.02em"
  >
    ${esc(name)}
  </text>

  <!-- Description -->
  <text
    x="${titleX}"
    y="${descY}"
    text-anchor="middle"
    dominant-baseline="middle"
    fill="${T.inkMuted}"
    font-family="${bodyFont}"
    font-size="${descFontSize}"
    font-weight="400"
  >
    ${esc(desc)}
  </text>

  <!-- Tier / threshold chip -->
  <rect
    x="320"
    y="${tierY - 34}"
    width="360"
    height="68"
    rx="34"
    fill="${T.surfaceRaised}"
    stroke="${color}"
    stroke-width="3"
  />
  <text
    x="500"
    y="${tierY}"
    text-anchor="middle"
    dominant-baseline="middle"
    fill="${color}"
    font-family="${bodyFont}"
    font-size="30"
    font-weight="700"
  >
    ${isAr ? "الدرجة" : "Tier"} · ${c.threshold}
  </text>

  <!-- Hakawi signature mark (small) -->
  <text
    x="940"
    y="965"
    text-anchor="end"
    dominant-baseline="alphabetic"
    fill="${T.inkFaint}"
    font-family="${latinFont}"
    font-size="22"
    font-weight="600"
    letter-spacing="0.05em"
  >
    HAKAWI
  </text>
</svg>
`;

  return svg;
}

const locales = ["ar", "en"];
let count = 0;

for (const key of Object.keys(CATALOG)) {
  for (const locale of locales) {
    const svg = buildSVG({ key, locale, catalog: CATALOG });
    const fileName = `${key}-${locale}.svg`;
    const filePath = path.join(OUT_DIR, fileName);
    fs.writeFileSync(filePath, svg, "utf8");
    count++;
    console.log(`✓ ${filePath}`);
  }
}

console.log(`\nGenerated ${count} badge SVG images in ${OUT_DIR}`);
