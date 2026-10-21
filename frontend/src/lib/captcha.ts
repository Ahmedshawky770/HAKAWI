/**
 * THE CAPTCHA PROVIDERS, AND HOW THEIR WIDGETS ARE DRAWN.
 *
 * THE SERVER DECIDES WHICH ONE IS IN USE. It answers a sign-in that is under a CAPTCHA
 * watch with a 401 whose body names the provider and the site key — both facts about the
 * DEPLOYMENT, not about the reader. So the client does not choose a provider and does not
 * carry a key of its own: it draws the one it is told to draw, with the key it is given.
 *
 * THAT IS ALSO WHY THE CLIENT CANNOT FAKE IT. A CAPTCHA's value is that the CHECK is
 * performed by somebody other than the client: the widget produces a token, the API
 * exchanges it with the provider's server, and the API is the only party that decides
 * whether the sign-in continues. A client that skipped the widget would have nothing to
 * send, and the API would refuse it — the same way it refuses a request with no code.
 *
 * ALL THREE PROVIDERS ARE SUPPORTED, because the server supports all three. Choosing one
 * here would mean the client guessed, and a deployment that picked a different one would
 * find a sign-in screen that cannot draw its own verification.
 */
export type CaptchaProvider = "turnstile" | "hcaptcha" | "recaptcha";

interface CaptchaProviderSpec {
  /** The script that brings the widget's API onto the page. */
  scriptUrl: string;
  /** The global the script defines. */
  globalName: string;
}

const PROVIDERS: Readonly<Record<CaptchaProvider, CaptchaProviderSpec>> = {
  turnstile: {
    scriptUrl: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    globalName: "turnstile",
  },
  hcaptcha: {
    scriptUrl: "https://js.hcaptcha.com/1/api.js?render=explicit",
    globalName: "hcaptcha",
  },
  recaptcha: {
    scriptUrl: "https://www.google.com/recaptcha/api.js?render=explicit",
    globalName: "grecaptcha",
  },
};

/**
 * Whether a string names a provider this client can draw.
 *
 * The value comes from the server, and the server's word for it is not trusted to be one
 * of the three: a deployment configured with a provider nobody has heard of would
 * otherwise leave the client trying to load a script that does not exist.
 */
export function isCaptchaProvider(value: unknown): value is CaptchaProvider {
  return typeof value === "string" && value in PROVIDERS;
}

interface CaptchaApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
    },
  ) => string | number;
  reset?: (widgetId?: string | number) => void;
  remove?: (widgetId?: string | number) => void;
}

declare global {
  interface Window {
    turnstile?: CaptchaApi;
    hcaptcha?: CaptchaApi;
    grecaptcha?: CaptchaApi;
  }
}

/**
 * THE SCRIPTS ARE LOADED ONCE EACH.
 *
 * The load is a promise, and the promise is kept: the sign-in screen can be opened and
 * closed any number of times, and the widget's script is a third-party asset that has no
 * business being fetched again. A failed load is remembered too — a provider that is
 * down should not be re-fetched on every keystroke — but the failure is reported, so the
 * screen can say that the verification could not be drawn rather than sitting on an empty
 * box.
 */
const scripts = new Map<CaptchaProvider, Promise<void>>();

export function loadCaptchaScript(provider: CaptchaProvider): Promise<void> {
  const existing = scripts.get(provider);
  if (existing) return existing;

  const spec = PROVIDERS[provider];
  const promise = new Promise<void>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("A CAPTCHA can only be drawn in a browser"));
      return;
    }

    const script = document.createElement("script");
    script.src = spec.scriptUrl;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`The ${provider} verification script could not be loaded`));
    document.head.appendChild(script);
  });

  scripts.set(provider, promise);
  return promise;
}

/**
 * DRAW THE WIDGET, EXPLICITLY.
 *
 * Every provider's script is asked for EXPLICIT rendering rather than for the automatic
 * one: the automatic mode looks for a marker attribute in the page and draws whatever it
 * finds, which is a page-wide instruction the sign-in screen does not own. The explicit
 * mode draws exactly the widget it is told to draw, in the element it is given.
 */
export function renderCaptcha(
  provider: CaptchaProvider,
  container: HTMLElement,
  siteKey: string,
  onToken: (token: string | null) => void,
): string | number | null {
  const api = window[PROVIDERS[provider].globalName as "turnstile"];
  if (!api) return null;
  return api.render(container, {
    sitekey: siteKey,
    callback: (token: string) => onToken(token),
    "expired-callback": () => onToken(null),
    "error-callback": () => onToken(null),
    theme: "auto",
  });
}

/**
 * TAKE THE WIDGET DOWN.
 *
 * A widget left on the page keeps its timer running and keeps answering the reader's
 * clicks, and the reader is looking at a sign-in form that is not there any more. So it
 * is removed when the component that drew it goes away.
 */
export function removeCaptcha(provider: CaptchaProvider, widgetId: string | number): void {
  const api = window[PROVIDERS[provider].globalName as "turnstile"];
  api?.remove?.(widgetId);
}

/**
 * CLEAR A WIDGET'S ANSWER, so the reader can answer again.
 *
 * A provider's token is good for ONE verification, and the second attempt with the same
 * token is refused. So the widget is reset between attempts.
 */
export function resetCaptcha(provider: CaptchaProvider, widgetId: string | number): void {
  const api = window[PROVIDERS[provider].globalName as "turnstile"];
  api?.reset?.(widgetId);
}
