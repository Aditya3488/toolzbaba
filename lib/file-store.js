// "Temporary file share" on Cloudflare Pages Functions: any file up to MAX_FILE_MB is kept in the same KV namespace as the image
// hosting (bound as CDN), under file:<id>, and expires by itself. Files are always served as a download (never shown inside the site),
// so a shared page or script can't run on our domain.
import { fail, json, randomId, sameSecret, sha256 } from './cdn-store.js';
export { fail, json, randomId, sameSecret, sha256 };

export const MAX_FILE_MB = 20;      // KV values can be 25 MB
export const MAX_FILES = 5;
export const HOURS = [1, 24, 168, 720];
// types that can run code in a browser or on a PC: not hosted here
export const BLOCKED = new Set(['exe', 'dll', 'bat', 'cmd', 'com', 'scr', 'msi', 'apk', 'jar', 'vbs', 'ps1', 'sh', 'js', 'mjs', 'html', 'htm', 'xhtml', 'svg', 'php', 'lnk', 'hta', 'reg']);
export const extOf = name => (String(name).match(/\.([A-Za-z0-9]{1,10})$/) || [, ''])[1].toLowerCase();
// a safe file name for the link and for Content-Disposition
export const cleanName = name => String(name || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';
