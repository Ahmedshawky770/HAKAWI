/**
 * The Arabic face the link previews are drawn with.
 *
 * WHY A FONT HAS TO BE FETCHED. `next/og` draws an image with Satori, and
 * Satori needs an actual font file: the one it falls back to covers Latin only,
 * so an Arabic title in a preview renders as a row of empty boxes. The preview
 * of a story is the one place the product's own language appears OUTSIDE the
 * app, on a platform that has never heard of Hakawi, and a preview full of
 * tofu boxes is worse than no preview.
 *
 * WHY IT IS FETCHED RATHER THAN COMMITTED. The repository already depends on
 * Google Fonts at build time — `next/font/google` downloads Amiri, Cairo, IBM
 * Plex Sans Arabic and Inter on every build — so the host is already a
 * dependency. Committing a second copy of a font the project already downloads
 * would be a binary blob in the tree for no gain.
 *
 * WHY CAIRO. Cairo is one of the product's four faces (§2 of the design
 * system) and it is one of the two that Satori can actually read: Satori's
 * subsetter rejects the `GSUB` tables of Amiri, Noto Naskh and Reem Kufi with
 * "lookupType: 5 - substFormat: 3 is not yet supported", and a preview that
 * throws is a preview that does not appear. Cairo and IBM Plex Sans Arabic
 * both render; Cairo is the heading face, which is what a title wants.
 *
 * WHY TTF AND NOT WOFF2. Satori's font parser cannot read WOFF2, and the
 * Google Fonts API serves WOFF2 to any browser that asks like a modern one.
 * The API serves the ORIGINAL TTF to a browser that asks like an old Android
 * phone — and EOT to a browser that asks like Internet Explorer 6, which
 * Satori cannot read either. The user agent below is the one that gets the
 * TTF, and the response is checked for the TrueType signature before it is
 * handed to the renderer, so a change in the API's behaviour degrades the
 * preview instead of breaking it.
 *
 * THE FONT IS CACHED PER PROCESS, AND A FAILURE IS CACHED FOR A MINUTE. A
 * preview is requested once per shared link, so the fetch happens once per
 * server instance and not once per image. A SUCCESS is remembered for the
 * life of the process. A FAILURE is remembered for a minute only: a font host
 * that is down for a moment must not poison the process forever, and a font
 * host that is down for good must not be asked again on every request.
 */
const GOOGLE_FONTS_CSS = "https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap";

/**
 * A user agent old enough to be served the original font files.
 *
 * This is not a spoof for its own sake: the API branches on it, and the
 * branch we want is the one that returns TTF.
 */
const LEGACY_USER_AGENT =
  "Mozilla/5.0 (Linux; U; Android 4.0.3; en-us; Galaxy Nexus Build/IML74K) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30";

/** The first four bytes of a TrueType file: the sfnt version `0x00010000`. */
const TRUETYPE_SIGNATURE = [0x00, 0x01, 0x00, 0x00];

/**
 * How long a font host is given to answer.
 *
 * A link preview is a picture of a story in somebody's chat. It is worth a
 * short wait and not worth an open request: past this the preview falls back
 * to the Latin face `next/og` bundles, which is a worse picture but a picture.
 */
const FONT_TIMEOUT_MS = 5000;

/**
 * How long a FAILURE is remembered before the font host is asked again.
 *
 * A success is cached for the life of the process. A failure cannot be: a font
 * host that is down for a minute must not decide the fonts of every preview
 * this process will ever draw. But a host that is down for good must not be
 * asked on every single request either, so the failure is remembered — for a
 * minute, which is long enough to ride out a blip and short enough that a
 * host that comes back is picked up while the process is still running.
 */
const FAILURE_RETRY_MS = 60_000;

function isTrueType(data: ArrayBuffer): boolean {
  if (data.byteLength < 4) return false;
  const bytes = new Uint8Array(data);
  return TRUETYPE_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

export interface OgFont {
  name: string;
  data: ArrayBuffer;
  style: "normal";
  weight: 400 | 700;
}

let cachedFonts: OgFont[] | null = null;
let failedAt: number | null = null;
/** The download that is running right now, shared by every caller waiting on it. */
let inflight: Promise<OgFont[] | undefined> | null = null;

/**
 * The faces, downloaded — or nothing at all.
 *
 * Every failure inside is turned into "no faces" rather than an exception:
 * a font host that is unreachable is a degraded preview, not a crashed route.
 */
async function downloadFaces(): Promise<OgFont[]> {
  const css = await fetch(GOOGLE_FONTS_CSS, {
    headers: { "User-Agent": LEGACY_USER_AGENT },
    signal: AbortSignal.timeout(FONT_TIMEOUT_MS),
  }).then((response) => (response.ok ? response.text() : ""));

  /*
   * EACH `@font-face` BLOCK IS READ AS A PAIR.
   *
   * The URL and the weight belong to the same declaration, so they are read
   * out of the same block instead of being matched to each other by
   * position: two independent passes over the CSS paired the Nth weight with
   * the Nth URL, which silently mislabels a face the moment the API's
   * ordering differs from the assumption.
   */
  const declarations = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)]
    .map((match) => {
      const body = match[1];
      const url = body.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1];
      // A variable font declares a RANGE — "font-weight: 100 900" — and the
      // range is what the file is FOR. The face is then labelled with the
      // bottom of the range, which is the weight the renderer asks for most
      // often. Reading the range's second number would label a variable face
      // with a weight it does not have, and a face whose weight is `NaN` is
      // worse than no face at all: the renderer throws on it.
      const declaredWeight = body.match(/font-weight:\s*(\d+)/)?.[1];
      const weight = declaredWeight === undefined ? 400 : Number(declaredWeight);
      return url ? { url, weight: Number.isFinite(weight) ? weight : 400 } : null;
    })
    .filter((declaration): declaration is { url: string; weight: number } => declaration !== null);

  /*
   * THE FILES ARE FETCHED IN PARALLEL, ONCE EACH.
   *
   * One file can be named by more than one declaration — a variable font is
   * served the same file for two weights — so the DOWNLOADS are de-duplicated
   * while the declarations are all kept. The cold server was paying a serial
   * round trip to a third party per face before the first preview could be
   * drawn, and the de-duplication is what keeps a face that names the same
   * file twice from being fetched twice.
   *
   * The request is bounded: a font host that does not answer must not hold a
   * link preview open. The timeout turns a slow host into the documented
   * fallback — the Latin face `next/og` bundles — instead of a request that
   * never ends.
   */
  const uniqueUrls = [...new Set(declarations.map((declaration) => declaration.url))];
  const buffers = new Map<string, ArrayBuffer | null>();
  await Promise.all(
    uniqueUrls.map(async (url) => {
      const data = await fetch(url, { signal: AbortSignal.timeout(FONT_TIMEOUT_MS) })
        .then((response) => (response.ok ? response.arrayBuffer() : null))
        .catch(() => null);
      buffers.set(url, data);
    }),
  );

  const faces: OgFont[] = [];
  for (const declaration of declarations) {
    const data = buffers.get(declaration.url);
    // A font the parser cannot read is worse than no font: the renderer
    // throws on it, and the preview does not appear at all.
    if (data && isTrueType(data)) {
      faces.push({
        name: "Cairo",
        data,
        style: "normal",
        weight: declaration.weight === 700 ? 700 : 400,
      });
    }
  }

  return faces;
}

/**
 * The Arabic faces for a preview, or `undefined` when they cannot be had.
 *
 * WHY `undefined` AND NOT AN EMPTY ARRAY. `next/og` hands the `fonts` option
 * to Satori as `options.fonts || defaultFonts` (see
 * `next/dist/compiled/@vercel/og/index.node.js`). An empty array is TRUTHY in
 * JavaScript, so an empty array is NOT the absence of fonts: Satori is given
 * zero of them and throws "No fonts are loaded. At least one font is required
 * to calculate the layout", and the preview route answers 500. Only
 * `undefined` — or a missing key — lets `next/og` substitute the Latin face
 * it bundles. So this function returns `undefined`, never `[]`.
 *
 * WHY A FAILURE IS NOT CACHED FOREVER. The success is cached for the life of
 * the process; a failure is cached for a minute, so a font host that is down
 * for a moment does not decide the fonts of every preview this process will
 * ever draw, and a font host that is down for good is not asked on every
 * request.
 */
export async function ogFonts(): Promise<OgFont[] | undefined> {
  if (cachedFonts) return cachedFonts;
  if (failedAt !== null && Date.now() - failedAt < FAILURE_RETRY_MS) return undefined;

  /*
   * ONE DOWNLOAD FOR CONCURRENT REQUESTS.
   *
   * The route is dynamic, so the first requests after a deploy arrive
   * together — and every one of them used to start its own download of the
   * same two faces. A burst of shared links on a busy morning meant a burst
   * of identical downloads to the font host, and the process kept whichever
   * answer landed last.
   *
   * The promise is shared instead: the first caller starts the download and
   * every other caller waits for the same one. The reference is dropped when
   * it settles, so a later request starts a fresh attempt — the cache above
   * is what makes a settled download free, and this is only about the window
   * in which one is still running.
   */
  if (inflight) return inflight;

  inflight = (async () => {
    let faces: OgFont[] = [];
    try {
      faces = await downloadFaces();
    } catch {
      faces = [];
    }

    // No usable face is a FAILURE, and it is remembered as one: an empty list
    // must never reach `ImageResponse`.
    if (faces.length === 0) {
      failedAt = Date.now();
      return undefined;
    }

    cachedFonts = faces;
    failedAt = null;
    return cachedFonts;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
