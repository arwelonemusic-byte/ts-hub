/**
 * An absolute URL on the hub's public address, for redirects and links a route builds. Never `new URL(path,
 * request.url)`: behind Caddy, request.url is the app's own localhost:3004, which once sent logouts there.
 * NEXT_PUBLIC_BASE_URL is the public address; without it (dev) the request's own address is right.
 */
export const siteUrl = (path: string, request: Request) => new URL(path, process.env.NEXT_PUBLIC_BASE_URL || request.url).toString();
