import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "./lib/sentry-scrub";

/**
 * Error reporting in the browser. Off unless NEXT_PUBLIC_SENTRY_DSN is set. No session
 * replay (it would record donor details on screen). Every event is scrubbed first.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
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
    beforeBreadcrumb: (b) => (b.category === "console" || b.category === "ui.input" ? null : b),
  });
}
