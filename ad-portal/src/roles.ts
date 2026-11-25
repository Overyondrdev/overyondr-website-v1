// Roles for the ad portal. Everyone who gets through Cloudflare Access (any @overyondr.com email) can sign in.
//   viewer  see ads, download them, comment                        (everyone, unless given another role)
//   editor  + edit ad copy and CTA (re-renders ads), upload, set status and dates, review, campaigns
//   admin   + give people roles (People tab), delete any ad or campaign
// Owners (OWNER_EMAILS in wrangler.toml) are always admins and can't be changed from the portal.

import { notify } from './notify';

export type Role = 'viewer' | 'editor' | 'admin';
export const ROLES: Role[] = ['viewer', 'editor', 'admin'];
const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

export interface RoleEnv { DB: D1Database; OWNER_EMAILS?: string; DEFAULT_ROLE?: string }
export interface Who { email: string; role: Role; owner: boolean }

const now = () => new Date().toISOString();
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const err = (status: number, message: string) => json({ error: message }, status);

export function owners(env: RoleEnv): string[] {
  return (env.OWNER_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}
function defaultRole(env: RoleEnv): Role {
  return ROLES.includes(env.DEFAULT_ROLE as Role) ? (env.DEFAULT_ROLE as Role) : 'viewer';
}

export async function whoIs(env: RoleEnv, email: string): Promise<Who> {
  if (owners(env).includes(email)) return { email, role: 'admin', owner: true };
  const row = await env.DB.prepare('SELECT role FROM users WHERE email = ?').bind(email).first<{ role: Role }>();
  return { email, role: row && ROLES.includes(row.role) ? row.role : defaultRole(env), owner: false };
}

export const can = (who: Who, needed: Role) => RANK[who.role] >= RANK[needed];
export const rank = (r: string | null | undefined) => (r && r in RANK ? RANK[r as Role] : -1);

// ------------------------------------------------------------------ tour + help center
export async function tourRole(env: RoleEnv, email: string): Promise<Role | null> {
  const row = await env.DB.prepare('SELECT tour_role FROM users WHERE email = ?').bind(email).first<{ tour_role: Role | null }>();
  return row && row.tour_role && ROLES.includes(row.tour_role) ? row.tour_role : null;
}
export async function setTourRole(request: Request, env: RoleEnv, me: Who) {
  const b: any = await request.json().catch(() => ({}));
  const role: Role = ROLES.includes(b.role) && rank(b.role) <= rank(me.role) ? b.role : me.role;
  await seen(env, me.email);
  await env.DB.prepare('UPDATE users SET tour_role = ? WHERE email = ?').bind(role, me.email).run();
  return json({ ok: true, tourRole: role });
}
// Who to ask: admins' emails (owners first).
export async function helpContacts(env: RoleEnv) {
  const own = owners(env);
  const { results } = await env.DB.prepare("SELECT email FROM users WHERE role = 'admin' ORDER BY email").all<{ email: string }>();
  const admins = [...own, ...results.map((r) => r.email).filter((e) => !own.includes(e))];
  return json({ admins });
}
export async function helpFeedback(request: Request, env: RoleEnv, me: Who) {
  const b: any = await request.json().catch(() => ({}));
  const article = String(b.article || '').slice(0, 80);
  if (!/^[a-z0-9-]+$/.test(article)) return err(400, 'Unknown article.');
  const helpful = b.helpful === true ? 1 : b.helpful === false ? 0 : null;
  const comment = String(b.comment || '').trim().slice(0, 2000) || null;
  if (helpful === null && !comment) return err(400, 'Nothing to send.');
  await env.DB.prepare('INSERT INTO help_feedback (article, helpful, comment, email, created_at) VALUES (?, ?, ?, ?, ?)').bind(article, helpful, comment, me.email, now()).run();
  return json({ ok: true });
}

// Remember who has visited, so admins can find them on the People tab.
export async function seen(env: RoleEnv, email: string) {
  const ts = now();
  await env.DB.prepare(`INSERT INTO users (email, role, first_seen_at, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET last_seen_at = excluded.last_seen_at`).bind(email, defaultRole(env), ts, ts, ts, ts).run();
}

export async function log(env: RoleEnv, actor: string, action: string, target: string | null, detail: unknown = {}) {
  await env.DB.prepare('INSERT INTO activity (actor, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(actor, action, target, JSON.stringify(detail).slice(0, 8000), now()).run();
}

// ------------------------------------------------------------------ People tab (admins)
export async function usersApi(request: Request, env: RoleEnv, me: Who, target?: string, ctx?: ExecutionContext): Promise<Response> {
  if (!can(me, 'admin')) return err(403, 'Only admins can manage people.');
  const m = request.method;
  const own = owners(env);
  if (m === 'GET' && !target) {
    const [users, activity, help] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM users ORDER BY CASE role WHEN \'admin\' THEN 0 WHEN \'editor\' THEN 1 ELSE 2 END, COALESCE(last_seen_at, created_at) DESC'),
      env.DB.prepare('SELECT * FROM activity ORDER BY id DESC LIMIT 40'),
      env.DB.prepare('SELECT * FROM help_feedback ORDER BY id DESC LIMIT 30'),
    ]);
    const list = (users.results as any[]).map((u) => ({ ...u, owner: own.includes(u.email), role: own.includes(u.email) ? 'admin' : u.role }));
    for (const o of own) if (!list.some((u) => u.email === o)) list.unshift({ email: o, role: 'admin', owner: true, added_by: null, last_seen_at: null });
    return json({ users: list, activity: (activity.results as any[]).map((a) => ({ ...a, detail: JSON.parse(a.detail || '{}') })), help: help.results, defaultRole: defaultRole(env), roles: ROLES });
  }
  const email = String(target || '').trim().toLowerCase();
  if (!/^[^@\s]+@overyondr\.com$/.test(email)) return err(400, 'Use an @overyondr.com email address.');
  if (own.includes(email)) return err(400, 'Owners are set in the portal’s configuration and are always admins.');
  if (email === me.email) return err(400, 'You can’t change your own role. Ask another admin.');
  const ts = now();
  if (m === 'PUT') {
    const b: any = await request.json().catch(() => ({}));
    if (!ROLES.includes(b.role)) return err(400, 'Choose viewer, editor or admin.');
    await env.DB.prepare(`INSERT INTO users (email, role, added_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET role = excluded.role, added_by = excluded.added_by, updated_at = excluded.updated_at`).bind(email, b.role, me.email, ts, ts).run();
    await log(env, me.email, 'role_set', email, { role: b.role });
    await notify(env, [email], { kind: 'role', actor: me.email, text: `${me.email.split('@')[0]} made you ${({ admin: 'an admin', editor: 'an editor', viewer: 'a viewer' } as Record<string, string>)[b.role]} in the ad library. Take a look at what’s new.` });
    return usersApi(new Request(request.url), env, me);
  }
  if (m === 'DELETE') {
    await env.DB.prepare('UPDATE users SET role = ?, added_by = ?, updated_at = ? WHERE email = ?').bind(defaultRole(env), me.email, ts, email).run();
    await log(env, me.email, 'role_removed', email, { role: defaultRole(env) });
    return usersApi(new Request(request.url), env, me);
  }
  return err(405, 'Method not allowed');
}
