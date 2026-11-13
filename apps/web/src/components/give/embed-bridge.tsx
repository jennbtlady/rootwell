"use client";

import { useEffect } from "react";

/**
 * Inside the embed frame (fundraising Phase 1): tells /embed.js on the nonprofit's site how
 * tall the page is, so the frame never scrolls on its own. The height is not private, so it
 * goes to any parent.
 */
export function EmbedBridge() {
  useEffect(() => {
    if (window.parent === window) return;
    const send = () => window.parent.postMessage({ type: "rootwell:height", height: document.documentElement.scrollHeight }, "*");
    send();
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);
  return null;
}

/**
 * Opens checkout from inside the embed frame. Stripe Checkout will not run in a frame, so the
 * page asks /embed.js on the nonprofit's site to open it in the full window, and the script
 * confirms. Without that script (someone framed the page by hand), nothing confirms, and the
 * form shows a link for the donor to open checkout in a new tab. A tab opened by a timer
 * would be blocked as a pop-up, so it has to be the donor's own click.
 */
export function openCheckout(url: string, embedded: boolean): Promise<"opening" | "needs_click"> {
  if (!embedded || window.parent === window) {
    window.location.assign(url);
    return Promise.resolve("opening");
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve("needs_click");
    }, 1500);
    function onMessage(e: MessageEvent) {
      if (e.source !== window.parent || (e.data as { type?: string } | null)?.type !== "rootwell:checkout-ok") return;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve("opening");
    }
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "rootwell:checkout", url }, "*");
  });
}
