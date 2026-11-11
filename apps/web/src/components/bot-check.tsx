"use client";

import { useRef, useState, type ReactNode } from "react";
import Script from "next/script";

/**
 * Cloudflare Turnstile, the bot check on public forms (launch review, must fix 3): giving
 * pages, sign in and sign up. Shown only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set.
 * "interaction-only" means most people never see it; it appears only when Cloudflare wants a
 * click. Without a key (local development) there is no widget and `token` stays null.
 *
 * Giving pages send the token to our API, which checks it with TURNSTILE_SECRET_KEY. Sign in
 * and sign up pass it to Supabase Auth as captchaToken, which checks it when captcha is turned
 * on for the project (see docs/rate-limits.md).
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type Turnstile = { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id: string) => void };
const turnstile = () => (window as unknown as { turnstile?: Turnstile }).turnstile;

export const BOT_CHECK_WAIT = "The security check is still running. Please wait a moment and try again.";

export function useBotCheck(): { required: boolean; token: string | null; reset: () => void; element: ReactNode } {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  function render() {
    const ts = turnstile();
    if (!ts || !box.current || widget.current || !SITE_KEY) return;
    widget.current = ts.render(box.current, {
      sitekey: SITE_KEY,
      appearance: "interaction-only",
      callback: (t: string) => setToken(t),
      "expired-callback": () => setToken(null),
      "error-callback": () => setToken(null),
    });
  }

  /** A token works once. Call after every try, so the next one gets a fresh token. */
  function reset() {
    const ts = turnstile();
    if (ts && widget.current) ts.reset(widget.current);
    setToken(null);
  }

  const element = SITE_KEY ? (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={render} />
      <div ref={box} />
    </>
  ) : null;

  return { required: !!SITE_KEY, token, reset, element };
}
