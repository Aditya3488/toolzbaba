// Admin sign-out: POST clears the session cookie.
import { endSession, json } from '../../../lib/admin-store.js';

export async function onRequestPost() {
  const res = json({ ok: true });
  res.headers.append('Set-Cookie', endSession());
  return res;
}
