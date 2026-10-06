// Admin sign-in: POST { user, key } with the X-Requested-With header. Right ID and password: a session cookie that page scripts
// can't read (see lib/admin-store.js). Wrong ones count towards the lock.
import { checkPassword, fail, fromAdminPage, json, newSession, setupProblem, CSRF_HEADER, CSRF_VALUE } from '../../../lib/admin-store.js';

export async function onRequestPost({ request, env }) {
  const bad = setupProblem(env); if (bad) return bad;
  if (!fromAdminPage(request)) return fail(403, `Admin requests need the header ${CSRF_HEADER}: ${CSRF_VALUE}.`);
  let b; try { b = await request.json(); } catch { return fail(400, 'Send JSON.'); }
  const user = typeof b.user === 'string' ? b.user.slice(0, 200) : '', key = typeof b.key === 'string' ? b.key.slice(0, 500) : '';
  const wrong = await checkPassword(request, env, user, key);
  if (wrong) return wrong;
  const res = json({ ok: true });
  res.headers.append('Set-Cookie', await newSession(env));
  return res;
}
