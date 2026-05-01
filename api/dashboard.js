import { getSession } from '../lib/session.js';
import { getAdminClient } from '../lib/supabase.js';

// GET /dashboard — server-rendered. Auth-gated via signed session cookie.
// Shows the connected shop and recent disputes (drafts to review).

export default async function handler(req, res) {
  const session = getSession(req);
  if (!session?.shop_domain) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  const supabase = getAdminClient();

  const [{ data: shop, error: shopError }, { data: disputes }] = await Promise.all([
    supabase
      .from('shops')
      .select('shop_domain, installed_at, scopes, uninstalled_at')
      .eq('shop_domain', session.shop_domain)
      .maybeSingle(),
    supabase
      .from('disputes')
      .select('shopify_dispute_id, status, reason, amount, currency, evidence_due_by, created_at, claude_response')
      .eq('shop_domain', session.shop_domain)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (shopError || !shop) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(renderDashboard({ shop, disputes: disputes || [] }));
}

function renderDashboard({ shop, disputes }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chargeback — Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-base: #07040f;
      --bg-card: rgba(255, 255, 255, 0.035);
      --border: rgba(255, 255, 255, 0.08);
      --border-strong: rgba(168, 85, 247, 0.35);
      --text: rgba(255, 255, 255, 0.96);
      --text-muted: rgba(255, 255, 255, 0.6);
      --text-faint: rgba(255, 255, 255, 0.4);
      --purple: #a855f7;
      --purple-light: #c084fc;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { -webkit-font-smoothing: antialiased; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg-base);
      color: var(--text);
      line-height: 1.55;
      min-height: 100vh;
      position: relative;
      overflow-x: hidden;
    }
    body::before {
      content: '';
      position: fixed; inset: 0; z-index: -1; pointer-events: none;
      background:
        radial-gradient(600px circle at 15% 10%, rgba(124, 58, 237, 0.25), transparent 60%),
        radial-gradient(700px circle at 85% 70%, rgba(168, 85, 247, 0.2), transparent 60%);
      filter: blur(20px);
    }
    nav {
      padding: 24px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
    }
    .logo { font-weight: 700; display: flex; align-items: center; gap: 8px; font-size: 0.98rem; }
    .logo-dot {
      width: 10px; height: 10px; border-radius: 50%;
      background: var(--purple);
      box-shadow: 0 0 12px var(--purple);
    }
    .nav-right { display: flex; align-items: center; gap: 16px; font-size: 0.9rem; color: var(--text-muted); }
    .nav-right a { color: var(--text-muted); text-decoration: none; transition: color 0.2s; }
    .nav-right a:hover { color: var(--purple-light); }
    .pill {
      padding: 4px 10px;
      background: rgba(168, 85, 247, 0.12);
      border: 1px solid rgba(168, 85, 247, 0.25);
      border-radius: 999px;
      font-size: 0.78rem;
      color: var(--purple-light);
    }
    main { max-width: 1100px; margin: 0 auto; padding: 48px 24px 80px; }
    h1 {
      font-size: clamp(1.8rem, 3vw, 2.4rem);
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
    }
    .subtitle { color: var(--text-muted); margin-bottom: 40px; font-size: 0.98rem; }
    h2 {
      font-size: 1.15rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      margin-bottom: 16px;
      color: var(--text);
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 48px;
    }
    .meta-card {
      padding: 20px 22px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
    }
    .meta-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-faint);
      margin-bottom: 6px;
    }
    .meta-value { font-weight: 500; font-size: 0.96rem; word-break: break-word; }
    .empty {
      padding: 48px 32px;
      background: var(--bg-card);
      border: 1px dashed var(--border);
      border-radius: 16px;
      text-align: center;
      color: var(--text-muted);
    }
    .empty strong { color: var(--text); display: block; margin-bottom: 8px; font-size: 1.05rem; }
    .disputes { display: flex; flex-direction: column; gap: 12px; }
    .dispute {
      padding: 22px 24px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: center;
      transition: border-color 0.2s;
    }
    .dispute:hover { border-color: var(--border-strong); }
    .dispute-id { font-size: 0.82rem; color: var(--text-faint); margin-bottom: 4px; font-family: ui-monospace, monospace; }
    .dispute-reason { font-weight: 600; font-size: 1rem; margin-bottom: 4px; letter-spacing: -0.01em; }
    .dispute-meta { font-size: 0.85rem; color: var(--text-muted); }
    .status {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.74rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .status-drafted { background: rgba(168, 85, 247, 0.15); color: var(--purple-light); border: 1px solid rgba(168, 85, 247, 0.3); }
    .status-pending { background: rgba(255, 255, 255, 0.06); color: var(--text-muted); border: 1px solid var(--border); }
    .status-submitted { background: rgba(34, 197, 94, 0.12); color: #86efac; border: 1px solid rgba(34, 197, 94, 0.25); }
    @media (max-width: 640px) {
      nav { padding: 16px 20px; }
      main { padding: 32px 20px 60px; }
      .dispute { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <nav>
    <div class="logo"><span class="logo-dot"></span><span>Chargeback</span></div>
    <div class="nav-right">
      <span class="pill">${escape(shop.shop_domain)}</span>
      <a href="/api/auth/logout">Sign out</a>
    </div>
  </nav>
  <main>
    <h1>Dashboard</h1>
    <p class="subtitle">Drafted dispute responses, ready for your review.</p>

    <div class="meta-grid">
      <div class="meta-card">
        <div class="meta-label">Connected store</div>
        <div class="meta-value">${escape(shop.shop_domain)}</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">Installed</div>
        <div class="meta-value">${formatDate(shop.installed_at)}</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">Scopes granted</div>
        <div class="meta-value" style="font-size:0.82rem;">${escape(shop.scopes || '—')}</div>
      </div>
    </div>

    <h2>Recent disputes</h2>
    ${
      disputes.length === 0
        ? `<div class="empty"><strong>No disputes yet.</strong>When a chargeback fires on your store, you'll see it here within seconds with a draft response ready to review.</div>`
        : `<div class="disputes">${disputes.map(renderDispute).join('')}</div>`
    }
  </main>
</body>
</html>`;
}

function renderDispute(d) {
  const amount = d.amount ? `${d.currency || ''} ${d.amount}` : '—';
  const due = d.evidence_due_by ? `Due ${formatDate(d.evidence_due_by)}` : 'No deadline';
  const statusClass = `status-${d.status || 'pending'}`;
  return `<div class="dispute">
    <div>
      <div class="dispute-id">#${escape(String(d.shopify_dispute_id))}</div>
      <div class="dispute-reason">${escape(prettyReason(d.reason))}</div>
      <div class="dispute-meta">${escape(amount)} · ${escape(due)} · ${formatDate(d.created_at)}</div>
    </div>
    <div><span class="status ${statusClass}">${escape(d.status || 'pending')}</span></div>
  </div>`;
}

function prettyReason(reason) {
  if (!reason) return 'Dispute';
  return reason.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function escape(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
