// Notifications: an in-app inbox for everyone (the bell), plus optional Slack messages.
// Slack: set the secret SLACK_WEBHOOK_URL (an incoming-webhook URL for the channel) with
//   npx wrangler -c wrangler.toml secret put SLACK_WEBHOOK_URL
// Without it, notifications are in-app only.

export interface NotifyEnv { DB: D1Database; SLACK_WEBHOOK_URL?: string; OWNER_EMAILS?: string }
export interface Note { kind: string; actor: string; setId?: string | null; adId?: string | null; text: string }

const now = () => new Date().toISOString();
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const PORTAL = 'https://ads.overyondrdev.com';

// Editors and admins (including owners) – the people who act on suggestions and reviews.
export async function editors(env: NotifyEnv): Promise<string[]> {
  const own = (env.OWNER_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const { results } = await env.DB.prepare("SELECT email FROM users WHERE role IN ('editor', 'admin')").all<{ email: string }>();
  return [...new Set([...own, ...results.map((r) => r.email)])];
}

export async function notify(env: NotifyEnv, to: string[], n: Note, ctx?: ExecutionContext) {
  const people = [...new Set(to)].filter((e) => e && e !== n.actor);
  if (people.length) {
    const ts = now();
    await env.DB.batch(people.slice(0, 200).map((email) =>
      env.DB.prepare('INSERT INTO notifications (email, kind, actor, set_id, ad_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(email, n.kind, n.actor, n.setId ?? null, n.adId ?? null, n.text.slice(0, 500), ts)));
  }
  if (env.SLACK_WEBHOOK_URL) {
    const link = n.adId ? `${PORTAL}/#ad=${n.adId}` : PORTAL;
    const post = fetch(env.SLACK_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `${n.text} <${link}|Open in the ad library>` }) }).catch(() => {});
    if (ctx) ctx.waitUntil(post); else await post;
  }
}

export async function inbox(request: Request, env: NotifyEnv, email: string, sub?: string) {
  if (request.method === 'POST' && sub === 'read') {
    const b: any = await request.json().catch(() => ({}));
    const ts = now();
    if (b.all) await env.DB.prepare('UPDATE notifications SET read_at = ? WHERE email = ? AND read_at IS NULL').bind(ts, email).run();
    else if (Number.isInteger(b.id)) await env.DB.prepare('UPDATE notifications SET read_at = ? WHERE email = ? AND id = ?').bind(ts, email, b.id).run();
    return json({ ok: true });
  }
  const [items, unread] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM notifications WHERE email = ? ORDER BY id DESC LIMIT 40').bind(email),
    env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE email = ? AND read_at IS NULL').bind(email),
  ]);
  return json({ items: items.results, unread: (unread.results[0] as any).n || 0 });
}
