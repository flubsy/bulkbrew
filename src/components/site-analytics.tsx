"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics (cookieless page views). Query strings and fragments are stripped before
 * anything is sent: sign-in and password-reset redirects land on /account?code=… with a one-time
 * auth code, and share links can carry ids. Only the path is reported.
 */
function stripQuery(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.search = "";
  url.hash = "";
  return { ...event, url: url.toString() };
}

export function SiteAnalytics() {
  return <Analytics beforeSend={stripQuery} />;
}
