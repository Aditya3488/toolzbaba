// Public web addresses only (shared by functions/api/site-colors.js and functions/api/site-fetch.js):
// http(s), a dotted host name (no IP numbers, no local names), the standard ports, no user name or password.
// Cloudflare Functions can only reach the public internet anyway; this keeps the answers clear and the rules in one place.
export function checkUrl(u, env) {
  let url; try { url = new URL(u); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  if (env && env.ALLOW_PRIVATE_HOSTS === '1') return url;  // local testing only (.dev.vars), never set on the live site
  const h = url.hostname.toLowerCase();
  if (!h.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || h.startsWith('[') || /(^|\.)(localhost|local|internal|lan|home|corp|test|invalid|intranet)$/.test(h)) return null;
  if (url.port && !['80', '443'].includes(url.port)) return null;
  if (url.username || url.password) return null;
  return url;
}
