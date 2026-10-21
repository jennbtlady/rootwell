import type { Instrumentation } from "next";

/**
 * Error reporting (Sentry), server side. Off unless SENTRY_DSN is set, so local development
 * and tests send nothing. Every event goes through scrubEvent first: no donor details,
 * request bodies, cookies, or sign-in headers ever leave the app.
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const Sentry = await import("@sentry/nextjs");
  const { scrubEvent } = await import("./lib/sentry-scrub");
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Collect as little as possible at the source; scrubEvent is the second layer.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ["user-agent", "content-type"] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (b) => (b.category === "console" ? null : b),
  });
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { setErrorReporter } = await import("@maple/api");
    // The API catches its own errors and answers with a plain message; report them here.
    setErrorReporter((err, where) => Sentry.captureException(err, { tags: { api_path: where.path.replace(/[0-9a-f-]{36}/g, ":id"), method: where.method } }));
  }
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
