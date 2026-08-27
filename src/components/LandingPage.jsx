import React, { useState } from 'react';

// Public marketing front page shown before sign-in. Self-contained styling
// (scoped .lp- classes + its own theme via prefers-color-scheme and a local
// toggle) so it never fights the app shell. `onSignIn` reveals the LoginGate.
const CSS = `
.lp{--bg:#f6f4f0;--bg2:#eeeae3;--surface:#fff;--surface2:#f3efe9;--ink:#191b21;--ink2:#3d4048;--muted:#6b6f78;--line:#e2ddd4;--line2:#d3ccc0;--accent:#ec5c15;--accent-ink:#fff;--accent-weak:#fbe7d8;--steel:#3f6690;--hi:#63a80f;--grid:rgba(25,27,33,.045);--shadow:0 1px 2px rgba(20,16,10,.05),0 12px 34px -12px rgba(20,16,10,.14);
  background:var(--bg);color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.55;min-height:100vh;-webkit-font-smoothing:antialiased}
@media (prefers-color-scheme:dark){.lp:not([data-lp-theme="light"]){--bg:#0c0d10;--bg2:#101217;--surface:#15171d;--surface2:#1b1e25;--ink:#f4f1ea;--ink2:#c3c5cc;--muted:#8b8f99;--line:#262a33;--line2:#333844;--accent:#f5721a;--accent-ink:#140b03;--accent-weak:#2a1a0c;--steel:#7ba0c9;--hi:#b9f24a;--grid:rgba(255,255,255,.035);--shadow:0 24px 60px -24px rgba(0,0,0,.7)}}
.lp[data-lp-theme="dark"]{--bg:#0c0d10;--bg2:#101217;--surface:#15171d;--surface2:#1b1e25;--ink:#f4f1ea;--ink2:#c3c5cc;--muted:#8b8f99;--line:#262a33;--line2:#333844;--accent:#f5721a;--accent-ink:#140b03;--accent-weak:#2a1a0c;--steel:#7ba0c9;--hi:#b9f24a;--grid:rgba(255,255,255,.035);--shadow:0 24px 60px -24px rgba(0,0,0,.7)}
.lp *{box-sizing:border-box}
.lp .mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.lp a{color:inherit;text-decoration:none}
.lp h1,.lp h2,.lp h3{margin:0;line-height:1.05;letter-spacing:-.02em}
.lp p{margin:0}
.lp .wrap{max-width:1120px;margin:0 auto;padding:0 24px}
.lp .eyebrow{font-size:11.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--accent)}
.lp .muted{color:var(--muted)}
.lp .pill{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;padding:5px 11px;border:1px solid var(--line2);border-radius:999px;color:var(--ink2);background:var(--surface)}
.lp .dot{width:7px;height:7px;border-radius:50%;background:var(--hi);box-shadow:0 0 0 3px color-mix(in srgb,var(--hi) 22%,transparent)}
.lp .btn{display:inline-flex;align-items:center;gap:8px;font-weight:650;font-size:14.5px;padding:12px 20px;border-radius:11px;border:1px solid transparent;cursor:pointer;transition:transform .12s,background .15s;font-family:inherit}
.lp .btn:active{transform:translateY(1px)}
.lp .btn-primary{background:var(--accent);color:var(--accent-ink)}
.lp .btn-primary:hover{background:color-mix(in srgb,var(--accent) 88%,#000)}
.lp .btn-ghost{background:transparent;color:var(--ink);border-color:var(--line2)}
.lp .btn-ghost:hover{border-color:var(--accent);color:var(--accent)}
.lp nav{position:sticky;top:0;z-index:50;backdrop-filter:blur(12px);background:color-mix(in srgb,var(--bg) 82%,transparent);border-bottom:1px solid var(--line)}
.lp .navrow{display:flex;align-items:center;justify-content:space-between;height:64px}
.lp .brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:-.02em;font-size:18px}
.lp .logo{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;background:var(--accent);color:var(--accent-ink);flex:none}
.lp .navlinks{display:flex;gap:26px;align-items:center;font-size:14px;font-weight:550;color:var(--ink2)}
.lp .navlinks a{cursor:pointer}
.lp .navlinks a:hover{color:var(--accent)}
.lp .navactions{display:flex;gap:10px;align-items:center}
.lp .icobtn{width:38px;height:38px;border-radius:10px;border:1px solid var(--line2);background:var(--surface);display:grid;place-items:center;cursor:pointer;color:var(--ink2)}
@media(max-width:820px){.lp .navlinks{display:none}}
.lp .hero{position:relative;padding:72px 0 40px;overflow:hidden}
.lp .hero::before{content:"";position:absolute;inset:0;z-index:0;background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:34px 34px;-webkit-mask-image:radial-gradient(ellipse 90% 70% at 50% 0%,#000 30%,transparent 78%);mask-image:radial-gradient(ellipse 90% 70% at 50% 0%,#000 30%,transparent 78%)}
.lp .hero-in{position:relative;z-index:1}
.lp .h1{font-size:clamp(38px,6.4vw,72px);font-weight:830;letter-spacing:-.035em;margin-top:22px;text-wrap:balance}
.lp .h1 .hl{color:var(--accent)}
.lp .lead{font-size:clamp(16px,2.2vw,20px);color:var(--ink2);max-width:640px;margin-top:20px}
.lp .herocta{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.lp .trust{display:flex;gap:26px;flex-wrap:wrap;align-items:center;margin-top:44px;padding-top:22px;border-top:1px solid var(--line);color:var(--muted);font-size:12.5px;font-weight:600}
.lp .trust b{color:var(--ink)}
.lp .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:16px;overflow:hidden}
.lp .stat{background:var(--surface);padding:22px 20px}
.lp .stat .n{font-size:28px;font-weight:800;letter-spacing:-.03em}
.lp .stat .l{font-size:12.5px;color:var(--muted);margin-top:3px}
@media(max-width:720px){.lp .stats{grid-template-columns:repeat(2,1fr)}}
.lp section{padding:74px 0}
.lp .sec-head{max-width:680px;margin-bottom:40px}
.lp .sec-head h2{font-size:clamp(27px,3.6vw,40px);font-weight:800;margin-top:12px;text-wrap:balance}
.lp .sec-head p{color:var(--ink2);font-size:16.5px;margin-top:14px}
.lp .caps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
@media(max-width:900px){.lp .caps{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.lp .caps{grid-template-columns:1fr}}
.lp .cap{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:22px;transition:border-color .15s,transform .15s}
.lp .cap:hover{border-color:var(--accent);transform:translateY(-2px)}
.lp .cap .ic{width:40px;height:40px;border-radius:11px;background:var(--accent-weak);display:grid;place-items:center;margin-bottom:14px;font-size:20px}
.lp .cap h3{font-size:16.5px;font-weight:720}
.lp .cap p{color:var(--muted);font-size:13.8px;margin-top:7px}
.lp .lenses{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
@media(max-width:900px){.lp .lenses{grid-template-columns:repeat(2,1fr)}}
@media(max-width:520px){.lp .lenses{grid-template-columns:1fr}}
.lp .lens{border:1px solid var(--line);border-radius:14px;padding:20px;background:linear-gradient(180deg,var(--surface),var(--surface2))}
.lp .lens .role{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.lp .lens h3{font-size:18px;margin-top:6px;font-weight:760}
.lp .lens ul{margin:12px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.lp .lens li{font-size:13.5px;color:var(--ink2);display:flex;gap:9px;align-items:flex-start}
.lp .lens li::before{content:"";width:6px;height:6px;border-radius:2px;background:var(--accent);margin-top:6px;flex:none}
.lp .flowband{background:var(--surface2);border-block:1px solid var(--line)}
.lp figure{margin:0}
.lp .flowsvg{width:100%;height:auto;display:block}
.lp figcaption{color:var(--muted);font-size:13px;margin-top:14px;text-align:center}
.lp .billtoggle{display:inline-flex;background:var(--surface2);border:1px solid var(--line2);border-radius:999px;padding:4px;gap:2px;margin-top:18px}
.lp .billtoggle button{border:none;background:transparent;color:var(--ink2);font-weight:650;font-size:13.5px;padding:8px 16px;border-radius:999px;cursor:pointer;font-family:inherit}
.lp .billtoggle button.on{background:var(--accent);color:var(--accent-ink)}
.lp .save{margin-left:9px;font-size:11.5px;font-weight:700;color:var(--hi)}
.lp .tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:38px;align-items:start}
@media(max-width:900px){.lp .tiers{grid-template-columns:1fr;max-width:460px;margin-inline:auto}}
.lp .tier{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:26px;display:flex;flex-direction:column;gap:14px;position:relative}
.lp .tier.feat{border-color:var(--accent);box-shadow:var(--shadow)}
.lp .tier .tag{position:absolute;top:-11px;left:26px;background:var(--accent);color:var(--accent-ink);font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:4px 11px;border-radius:999px}
.lp .tier .who{font-size:11.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
.lp .tier.steel .who{color:var(--steel)}
.lp .tier h3{font-size:22px;font-weight:800}
.lp .tier .desc{color:var(--muted);font-size:13.5px;margin-top:-6px}
.lp .price{display:flex;align-items:flex-end;gap:6px}
.lp .price .amt{font-size:34px;font-weight:830;letter-spacing:-.03em}
.lp .price .per{color:var(--muted);font-size:13px;padding-bottom:7px}
.lp .price .strike{color:var(--muted);text-decoration:line-through;font-size:14px;font-weight:600;margin-left:2px;padding-bottom:8px}
.lp .seatline{font-size:12.5px;color:var(--ink2);background:var(--surface2);border:1px solid var(--line);border-radius:9px;padding:8px 11px;margin-top:-2px}
.lp .seatline b{color:var(--accent)}
.lp .tier ul{margin:2px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px}
.lp .tier li{font-size:13.6px;color:var(--ink2);display:flex;gap:10px;align-items:flex-start;line-height:1.4}
.lp .chk{flex:none;color:var(--accent);margin-top:1px;font-weight:800}
.lp .tier.steel .chk{color:var(--steel)}
.lp .tier .btn{width:100%;justify-content:center;margin-top:6px}
.lp .tier.steel .btn-primary{background:var(--steel);color:#fff}
.lp .addons{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:16px;overflow:hidden;margin-top:26px}
.lp .addon{background:var(--surface);padding:18px}
.lp .addon .t{font-weight:700;font-size:14px}
.lp .addon .p{font-size:13px;color:var(--accent);font-weight:700;margin-top:4px}
.lp .addon .d{font-size:12px;color:var(--muted);margin-top:6px}
@media(max-width:820px){.lp .addons{grid-template-columns:repeat(2,1fr)}}
.lp .faq{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
@media(max-width:720px){.lp .faq{grid-template-columns:1fr}}
.lp details{background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:4px 18px}
.lp summary{cursor:pointer;font-weight:650;font-size:15px;padding:15px 0;list-style:none;display:flex;justify-content:space-between;gap:12px;align-items:center}
.lp summary::-webkit-details-marker{display:none}
.lp summary::after{content:"+";color:var(--accent);font-size:20px;font-weight:700}
.lp details[open] summary::after{content:"–"}
.lp details p{color:var(--ink2);font-size:14px;padding:0 0 16px}
.lp .final{position:relative;border-radius:24px;overflow:hidden;padding:56px 40px;text-align:center;background:radial-gradient(120% 140% at 50% 0%,color-mix(in srgb,var(--accent) 20%,var(--surface)) 0%,var(--surface) 60%);border:1px solid var(--line2)}
.lp .final h2{font-size:clamp(28px,4vw,44px);font-weight:830}
.lp .final p{color:var(--ink2);max-width:520px;margin:14px auto 0;font-size:16.5px}
.lp footer{border-top:1px solid var(--line);padding:40px 0;color:var(--muted);font-size:13px}
.lp .foot{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;align-items:center}
.lp .disc{font-size:11.5px;color:var(--muted);max-width:760px;margin:26px auto 0;text-align:center;line-height:1.6}
`;

const EYE = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>
);

const CAPS = [
  ['🦺', 'Worker PPE requests', "Browse the approved catalogue, raise a request with a photo, and track custody — who holds what and when it's due for replacement."],
  ['✍️', 'Approvals with signature', 'Value, repeat-issue and non-standard rules force a manager co-sign. A captured signature lands on the issue record — tier-1 and tier-2.'],
  ['📋', 'Entitlement engine', 'Role gets X per cycle. Requests auto-approve within quota or escalate over it — separation of duties enforced in the backend.'],
  ['📦', 'Live multi-location inventory', 'On-hand, reserved, in-transit and days-of-cover per store. Receiving a purchase order writes stock straight into inventory.'],
  ['🛒', 'B2B commerce', 'Quote to real order, priced server-side from contract pricing. Customers, spend-vs-limit tracking and PDF invoices out of the box.'],
  ['🚚', 'Purchase orders + receipting', 'Raise a PO to a supplier, route it for manager approval and signature, print or email it, then receive it to increment stock.'],
  ['🏷️', 'Promotions & margin control', 'Mark a product down by type — markdown, new line, upgrade, focus — and watch the cost basis and margin recalculate on the stock tables.'],
  ['📊', 'Reports & dashboards', 'Mine stock valuation, departmental consumption vs entitlement, employee issue registers — exportable to CSV and print-ready PDF.'],
  ['🔐', 'Tenancy, roles & MFA', 'Every site is isolated. Capabilities gate every screen and write; privileged actions demand step-up MFA. Provision users in-app.'],
];

const LENSES = [
  ['The worker', 'Request & carry', ['Raise a PPE request in seconds', 'See entitlement left this cycle', 'Track gear in custody & replacement dates']],
  ['The manager', 'Approve & sign', ['Queue of requests & purchase orders', 'Co-sign with a captured signature', 'Approval history & separation of duties']],
  ['The merchant', 'Sell & restock', ['B2B orders, invoices, customer limits', 'Suppliers, purchase orders, receipting', 'Promotions & live margin control']],
  ['The group', 'See & govern', ['Consolidated valuation & spend', 'Tenant & user provisioning', 'Audit trail, branding, policy']],
];

const FAQ = [
  ['Why is Plant priced per user?', 'The platform bills on usage, so a plant with thousands of workers drives more compute, storage and traffic than a small one. The base covers up to 200 users; beyond that, tiered active-seat pricing keeps your plan predictable as you scale.'],
  ['Can one company run several plants?', "That's the Group tier. Each plant is an isolated site with its own stock, users and approvals, rolled up into consolidated valuation and spend for the group."],
  ['Can SightLive run in our own environment?', 'Yes. SightLive can be deployed in the cloud or in your local environment, subject to an infrastructure and security assessment.'],
  ['Do workers need logins?', 'Workers are provisioned in-app by a tenant admin and only see the Request & custody views. Privileged roles use step-up MFA.'],
  ['Is our data isolated?', 'Every tenant is scoped at the database with row-level security, and every screen and write is capability-gated. Group audit exports are available on Enterprise.'],
  ['Can we import our catalogue?', 'Yes — CSV import with a downloadable template and a dry-run validation, plus per-product photo upload for the storefront and issue records.'],
  ['What does onboarding look like?', 'Merchant and Plant self-serve. Group gets dedicated onboarding, data migration help and an SLA with a named success manager.'],
];

export const LandingPage = ({ onSignIn }) => {
  const [annual, setAnnual] = useState(true);
  const [dark, setDark] = useState(null); // null = follow system

  const merchant = annual ? 'R990' : 'R1,190';
  const plant = annual ? 'R5,900' : 'R6,900';

  return (
    <div className="lp" data-lp-theme={dark === null ? undefined : dark ? 'dark' : 'light'}>
      <style>{CSS}</style>

      <nav>
        <div className="wrap navrow">
          <div className="brand"><span className="logo" aria-hidden="true">{EYE}</span>SightLive</div>
          <div className="navlinks">
            <a href="#capabilities">Platform</a>
            <a href="#lenses">Who it's for</a>
            <a href="#flow">How it works</a>
            <a href="#pricing">Pricing</a>
          </div>
          <div className="navactions">
            <button className="icobtn" title="Toggle theme" aria-label="Toggle theme"
              onClick={() => setDark((d) => (d === null ? !window.matchMedia('(prefers-color-scheme: dark)').matches : !d))}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"/></svg>
            </button>
            <button className="btn btn-ghost" onClick={onSignIn}>Sign in</button>
            <button className="btn btn-primary" onClick={onSignIn}>Get started</button>
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="wrap hero-in">
          <span className="pill"><span className="dot"></span> Live PPE stock control · shaft to boardroom</span>
          <h1 className="h1">The PPE supply chain for<br /><span className="hl">African mining</span>, in one system.</h1>
          <p className="lead">SightLive runs the whole loop — a worker requests safety gear, a manager co-signs, the store issues it, stock decrements, and the merchant restocks through B2B orders and purchase orders. Entitlements, approvals with signature, live inventory and group-level reporting, on one multi-tenant platform.</p>
          <div className="herocta">
            <button className="btn btn-primary" onClick={onSignIn}>Sign in to the platform</button>
            <a className="btn btn-ghost" href="#pricing">See pricing →</a>
          </div>
          <div className="trust">
            <span>Built for <b>coal · iron ore · platinum · uranium</b> operations</span>
            <span><b>MFA</b> + role-based access</span>
            <span><b>POPIA</b>-minded audit trail</span>
          </div>
        </div>
      </header>

      <div className="wrap">
        <div className="stats">
          <div className="stat"><div className="n">1 loop</div><div className="l">request → approve → issue → restock</div></div>
          <div className="stat"><div className="n">4 roles</div><div className="l">worker · manager · merchant · owner</div></div>
          <div className="stat"><div className="n">Live</div><div className="l">inventory + spend, per site</div></div>
          <div className="stat"><div className="n">Multi-site</div><div className="l">group roll-up reporting</div></div>
        </div>
      </div>

      <section id="capabilities">
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow">The platform</span>
            <h2>Everything the store, the shaft and the buyer need — in one place.</h2>
            <p>No spreadsheets, no WhatsApp approvals, no “who has the boots.” Each capability is live, auditable, and scoped to the right person.</p>
          </div>
          <div className="caps">
            {CAPS.map(([ic, h, p]) => (
              <div className="cap" key={h}><div className="ic">{ic}</div><h3>{h}</h3><p>{p}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section id="lenses" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow">Who it's for</span>
            <h2>One platform, four lenses.</h2>
            <p>The same live data, shown to each person exactly as their job needs it — nothing they shouldn't see.</p>
          </div>
          <div className="lenses">
            {LENSES.map(([role, h, items]) => (
              <div className="lens" key={h}><div className="role">{role}</div><h3>{h}</h3>
                <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="flowband" id="flow">
        <section>
          <div className="wrap">
            <div className="sec-head" style={{ marginInline: 'auto', textAlign: 'center' }}>
              <span className="eyebrow">How it works</span>
              <h2>Two flows, one ledger of stock.</h2>
              <p style={{ marginInline: 'auto' }}>Internal issue and external procurement both move the same live inventory — nothing is double-keyed.</p>
            </div>
            <figure>
              <svg className="flowsvg" viewBox="0 0 960 260" role="img" aria-label="Internal PPE issue flow and commerce procurement flow both updating one live stock ledger">
                <defs>
                  <marker id="lar" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0 0L9 4.5L0 9Z" fill="var(--accent)"/></marker>
                  <marker id="lars" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0 0L9 4.5L0 9Z" fill="var(--steel)"/></marker>
                </defs>
                <text x="12" y="46" fill="var(--muted)" fontSize="11" fontWeight="700" letterSpacing="1.5" fontFamily="ui-sans-serif,system-ui">INTERNAL · ISSUE</text>
                <text x="12" y="196" fill="var(--muted)" fontSize="11" fontWeight="700" letterSpacing="1.5" fontFamily="ui-sans-serif,system-ui">COMMERCE · PROCURE</text>
                <g fontFamily="ui-sans-serif,system-ui" fontSize="13" fontWeight="650">
                  <g><rect x="12" y="58" width="150" height="46" rx="10" fill="var(--surface)" stroke="var(--line2)"/><text x="87" y="86" textAnchor="middle" fill="var(--ink)">Worker request</text></g>
                  <line x1="168" y1="81" x2="212" y2="81" stroke="var(--accent)" strokeWidth="2" markerEnd="url(#lar)"/>
                  <g><rect x="218" y="58" width="160" height="46" rx="10" fill="var(--surface)" stroke="var(--line2)"/><text x="298" y="86" textAnchor="middle" fill="var(--ink)">Manager co-sign</text></g>
                  <line x1="384" y1="81" x2="428" y2="81" stroke="var(--accent)" strokeWidth="2" markerEnd="url(#lar)"/>
                  <g><rect x="434" y="58" width="150" height="46" rx="10" fill="var(--surface)" stroke="var(--line2)"/><text x="509" y="86" textAnchor="middle" fill="var(--ink)">Store issues</text></g>
                  <line x1="590" y1="81" x2="640" y2="105" stroke="var(--accent)" strokeWidth="2" markerEnd="url(#lar)"/>
                </g>
                <g><rect x="648" y="86" width="200" height="88" rx="14" fill="var(--accent-weak)" stroke="var(--accent)"/>
                  <text x="748" y="123" textAnchor="middle" fill="var(--accent)" fontFamily="ui-sans-serif,system-ui" fontSize="13" fontWeight="800" letterSpacing="1">LIVE STOCK</text>
                  <text x="748" y="145" textAnchor="middle" fill="var(--ink2)" fontFamily="ui-sans-serif,system-ui" fontSize="11.5">on-hand · reserved · cover</text></g>
                <g fontFamily="ui-sans-serif,system-ui" fontSize="13" fontWeight="650">
                  <g><rect x="12" y="156" width="150" height="46" rx="10" fill="var(--surface)" stroke="var(--line2)"/><text x="87" y="184" textAnchor="middle" fill="var(--ink)">Raise PO</text></g>
                  <line x1="168" y1="179" x2="212" y2="179" stroke="var(--steel)" strokeWidth="2" markerEnd="url(#lars)"/>
                  <g><rect x="218" y="156" width="160" height="46" rx="10" fill="var(--surface)" stroke="var(--line2)"/><text x="298" y="184" textAnchor="middle" fill="var(--ink)">Approve &amp; sign</text></g>
                  <line x1="384" y1="179" x2="428" y2="179" stroke="var(--steel)" strokeWidth="2" markerEnd="url(#lars)"/>
                  <g><rect x="434" y="156" width="150" height="46" rx="10" fill="var(--surface)" stroke="var(--line2)"/><text x="509" y="184" textAnchor="middle" fill="var(--ink)">Receive stock</text></g>
                  <line x1="590" y1="179" x2="640" y2="150" stroke="var(--steel)" strokeWidth="2" markerEnd="url(#lars)"/>
                </g>
              </svg>
              <figcaption>Every issue and every receipt writes the same inventory — so valuation, cover and spend are always one number.</figcaption>
            </figure>
          </div>
        </section>
      </div>

      <section id="pricing">
        <div className="wrap">
          <div className="sec-head" style={{ marginInline: 'auto', textAlign: 'center' }}>
            <span className="eyebrow">Pricing</span>
            <h2>Priced for the merchant, the plant and the group.</h2>
            <p style={{ marginInline: 'auto' }}>Start with one site, roll up to a whole group. Prices in ZAR, excl. VAT. Annual billing saves ~17%.</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div className="billtoggle" role="tablist" aria-label="Billing period">
                <button className={annual ? 'on' : ''} onClick={() => setAnnual(true)}>Annual <span className="save">–17%</span></button>
                <button className={annual ? '' : 'on'} onClick={() => setAnnual(false)}>Monthly</button>
              </div>
            </div>
          </div>

          <div className="tiers">
            <div className="tier">
              <div className="who">Merchant</div>
              <h3>Merchant</h3>
              <p className="desc">For a PPE supplier or in-house store running B2B sales and procurement.</p>
              <div className="price"><span className="amt mono">{merchant}</span><span className="per">/ month</span>{annual && <span className="strike mono">R1,190</span>}</div>
              <div className="seatline">Up to <b>5 users</b> · commerce only</div>
              <ul>
                <li><span className="chk">✓</span> B2B storefront, quotes &amp; PDF invoices</li>
                <li><span className="chk">✓</span> Catalogue with size/colour variants</li>
                <li><span className="chk">✓</span> Suppliers, purchase orders &amp; receipting</li>
                <li><span className="chk">✓</span> Promotions &amp; live margin control</li>
                <li><span className="chk">✓</span> Customers &amp; spend-limit tracking</li>
                <li><span className="chk">✓</span> Email support</li>
              </ul>
              <button className="btn btn-ghost" onClick={onSignIn}>Start as a Merchant</button>
            </div>

            <div className="tier feat">
              <span className="tag">Most popular</span>
              <div className="who">Plant</div>
              <h3>Plant</h3>
              <p className="desc">For a single mine plant or site running the full PPE control loop.</p>
              <div className="price"><span className="amt mono">{plant}</span><span className="per">/ month</span>{annual && <span className="strike mono">R6,900</span>}</div>
              <div className="seatline">Includes <b>200 users</b>, then <b>R250</b> / active seat / month</div>
              <ul>
                <li><span className="chk">✓</span> <b>Everything in Merchant</b>, plus:</li>
                <li><span className="chk">✓</span> Unlimited worker PPE requests</li>
                <li><span className="chk">✓</span> Entitlement engine &amp; quota rules</li>
                <li><span className="chk">✓</span> Tier-1/tier-2 approvals with signature</li>
                <li><span className="chk">✓</span> Storekeeper issue desk &amp; custody register</li>
                <li><span className="chk">✓</span> Live inventory, dashboards &amp; CSV/PDF reports</li>
                <li><span className="chk">✓</span> MFA · priority support</li>
              </ul>
              <button className="btn btn-primary" onClick={onSignIn}>Start a Plant</button>
            </div>

            <div className="tier steel">
              <div className="who">Enterprise · Group</div>
              <h3>Group</h3>
              <p className="desc">For a mining group running many plants under one roof.</p>
              <div className="price"><span className="amt mono">From R24,900</span><span className="per">/ month</span></div>
              <div className="seatline">Multi-site · from <b>R150</b> / active seat / month</div>
              <ul>
                <li><span className="chk">✓</span> <b>Everything in Plant</b>, across every site</li>
                <li><span className="chk">✓</span> Consolidated valuation &amp; spend roll-up</li>
                <li><span className="chk">✓</span> SSO / SAML &amp; custom entitlement policy</li>
                <li><span className="chk">✓</span> Group audit exports &amp; branding</li>
                <li><span className="chk">✓</span> Dedicated onboarding, SLA &amp; success manager</li>
              </ul>
              <button className="btn btn-primary" onClick={onSignIn}>Talk to sales</button>
            </div>
          </div>

          <div className="addons">
            <div className="addon"><div className="t">Extra site</div><div className="p mono">+R4,900 / mo</div><div className="d">Add a plant or store to a Plant/Group plan.</div></div>
            <div className="addon"><div className="t">Active seats</div><div className="p mono">R250 → R150 / seat</div><div className="d">R250 per active seat beyond the 200 included, reducing to R150 at Enterprise volume.</div></div>
            <div className="addon"><div className="t">White-label</div><div className="p mono">+R2,500 / mo</div><div className="d">Your brand, logo and domain on the portal.</div></div>
            <div className="addon"><div className="t">Deployment</div><div className="p mono">Cloud or local</div><div className="d">Managed cloud or deployment in your local environment, scoped to your requirements.</div></div>
          </div>
          <p className="disc">Prices exclude VAT, setup, change request, and maintenance fees. SightLive can be deployed in the cloud or in your local environment; deployment requirements are scoped separately.</p>
        </div>
      </section>

      <section style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sec-head"><span className="eyebrow">Questions</span><h2>The practical stuff.</h2></div>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details key={q}><summary>{q}</summary><p>{a}</p></details>
            ))}
          </div>
        </div>
      </section>

      <section style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="final">
            <span className="pill" style={{ marginBottom: 16 }}><span className="dot"></span> Ready when your next shift is</span>
            <h2>Put the whole PPE loop on one system.</h2>
            <p>From a single store to a mining group — start with one site and grow into consolidated control.</p>
            <div className="herocta" style={{ justifyContent: 'center', marginTop: 24 }}>
              <button className="btn btn-primary" onClick={onSignIn}>Sign in</button>
              <a className="btn btn-ghost" href="#pricing">Choose a plan</a>
            </div>
          </div>
          <p className="disc">SightLive is a multi-tenant PPE stock-management platform. Pricing shown is in South African Rand and is indicative for launch. Company sectors are shown to describe fit, not to imply endorsement.</p>
        </div>
      </section>

      <footer>
        <div className="wrap foot">
          <div className="brand"><span className="logo" aria-hidden="true">{EYE}</span>SightLive</div>
          <div>© 2026 SightLive · PPE Stock Platform</div>
        </div>
      </footer>
    </div>
  );
};
