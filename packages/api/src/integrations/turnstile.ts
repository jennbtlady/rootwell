/**
 * Cloudflare Turnstile, the bot check on public giving pages (launch review, must fix 3).
 *
 * Live when TURNSTILE_SECRET_KEY is set. Outside production without it, the check is skipped
 * and the page shows no widget, like the other stand-ins. A production build without the key
 * refuses gifts rather than run with no bot check.
 *
 * For local testing with the real widget, Cloudflare publishes test keys that always pass:
 * site key 1x00000000000000000000AA, secret 1x0000000000000000000000000000000AA.
 */
export type TurnstileVerifier = (token: string | undefined, ip: string) => Promise<boolean>;

let override: TurnstileVerifier | undefined;

/** For tests. */
export function setTurnstileVerifier(v: TurnstileVerifier | undefined) {
  override = v;
}

export class TurnstileNotConfigured extends Error {}

export function turnstileVerifier(): TurnstileVerifier {
  if (override) return override;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new TurnstileNotConfigured("TURNSTILE_SECRET_KEY is not set");
    return async () => true;
  }
  return async (token, ip) => {
    if (!token) return false;
    const body = new URLSearchParams({ secret, response: token });
    if (ip !== "local") body.set("remoteip", ip);
    try {
      const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
      return ((await res.json()) as { success?: boolean }).success === true;
    } catch {
      // Cloudflare unreachable: refuse, and the donor can try again.
      return false;
    }
  };
}
