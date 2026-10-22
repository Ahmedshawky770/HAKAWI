#!/usr/bin/env node
/**
 * WHY THIS SCRIPT EXISTS.
 *
 * Every file the product shows as "the logo" is derived from ONE piece of artwork —
 * `public/logo-mark.png` — and this script is what derives them:
 *
 *   public/logo-mark-dark.png      the mark in the shell, on the dark canvas
 *   public/logo-mark-light.png     the mark in the shell, on the light canvas
 *   src/app/favicon.ico            the browser tab, at 16, 32 and 48 pixels
 *   public/app-icon.png            the installable app, at 256
 *   public/app-icon-maskable.png   the installable app, at 256, inside the safe zone
 *   public/apple-touch-icon.png    the iOS home screen, at 180
 *
 * Deriving them by hand is how two copies of a logo drift apart: the browser icon and
 * the mark in the header are both "the logo", so if they differ, one of them is wrong
 * and nobody can tell which. So the script is committed with the assets it produces, the
 * assets are its output, and running it again reproduces them byte for byte.
 *
 * Run it after changing the artwork, and commit the result:
 *
 *   npm run brand:assets --workspace=frontend
 *
 * WHY THE MARK IS COLOURED DIFFERENTLY FOR EACH THEME.
 *
 * The artwork is a PRINT: dark violet ink, a deep teal glass, gold leaf, on cream paper.
 * That is how it was drawn, and it is why it reads perfectly on the light canvas
 * (`#faf6ee`) — the paper it was drawn on. It does not read on the dark canvas
 * (`#0d0b0a`): the frame's violet ink sits at 1.15:1 against it, which is the frame
 * disappearing. The mark in the shell is on the dark canvas by default, so the artwork
 * needs a second version, and the second version is not "the artwork inverted" but
 * "the artwork reprinted for a dark ground": the violet frame is lifted into an amethyst
 * that clears the dark canvas, the gold is lifted with it, and the teal glass is left
 * deep, because the gold calligraphy lies on that glass and gold on a light ground has
 * nothing to hold it.
 *
 * The two versions are measured, not eyeballed: `contrastAgainst` below is the same
 * WCAG relative luminance the design system's test recomputes, and the constants are
 * chosen so that every part of the mark clears the canvas it is drawn on.
 *
 * WHY THE ICONS ARE ON AN OPAQUE PLATE.
 *
 * A favicon, an apple-touch icon and an installable app's icon are all drawn by software
 * that does not know what the product's theme is: iOS composites a transparent icon over
 * BLACK, and an Android launcher masks a square icon into a circle and crops whatever
 * reaches the edge. So every icon carries its own paper — the same cream the artwork was
 * drawn on — and the mark is printed on it. A transparent emblem would be a ring of dark
 * violet on black on an iPhone home screen, which is invisible.
 *
 * WHY THE MASKABLE ICON IS A SEPARATE FILE AND A SMALLER MARK.
 *
 * An installable app's icon is masked, and the mask keeps only the middle 80% of the
 * canvas. A mark drawn edge to edge is cropped by that mask — and this artwork draws its
 * quill and its crescent past the rim of the frame on purpose. So the maskable icon
 * carries the mark at 58%, inside the safe zone, and the ordinary icons carry it at 78%.
 *
 * WHAT THIS SCRIPT DOES NOT DO.
 *
 * It does not draw. It recolours, rescales and composes artwork that exists. A simpler
 * mark for the 36-pixel header is a drawing decision, not a scriptable one, and this
 * script is not the place to make it.
 *
 * IT USES NO IMAGE LIBRARY. The PNG codec below is a hundred lines of `node:zlib` and
 * the format is stable; a dependency added for the sake of a script that runs four times
 * a year is a dependency somebody has to audit forever.
 */
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE = join(FRONTEND_ROOT, "public", "logo-mark.png");

/**
 * The mark's size in the shell: 36, 40 and 56 CSS pixels (`components/layout/Brand.tsx`).
 * The asset is generated at three times the largest of them, so it is crisp on a 3x
 * display and never larger than it needs to be.
 */
const MARK_SIZE = 168;

/**
 * The icons' sizes, in the sizes the platforms actually ask for.
 */
const FAVICON_SIZES = [16, 32, 48];
const ICON_SIZE = 256;
const APPLE_ICON_SIZE = 180;

/**
 * The paper the artwork is drawn on, and the one the icons are printed on.
 *
 * It is the product's own light canvas, one step warmer (`globals.css` calls the light
 * canvas `#faf6ee`; the icons use `#f7efe1` so the square reads as a sheet of paper
 * rather than as a hole cut in the page).
 */
const PAPER = "#f7efe1";

/**
 * The canvases the mark is drawn against, and the contrast each part of the mark has to
 * clear on it.
 *
 * The dark canvas is the DEFAULT (`layout.tsx` ships `data-theme="dark"`), which is why
 * the dark variant is the one that exists at all. The light canvas is the reader's
 * choice.
 */
const CANVAS = {
  dark: "#0d0b0a",
  light: "#faf6ee",
};

/**
 * HOW THE VARIANTS ARE SPECIFIED.
 *
 * Each family of the artwork — the violet frame, the teal glass and quill, the gold leaf
 * — is remapped from its own luminance range onto a target range, keeping the ORDER of
 * its shades so that the frame's filigree keeps its light and shadow. The two numbers
 * are the ends of the target range: the first is where the family's darkest shade goes,
 * the second is where its brightest goes.
 *
 * `gamma` bends the curve, because a straight line compresses the shadows that carry the
 * drawing and flattens the filigree.
 */
const VARIANTS = {
  /**
   * THE DARK CANVAS.
   *
   * The violet frame becomes an amethyst: light enough to clear the canvas at 4:1 and
   * still unmistakably the same violet. The gold is lifted with it, so the calligraphy
   * and the filigree keep their places in the drawing. The teal is left deep, because it
   * is the ground the gold lies on: the calligraphy is gold ON the teal glass, and a
   * lighter glass would leave the writing with nothing to sit against.
   */
  dark: {
    violet: { lightness: [0.44, 0.78], saturation: [0.3, 0.52], gamma: 0.8 },
    teal: { lightness: [0.3, 0.46], saturation: [0.28, 0.58], gamma: 0.9 },
    gold: { lightness: [0.55, 0.9], saturation: [0.45, 0.75], gamma: 0.85 },
  },
  /**
   * THE LIGHT CANVAS.
   *
   * The artwork as it was drawn: violet ink and teal glass on cream paper, which is what
   * the artist made. The only change is the gold that reaches the edge of the canvas —
   * the crescent, the stars and the tip of the quill — which is light gold on cream at
   * 1.67:1 and disappears. Those parts are printed in a deeper gold; the gold INSIDE the
   * lens is untouched, because there it lies on teal and reads perfectly.
   */
  light: null,
};

/**
 * The gold the decorations that reach the edge of the canvas are printed in on the light
 * canvas: deep enough to clear the cream at 4:1, and still gold.
 */
const EDGE_GOLD = "#a8701f";

// ---------------------------------------------------------------------------
// The PNG codec
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/**
 * A PNG in the one shape this project needs: 8-bit palette, one byte of alpha per
 * palette entry, no interlacing. That is the shape the artwork is in, and the shape a
 * logo wants — a palette of 256 colours is smaller than the same picture in truecolour
 * and smaller still than it is in RGBA.
 */
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) {
    throw new Error("not a PNG");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const palette = [];
  const alpha = [];
  const data = [];

  let position = 8;
  while (position < buffer.length) {
    const length = buffer.readUInt32BE(position);
    const type = buffer.toString("ascii", position + 4, position + 8);
    const body = buffer.subarray(position + 8, position + 8 + length);
    position += 12 + length;

    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === "PLTE") {
      for (let index = 0; index < body.length; index += 3) {
        palette.push([body[index], body[index + 1], body[index + 2]]);
      }
    } else if (type === "tRNS") {
      for (const value of body) {
        alpha.push(value);
      }
    } else if (type === "IDAT") {
      data.push(body);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8 || colorType !== 3 || interlace !== 0) {
    throw new Error(`unsupported PNG (depth ${bitDepth}, colour type ${colorType}, interlace ${interlace})`);
  }

  const raw = inflateSync(Buffer.concat(data));
  const stride = width;

  if (raw.length < (stride + 1) * height) {
    throw new Error(
      `the PNG's image data is ${raw.length} bytes, which is short of the ${(stride + 1) * height} a ` +
        `${width}x${height} image needs — the file is truncated or damaged`,
    );
  }

  const indices = new Uint8Array(width * height);
  const previous = new Uint8Array(stride);
  const line = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const filtered = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);

    // THE PREDICTORS READ THE ROW AS IT WAS RECONSTRUCTED, NOT AS IT WAS STORED. A row
    // is stored as the differences between its bytes and their neighbours, so the byte
    // to the left of the byte being read is the RECONSTRUCTED one — reading the stored
    // difference instead decodes a filtered picture into noise, silently.
    for (let x = 0; x < stride; x += 1) {
      const left = x > 0 ? line[x - 1] : 0;
      const up = previous[x];
      const upLeft = x > 0 ? previous[x - 1] : 0;
      let value = filtered[x];

      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const distanceLeft = Math.abs(estimate - left);
        const distanceUp = Math.abs(estimate - up);
        const distanceUpLeft = Math.abs(estimate - upLeft);
        if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) value += left;
        else if (distanceUp <= distanceUpLeft) value += up;
        else value += upLeft;
      }

      line[x] = value & 0xff;
    }

    for (let x = 0; x < stride; x += 1) {
      indices[y * width + x] = line[x];
    }

    previous.set(line);
  }

  return { width, height, palette, alpha, indices };
}

/**
 * The five PNG filters, applied to one row of one-byte-per-pixel data.
 *
 * Every filter is the difference between a byte and something nearby: the byte to its
 * left, the byte above it, their average, or the one of the three the encoder predicts.
 * The decoder adds the difference back, so the row comes out exactly as it went in.
 */
function applyFilter(filter, line, previous, out, stride, bytesPerPixel) {
  for (let x = 0; x < stride; x += 1) {
    const left = x >= bytesPerPixel ? line[x - bytesPerPixel] : 0;
    const up = previous[x];
    const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;

    let value;
    if (filter === 1) value = line[x] - left;
    else if (filter === 2) value = line[x] - up;
    else if (filter === 3) value = line[x] - Math.floor((left + up) / 2);
    else if (filter === 4) {
      const estimate = left + up - upLeft;
      const distanceLeft = Math.abs(estimate - left);
      const distanceUp = Math.abs(estimate - up);
      const distanceUpLeft = Math.abs(estimate - upLeft);
      const prediction =
        distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft
          ? left
          : distanceUp <= distanceUpLeft
            ? up
            : upLeft;
      value = line[x] - prediction;
    } else value = line[x];

    out[x] = value & 0xff;
  }
}

function encodePng({ width, height, palette, alpha, indices }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 3;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const paletteData = Buffer.alloc(palette.length * 3);
  palette.forEach(([r, g, b], index) => {
    paletteData[index * 3] = r;
    paletteData[index * 3 + 1] = g;
    paletteData[index * 3 + 2] = b;
  });

  const alphaData = alpha.length > 0 ? Buffer.from(alpha) : undefined;

  const stride = width;
  // The rows are filtered before they are compressed, and the filter is chosen per row:
  // PNG stores the difference between a byte and the byte to its left, or above it, or
  // the average of the two, and for a picture with gradients the difference is much
  // smaller than the byte itself. The heuristic is the one the format defines: try every
  // filter, keep the one whose differences add up to the least.
  const raw = Buffer.alloc((stride + 1) * height);
  const candidate = Buffer.alloc(stride);
  const previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const line = Buffer.from(indices.buffer, indices.byteOffset + y * stride, stride);
    let bestFilter = 0;
    let bestScore = Infinity;
    let bestLine = Buffer.from(line);

    for (let filter = 0; filter <= 4; filter += 1) {
      applyFilter(filter, line, previous, candidate, stride, 1);
      let score = 0;
      for (const byte of candidate) {
        score += byte < 128 ? byte : 256 - byte;
      }
      if (score < bestScore) {
        bestScore = score;
        bestFilter = filter;
        bestLine = Buffer.from(candidate);
      }
    }

    raw[y * (stride + 1)] = bestFilter;
    bestLine.copy(raw, y * (stride + 1) + 1);
    line.copy(previous);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("PLTE", paletteData),
    ...(alphaData ? [chunk("tRNS", alphaData)] : []),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

function parseHex(hex) {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function srgbToLinear(channel) {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}


/** WCAG relative luminance — the same measure `design-system.test.ts` recomputes. */
function luminance([r, g, b]) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrast(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * A PNG in truecolour with an alpha channel.
 *
 * The ICO container carries PNGs, and the decoders that read them want RGBA — a palette PNG
 * inside an ICO is legal to the format and unreadable to the libraries that read it, which
 * is a confusing way to fail. So the favicon's entries are written as RGBA.
 */
function encodeRgbaPng({ width, height, rgba }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  const candidate = Buffer.alloc(stride);
  const previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const line = Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride);
    let bestFilter = 0;
    let bestScore = Infinity;
    let bestLine = Buffer.from(line);

    for (let filter = 0; filter <= 4; filter += 1) {
      applyFilter(filter, line, previous, candidate, stride, 4);
      let score = 0;
      for (const byte of candidate) {
        score += byte < 128 ? byte : 256 - byte;
      }
      if (score < bestScore) {
        bestScore = score;
        bestFilter = filter;
        bestLine = Buffer.from(candidate);
      }
    }

    raw[y * (stride + 1)] = bestFilter;
    bestLine.copy(raw, y * (stride + 1) + 1);
    line.copy(previous);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * HSL, in the space HSL is defined in: the gamma-encoded sRGB values the browser
 * draws, NOT linear light. A colour that is remapped through linear light comes back
 * lighter than it went in, which is how a violet frame turns into a lilac one.
 */
function rgbToHsl([r, g, b]) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return [0, 0, lightness];

  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;
  if (max === red) hue = ((green - blue) / delta + (green < blue ? 6 : 0)) / 6;
  else if (max === green) hue = ((blue - red) / delta + 2) / 6;
  else hue = ((red - green) / delta + 4) / 6;

  return [hue, saturation, lightness];
}

function hslToRgb([hue, saturation, lightness]) {
  if (saturation === 0) {
    const channel = Math.round(lightness * 255);
    return [channel, channel, channel];
  }

  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = hue * 6;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const m = lightness - chroma / 2;

  let rgb;
  if (sector < 1) rgb = [chroma, x, 0];
  else if (sector < 2) rgb = [x, chroma, 0];
  else if (sector < 3) rgb = [0, chroma, x];
  else if (sector < 4) rgb = [0, x, chroma];
  else if (sector < 5) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];

  return rgb.map((channel) => Math.max(0, Math.min(255, Math.round((channel + m) * 255))));
}

/**
 * Which family of the artwork a colour belongs to.
 *
 * The families are the three inks the drawing is made of: the violet of the frame, the
 * teal of the glass and the quill, the gold of the leaf. The hue decides, and the
 * saturation only decides between "an ink" and "a shadow of an ink" — a desaturated
 * violet is still violet, so the hue is taken from the colour's own channels rather than
 * from its saturation.
 */
function familyOf(rgb) {
  const [hue] = rgbToHsl(rgb);
  const degrees = hue * 360;

  if (degrees >= 20 && degrees < 85) return "gold";
  if (degrees >= 240) return "violet";
  if (degrees >= 85) return "teal";
  return "gold";
}

// ---------------------------------------------------------------------------
// The artwork
// ---------------------------------------------------------------------------

const source = decodePng(readFileSync(SOURCE));

/**
 * The alpha of one palette entry, 255 where the entry is opaque.
 */
function alphaOf(index) {
  return source.alpha[index] ?? 255;
}

/**
 * The luminance range of one family, measured on the artwork itself rather than
 * assumed: the remap below stretches each family onto its target range, so the range
 * has to be the family's own.
 */
function familyRange(family) {
  let min = Infinity;
  let max = -Infinity;

  source.palette.forEach((rgb, index) => {
    if (alphaOf(index) < 128) return;
    if (familyOf(rgb) !== family) return;
    const [, , lightness] = rgbToHsl(rgb);
    if (lightness < min) min = lightness;
    if (lightness > max) max = lightness;
  });

  return { min, max: max === min ? min + 1 : max };
}

const RANGES = {
  violet: familyRange("violet"),
  teal: familyRange("teal"),
  gold: familyRange("gold"),
};

/**
 * The recolour of one colour of the artwork.
 *
 * `variant` says which ground the mark will sit on. On the dark ground the inks are
 * lifted onto the target ranges; on the light ground the artwork keeps its own colours,
 * because that is how it was drawn, and only the gold that reaches the edge of the canvas
 * is printed deeper (see `touchesTheEdge`).
 */
function recolour(rgb, variant) {
  if (variant === "light") return rgb;

  const family = familyOf(rgb);
  const settings = VARIANTS[variant][family];
  const range = RANGES[family];

  const [hue, , lightness] = rgbToHsl(rgb);
  const position = Math.max(0, Math.min(1, (lightness - range.min) / (range.max - range.min)));
  const bent = position ** settings.gamma;

  const targetLightness = settings.lightness[0] + bent * (settings.lightness[1] - settings.lightness[0]);
  const targetSaturation = settings.saturation[0] + bent * (settings.saturation[1] - settings.saturation[0]);

  return hslToRgb([hue, targetSaturation, targetLightness]);
}

/**
 * Whether a piece of gold stands on the paper rather than on the frame.
 *
 * The crescent, the stars and the tip of the quill are the parts of the drawing that
 * stand on the paper, and they are the parts the light canvas loses: light gold on
 * cream is 1.67:1. They are found by looking for gold with NOTHING BEHIND IT — a
 * transparent neighbour — which is what "standing on the paper" means in the picture,
 * whether or not the pixel happens to be near the edge of the canvas.
 */
function touchesTheEdge(index, x, y) {
  const neighbours = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];

  for (const [nx, ny] of neighbours) {
    if (nx < 0 || ny < 0 || nx >= source.width || ny >= source.height) return true;
    const neighbour = source.indices[ny * source.width + nx];
    if (alphaOf(neighbour) < 128) return true;
  }

  return false;
}

/**
 * The recoloured artwork, as a palette of colours and an index map.
 *
 * The palette is rebuilt from the colours that are actually used, so the output holds
 * only what the drawing needs and never more than a PNG palette can carry.
 */
function buildVariant(variant) {
  const used = new Map();
  const transparentColours = new Map();
  const indices = new Uint8Array(source.width * source.height);

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const index = source.indices[y * source.width + x];
      const alpha = alphaOf(index);
      const rgb = source.palette[index];

      let colour = recolour(rgb, variant);

      if (variant === "light" && familyOf(rgb) === "gold" && alpha >= 128 && touchesTheEdge(index, x, y)) {
        colour = parseHex(EDGE_GOLD);
      }

      if (alpha < 128) {
        // A transparent pixel keeps the COLOUR the artwork gave it along with its alpha.
        // The colour is invisible on its own — but it is averaged into the edges around
        // it, and a transparent entry painted black drags every edge it touches darker.
        // One entry per level of transparency, carrying the colour that level is most
        // often painted, because a PNG palette has 256 slots and the artwork needs the
        // rest of them for the drawing.
        const key = `transparent:${alpha}`;
        let slot = used.get(key);
        if (slot === undefined) {
          slot = used.size;
          used.set(key, slot);
        }
        indices[y * source.width + x] = slot;

        const seen = transparentColours.get(alpha);
        if (seen === undefined || seen.count === 0) {
          transparentColours.set(alpha, { rgb, count: 1 });
        } else if (seen.rgb.join(",") === rgb.join(",")) {
          seen.count += 1;
        }
        continue;
      }

      const key = colour.join(",");
      let slot = used.get(key);
      if (slot === undefined) {
        slot = used.size;
        used.set(key, slot);
      }
      indices[y * source.width + x] = slot;
    }
  }

  const palette = [];
  const alpha = [];
  for (const key of used.keys()) {
    if (key.startsWith("transparent:")) {
      const transparency = Number(key.split(":")[1]);
      const seen = transparentColours.get(transparency);
      palette.push((seen?.rgb ?? [0, 0, 0]).map(Number));
      alpha.push(transparency);
    } else {
      palette.push(key.split(",").map(Number));
      alpha.push(255);
    }
  }

  if (palette.length > 256) {
    throw new Error(`the artwork needs ${palette.length} palette entries, more than a PNG palette holds`);
  }

  return { width: source.width, height: source.height, palette, alpha, indices };
}

// ---------------------------------------------------------------------------
// Rescaling
// ---------------------------------------------------------------------------

/**
 * A box-filter rescale of a palette image.
 *
 * The average is taken in premultiplied space, so a transparent pixel does not drag its
 * (meaningless) colour into the edge it shares with the drawing, and the result is
 * matched back to the palette by the nearest entry in the same space — which is how the
 * antialiased edges keep their partial alpha.
 */
function rescale(image, targetWidth, targetHeight) {
  const rgba = new Uint8Array(image.width * image.height * 4);

  for (let index = 0; index < image.width * image.height; index += 1) {
    const [r, g, b] = image.palette[image.indices[index]];
    const a = image.alpha[image.indices[index]] ?? 255;
    rgba[index * 4] = r;
    rgba[index * 4 + 1] = g;
    rgba[index * 4 + 2] = b;
    rgba[index * 4 + 3] = a;
  }

  const out = new Uint8Array(targetWidth * targetHeight * 4);
  const scaleX = image.width / targetWidth;
  const scaleY = image.height / targetHeight;

  for (let y = 0; y < targetHeight; y += 1) {
    const fromY = Math.floor(y * scaleY);
    const toY = Math.max(fromY + 1, Math.floor((y + 1) * scaleY));

    for (let x = 0; x < targetWidth; x += 1) {
      const fromX = Math.floor(x * scaleX);
      const toX = Math.max(fromX + 1, Math.floor((x + 1) * scaleX));

      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let count = 0;

      for (let sy = fromY; sy < toY; sy += 1) {
        for (let sx = fromX; sx < toX; sx += 1) {
          const offset = (sy * image.width + sx) * 4;
          const a = rgba[offset + 3];
          red += rgba[offset] * a;
          green += rgba[offset + 1] * a;
          blue += rgba[offset + 2] * a;
          alpha += a;
          count += 1;
        }
      }

      const offset = (y * targetWidth + x) * 4;
      if (alpha === 0) {
        out[offset + 3] = 0;
        continue;
      }

      out[offset] = Math.round(red / alpha);
      out[offset + 1] = Math.round(green / alpha);
      out[offset + 2] = Math.round(blue / alpha);
      out[offset + 3] = Math.round(alpha / count);
    }
  }

  return { rgba: out, width: targetWidth, height: targetHeight };
}

/**
 * The artwork on the paper: the mark scaled to `scale` of the canvas and centred on it.
 *
 * The artwork is scaled rather than placed at full size because it draws its quill and
 * its crescent right out to the edge of its canvas, and a launcher that masks the icon
 * crops exactly there. The margin is what the mask keeps.
 */
function compose(image, size, scale, paper) {
  const markSize = Math.round(size * scale);
  const scaled = rescale(image, markSize, markSize);
  const offset = Math.round((size - markSize) / 2);
  const rgba = new Uint8Array(size * size * 4);
  const [pr, pg, pb] = paper;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offsetIndex = (y * size + x) * 4;
      const sx = x - offset;
      const sy = y - offset;

      if (sx < 0 || sy < 0 || sx >= markSize || sy >= markSize) {
        rgba[offsetIndex] = pr;
        rgba[offsetIndex + 1] = pg;
        rgba[offsetIndex + 2] = pb;
        rgba[offsetIndex + 3] = 255;
        continue;
      }

      const sourceOffset = (sy * markSize + sx) * 4;
      const alpha = scaled.rgba[sourceOffset + 3] / 255;

      rgba[offsetIndex] = Math.round(scaled.rgba[sourceOffset] * alpha + pr * (1 - alpha));
      rgba[offsetIndex + 1] = Math.round(scaled.rgba[sourceOffset + 1] * alpha + pg * (1 - alpha));
      rgba[offsetIndex + 2] = Math.round(scaled.rgba[sourceOffset + 2] * alpha + pb * (1 - alpha));
      rgba[offsetIndex + 3] = 255;
    }
  }

  return { rgba, width: size, height: size };
}

/**
 * A PNG of a picture, as a palette of the colours it uses.
 *
 * A palette PNG of a logo is a fraction of the size of the same picture in truecolour,
 * and the rescaled artwork carries far more colours than a palette can hold (every edge
 * is a blend), so the picture is quantised first: median cut, which keeps the colours
 * the eye can see and drops the ones it cannot.
 */
function palettePng(rgba, width, height, maxColors) {
  const { palette, alpha, boxOf } = quantize(rgba, width, height, maxColors);
  const indices = new Uint8Array(width * height);

  for (let index = 0; index < width * height; index += 1) {
    const key =
      (rgba[index * 4] << 24) |
      (rgba[index * 4 + 1] << 16) |
      (rgba[index * 4 + 2] << 8) |
      rgba[index * 4 + 3];
    indices[index] = boxOf.get(key);
  }

  const transparent = alpha.some((value) => value < 255);
  return encodePng({ width, height, palette, alpha: transparent ? alpha : [], indices });
}

/**
 * Median cut: the colours an image actually uses, reduced to at most `maxColors`.
 *
 * The colours are collected with their pixel counts, and the list is cut in half
 * repeatedly — always along the channel that varies most, and always at the place where
 * the PIXELS are closest to half, so a colour that covers a large part of the picture is
 * not split in two for the sake of a few pixels. Alpha is a channel like any other: the
 * edges of a drawing are carried by partial transparency, and a quantiser that ignored
 * it would turn them into a stair of hard steps.
 */
function quantize(rgba, width, height, maxColors) {
  const histogram = new Map();

  for (let index = 0; index < width * height; index += 1) {
    const key =
      (rgba[index * 4] << 24) |
      (rgba[index * 4 + 1] << 16) |
      (rgba[index * 4 + 2] << 8) |
      rgba[index * 4 + 3];
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
  }

  const entries = [...histogram.entries()].map(([key, count]) => ({
    key,
    channels: [(key >>> 24) & 0xff, (key >>> 16) & 0xff, (key >>> 8) & 0xff, key & 0xff],
    count,
  }));

  const bounds = (list) => {
    const min = [255, 255, 255, 255];
    const max = [0, 0, 0, 0];
    for (const entry of list) {
      for (let channel = 0; channel < 4; channel += 1) {
        if (entry.channels[channel] < min[channel]) min[channel] = entry.channels[channel];
        if (entry.channels[channel] > max[channel]) max[channel] = entry.channels[channel];
      }
    }
    return { min, max };
  };

  const boxes = [{ entries, ...bounds(entries) }];

  while (boxes.length < maxColors) {
    let target = null;
    let targetScore = 0;

    for (const candidate of boxes) {
      if (candidate.entries.length < 2) continue;
      const range = Math.max(
        candidate.max[0] - candidate.min[0],
        candidate.max[1] - candidate.min[1],
        candidate.max[2] - candidate.min[2],
        candidate.max[3] - candidate.min[3],
      );
      const count = candidate.entries.reduce((total, entry) => total + entry.count, 0);
      const score = range * count;
      if (score > targetScore) {
        targetScore = score;
        target = candidate;
      }
    }

    if (target === null) break;

    let channel = 0;
    let widest = -1;
    for (let index = 0; index < 4; index += 1) {
      const range = target.max[index] - target.min[index];
      if (range > widest) {
        widest = range;
        channel = index;
      }
    }

    const sorted = [...target.entries].sort(
      (left, right) => left.channels[channel] - right.channels[channel],
    );

    // The cut is the place where the PIXELS are closest to half, and it is never at
    // either end: a cut at the end would leave one side empty and the box would never
    // get smaller, which is how a quantiser ends up averaging a whole picture into one
    // colour.
    const total = sorted.reduce((sum, entry) => sum + entry.count, 0);
    let running = 0;
    let cut = 1;
    let closest = Infinity;

    for (let index = 0; index < sorted.length - 1; index += 1) {
      running += sorted[index].count;
      const distance = Math.abs(running * 2 - total);
      if (distance < closest) {
        closest = distance;
        cut = index + 1;
      }
    }

    const first = sorted.slice(0, cut);
    const second = sorted.slice(cut);
    boxes.splice(
      boxes.indexOf(target),
      1,
      { entries: first, ...bounds(first) },
      { entries: second, ...bounds(second) },
    );
  }

  const palette = [];
  const alpha = [];

  boxes.forEach((part) => {
    // THE COLOUR THAT COVERS THE MOST PIXELS, not the average of the colours in the
    // box. The average of a gold and a violet is a mauve that is in the picture
    // nowhere; the colour that covers the most of the box is at least a colour the
    // artist used.
    const representative = part.entries.reduce((best, entry) =>
      entry.count > best.count ? entry : best,
    );

    palette.push(representative.channels.slice(0, 3).map(Math.round));
    alpha.push(representative.channels[3]);
  });

  const boxOf = new Map();

  boxes.forEach((part, index) => {
    for (const entry of part.entries) {
      boxOf.set(entry.key, index);
    }
  });

  return { palette, alpha, boxOf };
}

// ---------------------------------------------------------------------------
// The ICO container
// ---------------------------------------------------------------------------

/**
 * An ICO holding the given images.
 *
 * The entries are PNGs, which every browser and every icon reader since Windows Vista
 * understands inside an ICO and which are a fraction of the size of the same picture as
 * a bitmap: a favicon is fetched by every page a reader opens, so its weight is the one
 * weight that is paid over and over.
 */
function buildIco(images) {
  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);

  const payloads = [];
  let offset = directory.length;

  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    directory[entry] = image.width >= 256 ? 0 : image.width;
    directory[entry + 1] = image.height >= 256 ? 0 : image.height;
    directory[entry + 2] = 0;
    directory[entry + 3] = 0;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.bytes.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.bytes.length;
    payloads.push(image.bytes);
  });

  return Buffer.concat([directory, ...payloads]);
}

// ---------------------------------------------------------------------------
// The output
// ---------------------------------------------------------------------------

/**
 * THE VARIANTS, AND WHY EACH ONE EXISTS.
 */
const outputs = {
  "public/logo-mark-dark.png": {
    variant: "dark",
    size: MARK_SIZE,
    paper: null,
    colours: 96,
  },
  "public/logo-mark-light.png": {
    variant: "light",
    size: MARK_SIZE,
    paper: null,
    colours: 96,
  },
  "public/app-icon.png": {
    variant: "light",
    size: ICON_SIZE,
    paper: 0.78,
    colours: 96,
  },
  "public/apple-touch-icon.png": {
    variant: "light",
    size: APPLE_ICON_SIZE,
    paper: 0.78,
    colours: 96,
  },
  "public/app-icon-maskable.png": {
    variant: "light",
    size: ICON_SIZE,
    paper: 0.58,
    colours: 96,
  },
};

function main() {
  const built = {};

  for (const [path, settings] of Object.entries(outputs)) {
    const image = buildVariant(settings.variant);
    built[settings.variant] = image;

    if (settings.paper === null) {
      const scaled = rescale(image, settings.size, settings.size);
      writeFileSync(
        join(FRONTEND_ROOT, path),
        palettePng(scaled.rgba, scaled.width, scaled.height, settings.colours),
      );
      continue;
    }

    const composed = compose(image, settings.size, settings.paper, parseHex(PAPER));
    writeFileSync(
      join(FRONTEND_ROOT, path),
      palettePng(composed.rgba, composed.width, composed.height, settings.colours),
    );
  }

  // The favicon is the one icon that has to be a file of its own: the browser asks for
  // `/favicon.ico` by name, and Next's file convention serves it from `src/app`.
  const icon = built.light;
  const entries = FAVICON_SIZES.map((size) => {
    const composed = compose(icon, size, 0.86, parseHex(PAPER));
    return {
      width: size,
      height: size,
      bytes: encodeRgbaPng({ width: composed.width, height: composed.height, rgba: composed.rgba }),
    };
  });
  writeFileSync(join(FRONTEND_ROOT, "src/app/favicon.ico"), buildIco(entries));

  // THE REPORT MEASURES THE FILES THAT SHIP. The image in memory is not the image on
  // disk: it has been rescaled and quantised since, and a number that describes the
  // first and not the second describes nothing a reader can check.
  report({
    dark: decodePng(readFileSync(join(FRONTEND_ROOT, "public", "logo-mark-dark.png"))),
    light: decodePng(readFileSync(join(FRONTEND_ROOT, "public", "logo-mark-light.png"))),
  });
}

/**
 * WHAT WAS PRODUCED, AND WHAT IT MEASURES.
 *
 * The numbers are printed because a mark whose contrast nobody measured is a mark somebody
 * will have to look at, and looking at it is how the dark canvas lost the violet frame in the
 * first place.
 *
 * THE NUMBER THAT MATTERS IS THE FRAME'S. The frame is the drawing's outline — the shape the
 * eye reads first and the shape that has to separate from the canvas. The glass inside it is
 * enclosed by the frame and the gold on the glass is enclosed by the glass, so their contrast
 * against the CANVAS is not what decides whether the mark reads; their contrast against each
 * other is. Each line therefore prints the shade that covers the most pixels of its family —
 * the one the eye actually sees — and the range the family spans.
 */
function report(built) {
  console.log("The mark, measured against the canvas it is drawn on:\n");

  for (const [variant, canvas] of Object.entries(CANVAS)) {
    const image = built[variant];
    const canvasColour = parseHex(canvas);

    console.log(`  ${variant} canvas (${canvas}):`);

    for (const family of ["violet", "teal", "gold"]) {
      const shades = new Map();

      for (let index = 0; index < image.indices.length; index += 1) {
        if ((image.alpha[image.indices[index]] ?? 255) < 128) continue;
        const rgb = image.palette[image.indices[index]];
        if (familyOf(rgb) !== family) continue;
        const key = rgb.join(",");
        shades.set(key, (shades.get(key) ?? 0) + 1);
      }

      if (shades.size === 0) continue;

      let dominant = null;
      let dominantCount = 0;
      for (const [key, count] of shades) {
        if (count > dominantCount) {
          dominantCount = count;
          dominant = key.split(",").map(Number);
        }
      }

      let lowest = Infinity;
      let highest = 0;
      for (const key of shades.keys()) {
        const ratio = contrast(key.split(",").map(Number), canvasColour);
        lowest = Math.min(lowest, ratio);
        highest = Math.max(highest, ratio);
      }

      const hex = `#${dominant.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;

      console.log(
        `    ${family.padEnd(7)} ${hex} at ${contrast(dominant, canvasColour).toFixed(1)}:1 ` +
          `(the family spans ${lowest.toFixed(1)}:1 … ${highest.toFixed(1)}:1)`,
      );
    }
  }
}

main();
