import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useLang } from "../i18n";
import { useAuth, useCatalog, useToast } from "../ctx";
import { db } from "../api";
import { DropList, Loading } from "../components";
import { buildTree, countTree, daysSince, dilutionPct, ladder, money, ownedSet } from "../util";

export function useMemberData(memberId) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    if (!memberId) return;
    try {
      const [ms, levels, orders, blends, needs, reqs] = await Promise.all([
        db.select("members"), db.select("levels"),
        db.select("orders", { eq: { member_id: memberId }, order: ["date", false] }),
        db.select("blends", { eq: { member_id: memberId }, order: ["date", false] }),
        db.select("needs", { eq: { member_id: memberId }, order: ["date", false] }),
        db.select("blend_requests", { eq: { member_id: memberId }, order: ["created_at", false] }).catch(() => []),
      ]);
      const statuses = await db.select("member_status");
      const st = Object.fromEntries(statuses.map((s) => [s.member_id, s]));
      setD({ member: ms.find((m) => m.id === memberId), members: ms, levels, orders, blends, needs, reqs, st });
    } catch (e) { setErr(e); }
  }, [memberId]);
  useEffect(() => { load(); }, [load]);
  return { d, err, reload: load };
}

export function MyAccount() {
  const { session, profile, loading } = useAuth();
  const { t } = useLang();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.role === "admin" && !profile.member_id) return <Navigate to="/admin" replace />;
  if (!profile?.member_id) return <div className="panel pad" style={{ maxWidth: 560, margin: "24px auto" }}><p style={{ margin: 0 }}>{t("not_linked")}</p></div>;
  return <MemberView memberId={profile.member_id} self />;
}

export function DownlineView() {
  const { id } = useParams();
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  return <MemberView memberId={id} key={id} />;
}

const TABS = ["overview", "my_blends", "my_orders", "my_needs", "my_team", "my_requests"];

export function MemberView({ memberId, self, admin }) {
  const { t, cv, pick } = useLang();
  const { d, err, reload } = useMemberData(memberId);
  const { profile } = useAuth();
  const [tab, setTab] = useState("overview");
  if (err) return <div className="empty">{t("load_fail")}</div>;
  if (!d) return <Loading />;
  if (!d.member) return <div className="empty">{t("forbidden")}</div>;
  const m = d.member;
  const s = d.st[m.id] || {};
  const tree = buildTree(d.members, m.id);
  const teamN = countTree(tree);
  const isMine = m.id === profile?.member_id;
  const healthVisible = admin || isMine || m.share_health_with_upline;
  const tabs = TABS.filter((x) => (x !== "my_requests" || isMine) && (x !== "my_team" || teamN > 0 || self));
  return (
    <>
      {!self && !admin && <div className="crumbs"><Link to="/me">{t("nav_member")}</Link><span>/</span><span>{cv(m.name)}</span></div>}
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "clamp(26px,4vw,36px)" }}>{self ? `${t("hello")}，${cv(m.name)}` : cv(m.name)}</h1>
        <span className="pill">{t("mt_" + (m.member_type || "wholesale"))}</span>
        {m.doterra_id && <span className="muted mono small">#{m.doterra_id}</span>}
      </div>
      <div className="tabs" role="tablist">{tabs.map((x) => <button key={x} role="tab" aria-current={tab === x} onClick={() => setTab(x)}>{t(x)}</button>)}</div>
      {tab === "overview" && <Overview d={d} m={m} s={s} teamN={teamN} />}
      {tab === "my_blends" && (healthVisible ? <Blends d={d} /> : <div className="empty">{t("health_hidden")}</div>)}
      {tab === "my_orders" && <Orders orders={d.orders} />}
      {tab === "my_needs" && (healthVisible ? <Needs d={d} m={m} canPost={isMine} reload={reload} /> : <div className="empty">{t("health_hidden")}</div>)}
      {tab === "my_team" && <Team tree={tree} st={d.st} levels={d.levels} admin={admin} />}
      {tab === "my_requests" && <Requests reqs={d.reqs} />}
      {self && <ShareToggle m={m} reload={reload} />}
    </>
  );
}

function ShareToggle({ m, reload }) {
  const { t } = useLang();
  const toast = useToast();
  const [v, setV] = useState(!!m.share_health_with_upline);
  return (
    <label className="small muted" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 32 }}>
      <input type="checkbox" id="share_h" checked={v} onChange={async (e) => { setV(e.target.checked); try { await db.rpc("set_share_health", { v: e.target.checked }); toast(t("saved")); reload(); } catch { setV(!e.target.checked); } }} />
      {t("share_health")}
    </label>
  );
}

function Stat({ k, v, warn }) { return <div className="stat"><div className="k">{k}</div><div className={`v ${warn ? "warn" : ""}`}>{v}</div></div>; }

function Ladder({ title, lad }) {
  const { t, pick } = useLang();
  if (!lad) return null;
  const unit = (u) => ({ PV: "PV", OV: "OV", legs: t("legs_u"), months: t("months"), pts: t("points") }[u] || u);
  return (
    <div className="lad">
      <div className="h"><span className="muted small">{title}</span><b>{lad.cur ? pick(lad.cur.name_zh, lad.cur.name_en) : t("none_yet")}</b></div>
      <div className="steps">{lad.levels.map((l, i) => <i key={l.code} className={i <= lad.idx ? "on" : ""} title={pick(l.name_zh, l.name_en)} />)}</div>
      {lad.next ? <>
        <div className="small"><span className="muted">{t("next")}：</span><b>{pick(lad.next.name_zh, lad.next.name_en)}</b> <span className="muted">· {pick(lad.next.note_zh, lad.next.note_en)}</span></div>
        {lad.gaps.map((g) => (
          <div className="gap" key={g.key}>
            <span className="muted">{t(g.key === "pv" ? "pv_month" : g.key === "lrp_pv" ? "lrp_pv" : g.key === "ov" ? "ov" : g.key === "legs" ? "legs" : g.key === "lrp_months" ? "lrp_months" : "points")}</span>
            <div className="gbar"><i style={{ width: `${Math.min(100, (g.have / g.need) * 100)}%` }} /></div>
            <span className="mono">{g.left > 0 ? `${t("to_go")} ${g.left.toLocaleString()} ${unit(g.unit)}` : t("met")}</span>
          </div>
        ))}
      </> : <div className="small muted">{t("reached")}</div>}
    </div>
  );
}

function Overview({ d, m, s, teamN }) {
  const { t, cv } = useLang();
  const owned = useMemo(() => {
    const map = new Map();
    for (const o of d.orders) for (const it of o.items || []) {
      const k = it.product || it.zh; const e = map.get(k) || { ...it, qty: 0, last: "" };
      e.qty += Number(it.qty) || 0; if (o.date > e.last) e.last = o.date; map.set(k, e);
    }
    return [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
  }, [d.orders]);
  const builder = m.member_type === "builder" || s.rank;
  return (
    <>
      <div className="stats">
        <Stat k={t("points")} v={Number(s.points || 0).toLocaleString()} />
        <Stat k={t("balance")} v={money(s.balance_owed || 0, s.currency || "CAD")} warn={Number(s.balance_owed) > 0} />
        <Stat k={t("pv_month")} v={Number(s.pv || 0).toLocaleString()} />
        <Stat k={t("lrp_pv")} v={Number(s.lrp_pv || 0).toLocaleString()} />
        <Stat k={t("lrp_months")} v={s.lrp_months || 0} />
        {builder && <Stat k={t("ov")} v={Number(s.ov || 0).toLocaleString()} />}
        {teamN > 0 && <Stat k={t("team_size")} v={teamN} />}
      </div>
      {(s.period || s.updated_at) && <p className="small muted">{s.period ? `${t("data_as_of")} ${s.period} · ` : ""}{s.updated_at ? `${t("updated")} ${String(s.updated_at).slice(0, 10)}` : ""}</p>}
      <div className="ladders">
        <Ladder title={t("member_level")} lad={ladder(d.levels, "member", s, s.member_level || (m.member_type === "retail" ? "retail" : s.lrp_pv >= 50 ? "lrp" : "wholesale"))} />
        <Ladder title={t("points_reward")} lad={ladder(d.levels, "reward", s)} />
        {builder && <Ladder title={t("rank")} lad={ladder(d.levels, "rank", s, s.rank)} />}
        {builder && <Ladder title={t("bonus")} lad={ladder(d.levels, "bonus", s)} />}
      </div>
      {owned.length > 0 && <div className="block"><h2>{t("owned_oils")}</h2>
        <div className="chips">{owned.map((o, i) => <OwnedChip key={i} o={o} />)}</div></div>}
    </>
  );
}
function OwnedChip({ o }) {
  const { lang, cv, t } = useLang();
  const cat = useCatalog();
  const p = o.product && cat.byId?.[o.product];
  const nm = lang === "en" ? (p?.name_en || o.en || o.zh) : cv(o.zh);
  const inner = <>{nm} ×{o.qty} <span className="muted">· {o.last}</span></>;
  return p ? <Link className="chip" to={`/oils/${p.id}`}>{inner}</Link> : <span className="chip">{inner}</span>;
}

function Blends({ d }) {
  const { t, pick, cv } = useLang();
  const owned = useMemo(() => ownedSet(d.orders), [d.orders]);
  if (!d.blends.length) return <div className="empty">{t("blends_empty")}</div>;
  return (
    <div className="rcards">{d.blends.map((b) => {
      const pct = dilutionPct(b.items, b.carrier_ml);
      return (
        <article key={b.id} className="rcard" style={{ cursor: "default" }}>
          <div className="cat mono">{b.date}</div>
          <h3>{pick(b.title, b.title_en)}</h3>
          {b.purpose && <div className="small muted">{cv(b.purpose)}</div>}
          <DropList items={b.items} owned={owned} />
          <div className="small muted">{b.carrier ? `${t("carrier")}: ${cv(b.carrier)} ` : ""}{b.carrier_ml ? `${b.carrier_ml}${b.unit || "ml"}` : ""}{pct != null ? ` · ${t("dilution")} ${pct}%` : ""}</div>
          {(b.usage || b.usage_en) && <div className="notice"><b>{t("usage")}</b> {pick(b.usage, b.usage_en)}</div>}
          {b.feedback && <div className="small"><b>{t("feedback")}</b> {cv(b.feedback)}</div>}
          {b.recipe_id && <Link className="small" to={`/recipes/${b.recipe_id}`}>{t("formula")} →</Link>}
        </article>
      );
    })}</div>
  );
}

export function Orders({ orders }) {
  const { t, cv, lang } = useLang();
  const cat = useCatalog();
  const [open, setOpen] = useState(null);
  if (!orders.length) return <div className="empty">{t("orders_empty")}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {orders.map((o) => (
        <article key={o.id} className="panel ocard">
          <button className="oh" style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }} onClick={() => setOpen(open === o.id ? null : o.id)} aria-expanded={open === o.id}>
            <b className="mono">{o.date}</b>
            <span style={{ color: "var(--pine)" }}>{cv(o.account)}</span>
            <span className="muted small">{(o.items || []).length} {t("items")}</span>
            <span className="tot">{money(o.total, o.currency)}{o.total_pv != null && <span className="muted small"> · {o.total_pv} PV</span>}</span>
          </button>
          {open === o.id && <div>
            <div className="small muted" style={{ padding: "8px 16px", display: "flex", gap: 16, flexWrap: "wrap" }}>
              {o.order_no && <span>{t("order")} #{o.order_no}</span>}
              {o.payment && <span>{t("payment")}: {cv(o.payment)}</span>}
              {o.reason && <span>{t("reason")}: {cv(o.reason)}</span>}
            </div>
            <div className="tablewrap"><table><thead><tr><th>{t("items")}</th><th className="num">{t("qty")}</th><th className="num">PV</th><th className="num">{t("price")}</th></tr></thead>
              <tbody>{(o.items || []).map((i, k) => {
                const p = i.product && cat.byId?.[i.product];
                const nm = lang === "en" ? (p?.name_en || i.en || i.zh) : cv(i.zh);
                return <tr key={k}><td>{p ? <Link to={`/oils/${p.id}`}>{nm}</Link> : nm} {i.tag && <span className="pill honey">{t("t_" + i.tag)}</span>}{i.note && <div className="small muted">{cv(i.note)}</div>}</td><td className="num">{i.qty}</td><td className="num">{i.pv ?? ""}</td><td className="num">{money(i.price, o.currency)}</td></tr>;
              })}</tbody></table></div>
          </div>}
        </article>
      ))}
    </div>
  );
}

function Needs({ d, m, canPost, reload }) {
  const { t, cv } = useLang();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const roots = d.needs.filter((n) => !n.parent_id);
  const kids = (id) => d.needs.filter((n) => n.parent_id === id).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const post = async () => {
    if (!body.trim()) return; setBusy(true);
    try { await db.insert("needs", { member_id: m.id, kind: "progress", body: body.trim(), author: "member", date: new Date().toISOString().slice(0, 10), status: "open" }); setBody(""); toast(t("saved")); reload(); }
    catch { toast(t("send_fail")); }
    setBusy(false);
  };
  return (
    <>
      {canPost && <div className="panel pad" style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <label htmlFor="np" className="small muted">{t("add_progress")}</label>
        <textarea id="np" value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("progress_ph")} />
        <button className="btn primary" style={{ alignSelf: "flex-start" }} disabled={busy || !body.trim()} onClick={post}>{t("post")}</button>
      </div>}
      {!roots.length ? <div className="empty">{t("needs_empty")}</div> :
        <div className="timeline">{roots.map((n) => (
          <div key={n.id} className={`tl ${n.author === "member" ? "member" : ""}`}>
            <div className="when">{n.date} · {t(n.kind === "need" ? "need" : "progress")} · {t(n.author === "member" ? "by_me" : "by_coach")}</div>
            {n.title && <div className="ttl">{cv(n.title)} <span className={`pill ${n.status === "resolved" ? "" : n.status === "improving" ? "sky" : "honey"}`}>{t("status_" + (n.status || "open"))}</span></div>}
            {n.body && <div>{cv(n.body)}</div>}
            {kids(n.id).map((c) => <div key={c.id} className="child"><span className="small muted">{c.date} · {t(c.author === "member" ? "by_me" : "by_coach")}</span><div>{cv(c.body)}</div></div>)}
          </div>
        ))}</div>}
    </>
  );
}

function rankName(levels, code, pick) { const l = levels.find((x) => x.kind === "rank" && x.code === code); return l ? pick(l.name_zh, l.name_en) : ""; }

function TreeNode({ node, st, levels, admin, open, toggle }) {
  const { t, cv, pick } = useLang();
  const s = st[node.m.id] || {};
  const n = countTree(node);
  const isOpen = open.has(node.m.id);
  return (
    <>
      <div className="tnode">
        {node.children.length ? <button className="toggle" onClick={() => toggle(node.m.id)} aria-expanded={isOpen} aria-label="toggle">{isOpen ? "−" : "+"}</button> : <span style={{ width: 24 }} />}
        <Link to={admin ? `/admin?m=${node.m.id}` : `/me/m/${node.m.id}`} className="who" style={{ textDecoration: "none" }}>
          <b>{cv(node.m.name)}</b>
          <span className="small muted">{rankName(levels, s.rank, pick) || t("mt_" + (node.m.member_type || "wholesale"))}{n ? ` · ${t("team_size")} ${n}` : ""}</span>
        </Link>
        <div className="nums"><span>PV <b>{Number(s.pv || 0)}</b></span><span>OV <b>{Number(s.ov || 0)}</b></span></div>
      </div>
      {isOpen && node.children.length > 0 && <div className="indent">{node.children.map((c) => <TreeNode key={c.m.id} node={c} st={st} levels={levels} admin={admin} open={open} toggle={toggle} />)}</div>}
    </>
  );
}
export function Team({ tree, st, levels, admin }) {
  const { t } = useLang();
  const [open, setOpen] = useState(() => new Set(tree ? [tree.m.id] : []));
  const toggle = (id) => setOpen((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
  if (!tree || !tree.children.length) return <div className="empty">{t("team_empty")}</div>;
  return <div className="tree"><TreeNode node={tree} st={st} levels={levels} admin={admin} open={open} toggle={toggle} /></div>;
}

function Requests({ reqs }) {
  const { t, cv } = useLang();
  if (!reqs.length) return <div className="empty">{t("needs_empty")}</div>;
  return (
    <div className="tablewrap panel"><table><thead><tr><th>{t("date")}</th><th>{t("formula")}</th><th>{t("bottle")}</th><th>{t("status")}</th></tr></thead>
      <tbody>{reqs.map((r) => <tr key={r.id}><td className="mono">{String(r.created_at).slice(0, 10)}</td><td><Link to={`/recipes/${r.recipe_id}`}>{cv(r.recipe_title)}</Link></td><td>{cv(String(r.bottle).replace(/\s*\(.*\)$/, ""))}</td><td><span className="pill honey">{t("req_" + r.status)}</span></td></tr>)}</tbody></table></div>
  );
}
