import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { useLang } from "../i18n";
import { useAuth, useCatalog, useToast } from "../ctx";
import { db, resetCatalog, memberLogins, phoneKey } from "../api";
import { Loading, Modal, useProductName } from "../components";
import { Orders, MemberView, Team, TIERS } from "./Member";
import { BookingsAdmin, ServiceHistory, StaffAdmin } from "./Service";
import { buildTree, money, today } from "../util";
import { InventoryAdmin } from "./Inventory";
import { Books } from "./Finance";
import { TeamMap, lrpRate } from "./Team";
import { PartnersAdmin } from "./Partners";
import { DropshipAdmin } from "./Dropship";

export default function Admin() {
  const { t } = useLang();
  const { isAdmin, loading, session } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") || (sp.get("m") ? "a_members" : "a_bookings");
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (!isAdmin) return <div className="empty">{t("forbidden")}</div>;
  const go = (x) => setSp({ tab: x });
  return (
    <>
      <h1 style={{ fontSize: 30 }}>{t("nav_admin")}</h1>
      <div className="tabs">{["a_bookings", "a_requests", "a_dropship", "a_tree", "a_partners", "a_inventory", "a_finance", "a_members", "a_staff", "a_import", "a_levels", "a_recipes"].map((x) => <button key={x} aria-current={tab === x} onClick={() => go(x)}>{t(x)}</button>)}</div>
      {tab === "a_bookings" && <BookingsAdmin />}
      {tab === "a_staff" && <StaffAdmin />}
      {tab === "a_requests" && <RequestsAdmin />}
      {tab === "a_members" && <MembersAdmin />}
      {tab === "a_import" && <ImportAdmin />}
      {tab === "a_levels" && <LevelsAdmin />}
      {tab === "a_recipes" && <RecipesAdmin />}
      {tab === "a_inventory" && <InventoryAdmin />}
      {tab === "a_finance" && <Books admin />}
      {tab === "a_tree" && <TeamMap admin />}
      {tab === "a_partners" && <PartnersAdmin />}
      {tab === "a_dropship" && <DropshipAdmin />}
    </>
  );
}

function useTable(table, opt) {
  const [rows, setRows] = useState(null);
  const key = JSON.stringify(opt || {});
  const load = useCallback(() => db.select(table, opt).then(setRows).catch(() => setRows([])), [table, key]); // eslint-disable-line
  useEffect(() => { load(); }, [load]);
  return [rows, load];
}

/* ---------- 配油申请 ---------- */
function RequestsAdmin() {
  const { t, cv } = useLang();
  const toast = useToast();
  const [rows, reload] = useTable("blend_requests", { order: ["created_at", false] });
  const [members] = useTable("members");
  const name = useProductName();
  if (!rows) return <Loading />;
  if (!rows.length) return <div className="empty">{t("needs_empty")}</div>;
  const mname = (id) => members?.find((m) => m.id === id)?.name;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r) => (
        <article key={r.id} className="panel pad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
            <b className="mono">{String(r.created_at).slice(0, 16).replace("T", " ")}</b>
            <span style={{ fontWeight: 600 }}>{cv(r.recipe_title)}</span>
            <span className="muted">{cv(r.bottle)}</span>
            <span style={{ marginLeft: "auto" }}>
              <select aria-label={t("status")} value={r.status} onChange={async (e) => { await db.update("blend_requests", r.id, { status: e.target.value }); toast(t("saved")); reload(); }} style={{ width: "auto" }}>
                {["new", "preparing", "ready", "done", "cancelled"].map((s) => <option key={s} value={s}>{t("req_" + s)}</option>)}
              </select>
            </span>
          </div>
          <div className="small">{r.name} · <span className="mono">{r.contact}</span>{r.member_id && <> · <Link to={`/admin?m=${r.member_id}`}>{cv(mname(r.member_id) || "member")}</Link></>}</div>
          <div className="small muted">{(r.items || []).map((i) => `${name(i)}${i.drops ? " " + i.drops : ""}`).join("、")}</div>
          {r.notes && <div className="notice">{cv(r.notes)}</div>}
        </article>
      ))}
    </div>
  );
}

/* ---------- 会员 ---------- */
function MembersAdmin() {
  const { t, cv } = useLang();
  const [sp, setSp] = useSearchParams();
  const [members, reload] = useTable("members", { order: ["name", true] });
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const sel = sp.get("m");
  if (!members) return <Loading />;
  const list = members.filter((m) => !q || [m.name, m.email, m.phone, m.doterra_id].join(" ").toLowerCase().includes(q.toLowerCase()));
  const cur = members.find((m) => m.id === sel) || null;
  return (
    <div className="admin-grid">
      <aside style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input id="am_q" type="search" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={() => setEditing({})}>+ {t("new_member")}</button>
        <BulkLogins members={members} reload={reload} />
        <div className="mlist">{list.map((m) => <button key={m.id} className="mitem" aria-current={m.id === sel} onClick={() => setSp({ tab: "a_members", m: m.id })}><b>{cv(m.name)}</b><small>{m.doterra_id || m.email || m.phone || "—"}</small></button>)}</div>
      </aside>
      <section style={{ minWidth: 0 }}>
        {cur ? <MemberAdminDetail key={cur.id} m={cur} members={members} onEdit={() => setEditing(cur)} reloadMembers={reload} /> : <div className="empty">{t("all_members")} · {members.length}</div>}
      </section>
      {editing && <MemberForm m={editing} members={members} onClose={() => setEditing(null)} onSaved={(id) => { setEditing(null); reload(); if (id) setSp({ tab: "a_members", m: id }); }} />}
    </div>
  );
}

function MemberForm({ m, members, onClose, onSaved }) {
  const { t, cv, pick } = useLang();
  const { isSuperAdmin } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ name: "", name_en: "", email: "", phone: "", doterra_id: "", sponsor_id: null, joined: today(), member_type: "wholesale", tier: "customer", accounts: [], admin_notes: "", share_health_with_upline: false, ...m });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async () => {
    if (!f.name.trim()) return;
    const row = { ...f, sponsor_id: f.sponsor_id || null, accounts: typeof f.accounts === "string" ? f.accounts.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : f.accounts };
    try {
      if (m.id) { const { id, created_at, ...patch } = row; await db.update("members", m.id, patch); toast(t("saved")); onSaved(m.id); }
      else { const r = await db.insert("members", row); toast(t("saved")); onSaved(r?.id); }
    } catch (e) { toast(e.message || "error"); }
  };
  const del = async () => { if (!window.__cd) { window.__cd = 1; toast(t("confirm_del")); setTimeout(() => (window.__cd = 0), 3000); return; } await db.remove("members", m.id); onSaved(null); };
  return (
    <Modal title={m.id ? t("edit") : t("new_member")} onClose={onClose} footer={<>{m.id && <button className="btn danger" onClick={del} style={{ marginRight: "auto" }}>{t("del")}</button>}<button className="btn" onClick={onClose}>{t("cancel")}</button><button className="btn primary" onClick={save}>{t("save")}</button></>}>
      <div className="grid2">
        <div className="field"><label htmlFor="mf_n">{t("name")}</label><input id="mf_n" type="text" value={f.name} onChange={set("name")} /></div>
        <div className="field"><label htmlFor="mf_ne">English name</label><input id="mf_ne" type="text" value={f.name_en} onChange={set("name_en")} /></div>
        <div className="field"><label htmlFor="mf_e">{t("email")}</label><input id="mf_e" type="email" value={f.email} onChange={set("email")} /></div>
        <div className="field"><label htmlFor="mf_p">{t("phone")}</label><input id="mf_p" type="tel" value={f.phone} onChange={set("phone")} /></div>
        <div className="field"><label htmlFor="mf_d">{t("doterra_id")}</label><input id="mf_d" type="text" value={f.doterra_id} onChange={set("doterra_id")} /></div>
        <div className="field"><label htmlFor="mf_j">{t("joined")}</label><input id="mf_j" type="date" value={f.joined || ""} onChange={set("joined")} /></div>
        <div className="field"><label htmlFor="mf_s">{t("sponsor")}</label><select id="mf_s" value={f.sponsor_id || ""} onChange={set("sponsor_id")}><option value="">—</option>{members.filter((x) => x.id !== m.id).map((x) => <option key={x.id} value={x.id}>{cv(x.name)}</option>)}</select></div>
        <div className="field"><label htmlFor="mf_tier">{pick("会员身份", "Member tier")}</label><select id="mf_tier" value={f.tier || "customer"} onChange={set("tier")}>{Object.entries(TIERS).filter(([k]) => k !== "super" || isSuperAdmin || f.tier === "super").map(([k, v]) => <option key={k} value={k}>{pick(...v)}</option>)}</select></div>
        <div className="field"><label htmlFor="mf_t">{t("member_type")}</label><select id="mf_t" value={f.member_type} onChange={set("member_type")}>{["retail", "wholesale", "builder"].map((x) => <option key={x} value={x}>{t("mt_" + x)}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor="mf_a">{t("account")}（, ）</label><input id="mf_a" type="text" value={Array.isArray(f.accounts) ? f.accounts.join(", ") : f.accounts} onChange={set("accounts")} /></div>
      <div className="field"><label htmlFor="mf_x">{t("admin_notes")}</label><textarea id="mf_x" value={f.admin_notes} onChange={set("admin_notes")} /></div>
      <label className="small" style={{ display: "flex", gap: 8 }}><input type="checkbox" checked={!!f.share_health_with_upline} onChange={set("share_health_with_upline")} />{t("share_health")}</label>
    </Modal>
  );
}

const LOGIN_MSG = { created: ["已开通", "Created"], reset: ["密码已重设为手机后六位", "Password reset"], exists: ["已经开通过", "Already set up"], no_phone: ["没有手机号", "No phone number"], taken: ["这个手机号已被别的帐号用了", "Phone already used"], error: ["出错", "Error"] };
function LoginBox({ m, onDone }) {
  const { pick } = useLang();
  const toast = useToast();
  const [st, setSt] = useState({ phone: m.login_phone, at: m.login_created_at });
  const [busy, setBusy] = useState(false);
  const d = phoneKey(m.phone);
  const run = async (mode) => {
    if (mode === "reset" && !window.confirm(pick(`把 ${m.name} 的密码重设回手机号后六位（${d.slice(-6)}）？`, `Reset ${m.name}'s password to the last six digits?`))) return;
    setBusy(true);
    try { const r = (await memberLogins(mode, [m.id])).results?.[0]; toast(pick(...(LOGIN_MSG[r?.status] || LOGIN_MSG.error)) + (r?.message ? `：${r.message}` : "")); if (["created", "reset", "exists"].includes(r?.status)) { setSt({ phone: r.login, at: new Date().toISOString() }); onDone && onDone(); } } catch (e) { toast(e.message); }
    setBusy(false);
  };
  return (
    <div className="login-box">
      <div><b>{pick("会员登入", "Member sign-in")}</b>
        {st.phone ? <span className="muted small">{pick(`帐号 ${st.phone}，初始密码是后六位 ${st.phone.slice(-6)}（如果会员自己改过就不是了）`, `Login ${st.phone}; first password ${st.phone.slice(-6)} unless changed`)}</span>
          : d.length >= 7 ? <span className="muted small">{pick(`还没开通。开通后帐号是 ${d}，密码是 ${d.slice(-6)}`, `Not set up. Login would be ${d}, password ${d.slice(-6)}`)}</span>
          : <span className="muted small">{pick("先在「编辑」里填上手机号，才能开通。", "Add a phone number first.")}</span>}</div>
      <div className="acts">{!st.phone ? <button className="btn primary sm" disabled={busy || d.length < 7} onClick={() => run("create")}>{pick("开通登入", "Create login")}</button> : <button className="btn sm" disabled={busy} onClick={() => run("reset")}>{pick("重设密码", "Reset password")}</button>}</div>
    </div>
  );
}
function BulkLogins({ members, reload }) {
  const { pick } = useLang();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const todo = members.filter((m) => !m.login_phone && phoneKey(m.phone).length >= 7 && m.tier !== "super");
  if (!todo.length) return null;
  const go = async () => {
    if (!window.confirm(pick(`为 ${todo.length} 位有手机号、还没开通的会员开通登入？帐号是手机号，密码是手机号后六位。`, `Create logins for ${todo.length} members?`))) return;
    setBusy(true);
    try { const r = await memberLogins("create", todo.map((m) => m.id)); const ok = (r.results || []).filter((x) => x.status === "created").length; toast(pick(`已开通 ${ok} 位`, `${ok} created`)); reload(); } catch (e) { toast(e.message); }
    setBusy(false);
  };
  return <button className="btn sm" disabled={busy} onClick={go}>{busy ? pick("开通中…", "Working…") : pick(`一键开通登入（${todo.length} 位）`, `Create logins (${todo.length})`)}</button>;
}

function MemberAdminDetail({ m, members, onEdit, reloadMembers }) {
  const { t, cv, pick } = useLang();
  const [sub, setSub] = useState("services");
  const [k, setK] = useState(0);
  const sponsor = members.find((x) => x.id === m.sponsor_id);
  return (
    <>
      <div className="panel pad" style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 24 }}>{cv(m.name)} {m.name_en && <span className="muted" style={{ fontSize: 16 }}>{m.name_en}</span>}</h2>
          <div className="small muted" style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 4 }}>
            <span>{t("mt_" + (m.member_type || "wholesale"))}</span>{m.doterra_id && <span className="mono">#{m.doterra_id}</span>}{m.email && <span>{m.email}</span>}{m.phone && <span>{m.phone}</span>}
            <span>{t("joined")} {m.joined}</span>{sponsor && <span>{t("sponsor")}: {cv(sponsor.name)}</span>}
          </div>
          {!!m.accounts?.length && <div className="chips" style={{ marginTop: 8 }}>{m.accounts.map((a) => <span key={a} className="chip">{cv(a)}</span>)}</div>}
          {m.admin_notes && <p className="notice" style={{ marginBottom: 0 }}>{cv(m.admin_notes)}</p>}
        </div>
        <button className="btn sm" onClick={onEdit}>{t("edit")}</button>
      </div>
      <LoginBox m={m} onDone={reloadMembers} />
      <div className="tabs">{["services", "status", "orders", "blends", "needs", "team", "preview"].map((x) => <button key={x} aria-current={sub === x} onClick={() => setSub(x)}>{t({ services: "my_services", status: "status_edit", orders: "my_orders", blends: "my_blends", needs: "my_needs", team: "my_team", preview: "nav_member" }[x])}</button>)}</div>
      {sub === "services" && <><p><Link className="btn primary sm" to={`/staff/c/${m.id}`}>{pick("打开服务档案 / 写新记录", "Open client file / new record")}</Link></p><ServiceHistory memberId={m.id} staffView /></>}
      {sub === "status" && <StatusEditor m={m} />}
      {sub === "orders" && <OrdersAdmin m={m} />}
      {sub === "blends" && <BlendsAdmin m={m} />}
      {sub === "needs" && <NeedsAdmin m={m} />}
      {sub === "team" && <TeamAdmin m={m} members={members} />}
      {sub === "preview" && <MemberView memberId={m.id} admin key={k} />}
    </>
  );
}

function StatusEditor({ m }) {
  const { t, pick } = useLang();
  const toast = useToast();
  const [rows] = useTable("member_status", { eq: { member_id: m.id } });
  const [levels] = useTable("levels");
  const [f, setF] = useState(null);
  useEffect(() => { if (rows) setF({ points: 0, balance_owed: 0, currency: "CAD", pv: 0, lrp_pv: 0, ov: 0, lrp_months: 0, legs: 0, member_level: "", rank: "", period: today().slice(0, 7), ...(rows[0] || {}) }); }, [rows]);
  if (!f || !levels) return <Loading />;
  const num = (k) => <div className="field"><label htmlFor={"st_" + k}>{t(k === "balance_owed" ? "balance" : k === "pv" ? "pv_month" : k)}</label><input id={"st_" + k} type="number" step="any" value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value === "" ? null : Number(e.target.value) })} /></div>;
  const save = async () => {
    try { await db.upsert("member_status", { ...f, member_id: m.id, source: "manual", updated_at: new Date().toISOString() }, "member_id"); toast(t("saved")); } catch (e) { toast(e.message); }
  };
  return (
    <div className="panel pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="grid3">{num("points")}{num("balance_owed")}
        <div className="field"><label htmlFor="st_c">{t("payment")}</label><select id="st_c" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{["CAD", "USD", "RMB"].map((c) => <option key={c}>{c}</option>)}</select></div>
        {num("pv")}{num("lrp_pv")}{num("ov")}{num("lrp_months")}{num("legs")}
        <div className="field"><label htmlFor="st_p">{t("period")}</label><input id="st_p" type="text" value={f.period || ""} onChange={(e) => setF({ ...f, period: e.target.value })} /></div>
        <div className="field"><label htmlFor="st_ml">{t("member_level")}</label><select id="st_ml" value={f.member_level || ""} onChange={(e) => setF({ ...f, member_level: e.target.value })}><option value="">—</option>{levels.filter((l) => l.kind === "member").sort((a, b) => a.sort - b.sort).map((l) => <option key={l.code} value={l.code}>{pick(l.name_zh, l.name_en)}</option>)}</select></div>
        <div className="field"><label htmlFor="st_r">{t("rank")}</label><select id="st_r" value={f.rank || ""} onChange={(e) => setF({ ...f, rank: e.target.value })}><option value="">—</option>{levels.filter((l) => l.kind === "rank").sort((a, b) => a.sort - b.sort).map((l) => <option key={l.code} value={l.code}>{pick(l.name_zh, l.name_en)}</option>)}</select></div>
      </div>
      <button className="btn primary" style={{ alignSelf: "flex-start" }} onClick={save}>{t("save")}</button>
    </div>
  );
}

/* 订单 */
function ItemRows({ items, setItems, mode }) {
  const { t, pick } = useLang();
  const cat = useCatalog();
  const opts = useMemo(() => cat.products.map((p) => ({ id: p.id, label: `${p.name_zh} · ${p.name_en}` })), [cat]);
  const up = (i, patch) => setItems(items.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  return (
    <div className="rows">
      {items.map((it, i) => (
        <div key={i} className="irow" style={{ gridTemplateColumns: mode === "order" ? "minmax(0,2fr) 60px 80px 70px 90px 28px" : "minmax(0,2fr) minmax(0,1fr) 70px 28px" }}>
          <select aria-label={t("oil")} value={it.product || ""} onChange={(e) => { const p = cat.byId[e.target.value]; up(i, mode === "order" ? { product: p?.id || null, zh: p?.name_zh || it.zh, en: p?.name_en || it.en } : { product: p?.id || null, oil: p ? p.name_zh.replace(/精油.*$|\s*\(.*$/, "") : it.oil }); }}>
            <option value="">{mode === "order" ? (it.zh || "—") : (it.oil || "—")}</option>
            {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          {mode === "order" ? <>
            <input type="number" aria-label={t("qty")} value={it.qty ?? 1} onChange={(e) => up(i, { qty: Number(e.target.value) })} />
            <input type="number" step="0.01" aria-label={t("price")} placeholder={t("price")} value={it.price ?? ""} onChange={(e) => up(i, { price: e.target.value === "" ? null : Number(e.target.value) })} />
            <input type="number" step="0.1" aria-label="PV" placeholder="PV" value={it.pv ?? ""} onChange={(e) => up(i, { pv: e.target.value === "" ? null : Number(e.target.value) })} />
            <select aria-label={t("kind")} value={it.tag || ""} onChange={(e) => up(i, { tag: e.target.value })}><option value="">—</option>{["gift", "kit", "bogo", "points", "group"].map((x) => <option key={x} value={x}>{t("t_" + x)}</option>)}</select>
          </> : <>
            <input type="text" aria-label={t("oil")} value={it.oil || ""} onChange={(e) => up(i, { oil: e.target.value })} />
            <input type="number" aria-label={t("drops")} placeholder={t("drops")} value={it.drops ?? ""} onChange={(e) => up(i, { drops: e.target.value === "" ? null : Number(e.target.value) })} />
          </>}
          <button className="x" aria-label={t("del")} onClick={() => setItems(items.filter((_, k) => k !== i))}>×</button>
        </div>
      ))}
      <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setItems([...items, {}])}>+ {t("add_row")}</button>
    </div>
  );
}

function OrderForm({ m, o, onClose, onSaved }) {
  const { t, pick } = useLang();
  const [lrpMonths, setLrpMonths] = useState(0);
  const [accts, setAccts] = useState([]);
  const [newAcct, setNewAcct] = useState("");
  useEffect(() => {
    db.select("member_status", { eq: { member_id: m.id } }).then((r) => setLrpMonths(Number(r[0]?.lrp_months || 0))).catch(() => {});
    db.select("dt_accounts", { eq: { member_id: m.id }, order: ["created_at", true] }).then((as) => {
      setAccts(as);
      setF((x) => { if (x.account_id) return x; const hit = as.find((a) => x.account && (a.label === x.account || a.member_no === x.account)) || (!o?.id && (as.find((a) => a.is_main) || as[0])); return hit ? { ...x, account_id: hit.id, account: hit.label || hit.member_no } : x; });
    }).catch(() => {});
  }, [m.id]); // eslint-disable-line
  const toast = useToast();
  const [f, setF] = useState({ date: today(), order_no: "", account: m.accounts?.[0] || "", currency: "CAD", total: null, total_pv: null, payment: "", reason: "", items: [{}], ...o });
  const set = (k, n) => (e) => setF({ ...f, [k]: n ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value });
  const save = async () => {
    let extra = {};
    if (f.account_id === "__new") {
      if (!newAcct.trim()) { toast(pick("请填新帐户的名字", "Enter the new account name")); return; }
      try { const a = await db.insert("dt_accounts", { member_id: m.id, label: newAcct.trim(), is_main: !accts.length }); extra = { account_id: a.id, account: a.label }; } catch (e) { toast(e.message); return; }
    }
    const row = { ...f, ...extra, member_id: m.id, items: f.items.filter((i) => i.zh || i.product) };
    if (row.account_id === "__new" || row.account_id === "") row.account_id = null;
    try { if (o?.id) { const { id, created_at, ...p } = row; await db.update("orders", o.id, p); } else await db.insert("orders", row); toast(t("saved")); onSaved(); } catch (e) { toast(e.message); }
  };
  return (
    <Modal title={o?.id ? t("edit") : t("add_order")} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{t("cancel")}</button><button className="btn primary" onClick={save}>{t("save")}</button></>}>
      <div className="grid3">
        <div className="field"><label htmlFor="of_d">{t("date")}</label><input id="of_d" type="date" value={f.date} onChange={set("date")} /></div>
        <div className="field"><label htmlFor="of_n">{t("order")} #</label><input id="of_n" type="text" value={f.order_no} onChange={set("order_no")} /></div>
        <div className="field"><label htmlFor="of_a">{pick("下单帐户", "Account")}</label>
          <select id="of_a" value={f.account_id || ""} onChange={(e) => { const a = accts.find((x) => x.id === e.target.value); setF({ ...f, account_id: e.target.value, account: a ? a.label || a.member_no : f.account }); }}>
            <option value="">{pick("请选择帐户…", "Choose…")}</option>
            {accts.map((a) => <option key={a.id} value={a.id}>{a.label || a.member_no}{a.member_no && a.label ? ` #${a.member_no}` : ""}{a.is_main ? pick("（主号）", " (main)") : ""}</option>)}
            <option value="__new">{pick("＋ 新帐户…", "+ New account…")}</option>
          </select>
          {f.account_id === "__new" && <input type="text" style={{ marginTop: 6 }} value={newAcct} onChange={(e) => setNewAcct(e.target.value)} placeholder={pick("帐户名字，例如 Amber Teng 小号", "Account name")} aria-label={pick("新帐户名字", "New account name")} />}
          {!f.account_id && f.account && <span className="muted small">{pick(`原来写的是「${f.account}」`, `Was “${f.account}”`)}</span>}</div>
        <div className="field"><label htmlFor="of_c">CUR</label><select id="of_c" value={f.currency} onChange={set("currency")}>{["CAD", "USD", "RMB"].map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label htmlFor="of_t">{t("total")}</label><input id="of_t" type="number" step="0.01" value={f.total ?? ""} onChange={set("total", 1)} /></div>
        <div className="field"><label htmlFor="of_p">PV</label><input id="of_p" type="number" step="0.1" value={f.total_pv ?? ""} onChange={set("total_pv", 1)} /></div>
      </div>
      <div className="of-pts">
        <label className="chk"><input type="checkbox" checked={!!f.lrp} onChange={(e) => setF({ ...f, lrp: e.target.checked })} /> {pick("这是 LRP 每月订单", "This is an LRP order")}</label>
        <div className="field"><label htmlFor="of_pe">{pick("这单获得积分", "Points earned")}</label><input id="of_pe" type="number" step="0.01" value={f.points_earned ?? ""} onChange={set("points_earned", 1)} placeholder={f.lrp && f.total_pv ? pick(`建议 ${Math.round(f.total_pv * lrpRate(lrpMonths) * 100) / 100}`, `Suggested ${Math.round(f.total_pv * lrpRate(lrpMonths) * 100) / 100}`) : ""} />
          {f.lrp && f.total_pv && f.points_earned == null ? <button type="button" className="btn ghost sm" onClick={() => setF({ ...f, points_earned: Math.round(f.total_pv * lrpRate(lrpMonths) * 100) / 100 })}>{pick(`按 ${Math.round(lrpRate(lrpMonths) * 100)}% 填入`, `Use ${Math.round(lrpRate(lrpMonths) * 100)}%`)}</button> : null}</div>
        <div className="field"><label htmlFor="of_pu">{pick("这单用掉积分", "Points redeemed")}</label><input id="of_pu" type="number" step="0.01" value={f.points_used ?? ""} onChange={set("points_used", 1)} /></div>
      </div>
      <div className="grid2">
        <div className="field"><label htmlFor="of_pay">{t("payment")}</label><input id="of_pay" type="text" value={f.payment} onChange={set("payment")} /></div>
        <div className="field"><label htmlFor="of_r">{t("reason")}</label><input id="of_r" type="text" value={f.reason} onChange={set("reason")} /></div>
      </div>
      <div className="field"><span className="lab">{t("items")}</span><ItemRows items={f.items} setItems={(items) => setF({ ...f, items })} mode="order" /></div>
    </Modal>
  );
}
function OrdersAdmin({ m }) {
  const { t, cv } = useLang();
  const toast = useToast();
  const [rows, reload] = useTable("orders", { eq: { member_id: m.id }, order: ["date", false] });
  const [ed, setEd] = useState(null);
  if (!rows) return <Loading />;
  return (
    <>
      <button className="btn primary sm" onClick={() => setEd({})} style={{ marginBottom: 12 }}>+ {t("add_order")}</button>
      <div className="tablewrap panel"><table><thead><tr><th>{t("date")}</th><th>{t("account")}</th><th>{t("items")}</th><th className="num">{t("total")}</th><th className="num">PV</th><th></th></tr></thead>
        <tbody>{rows.map((o) => <tr key={o.id}><td className="mono">{o.date}</td><td>{cv(o.account)}</td><td className="small">{(o.items || []).slice(0, 4).map((i) => cv(i.zh)).join("、")}{(o.items || []).length > 4 ? "…" : ""}</td><td className="num">{money(o.total, o.currency)}</td><td className="num">{o.total_pv ?? ""}</td>
          <td style={{ whiteSpace: "nowrap" }}><button className="btn ghost sm" onClick={() => setEd(o)}>{t("edit")}</button><button className="btn ghost sm danger" onClick={async () => { await db.remove("orders", o.id); toast(t("saved")); reload(); }}>{t("del")}</button></td></tr>)}</tbody></table></div>
      {ed && <OrderForm m={m} o={ed} onClose={() => setEd(null)} onSaved={() => { setEd(null); reload(); }} />}
    </>
  );
}

/* 配油 */
function BlendForm({ m, b, onClose, onSaved }) {
  const { t, pick } = useLang();
  const cat = useCatalog();
  const toast = useToast();
  const [f, setF] = useState({ title: "", title_en: "", date: today(), purpose: "", items: [{}, {}, {}], carrier: "", carrier_ml: 10, unit: "ml", usage: "", usage_en: "", feedback: "", recipe_id: null, ...b });
  const set = (k, n) => (e) => setF({ ...f, [k]: n ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value });
  const fromRecipe = (id) => { const r = cat.recipes.find((x) => x.id === id); if (!r) return; setF({ ...f, recipe_id: r.id, title: r.title_zh, title_en: r.title_en, items: r.items.map((i) => ({ ...i, drops: i.drops ?? r.choose?.drops ?? null })), carrier: r.carrier || "", usage: r.usage_zh, usage_en: r.usage_en }); };
  const save = async () => {
    if (!f.title.trim()) return;
    const row = { ...f, member_id: m.id, items: f.items.filter((i) => i.oil || i.product) };
    try { if (b?.id) { const { id, created_at, ...p } = row; await db.update("blends", b.id, p); } else await db.insert("blends", row); toast(t("saved")); onSaved(); } catch (e) { toast(e.message); }
  };
  return (
    <Modal title={b?.id ? t("edit") : t("add_blend")} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{t("cancel")}</button><button className="btn primary" onClick={save}>{t("save")}</button></>}>
      {!b?.id && <div className="field"><label htmlFor="bf_r">{t("from_recipe")}</label><select id="bf_r" value={f.recipe_id || ""} onChange={(e) => fromRecipe(e.target.value)}><option value="">—</option>{cat.recipes.map((r) => <option key={r.id} value={r.id}>{pick(r.title_zh, r.title_en)}</option>)}</select></div>}
      <div className="grid2">
        <div className="field"><label htmlFor="bf_t">{t("title")}</label><input id="bf_t" type="text" value={f.title} onChange={set("title")} /></div>
        <div className="field"><label htmlFor="bf_te">English</label><input id="bf_te" type="text" value={f.title_en} onChange={set("title_en")} /></div>
        <div className="field"><label htmlFor="bf_d">{t("date")}</label><input id="bf_d" type="date" value={f.date} onChange={set("date")} /></div>
        <div className="field"><label htmlFor="bf_p">{t("purpose")}</label><input id="bf_p" type="text" value={f.purpose} onChange={set("purpose")} /></div>
      </div>
      <div className="field"><span className="lab">{t("formula")}</span><ItemRows items={f.items} setItems={(items) => setF({ ...f, items })} mode="blend" /></div>
      <div className="grid3">
        <div className="field"><label htmlFor="bf_c">{t("carrier")}</label><input id="bf_c" type="text" value={f.carrier} onChange={set("carrier")} /></div>
        <div className="field"><label htmlFor="bf_ml">ml / g</label><input id="bf_ml" type="number" value={f.carrier_ml ?? ""} onChange={set("carrier_ml", 1)} /></div>
        <div className="field"><label htmlFor="bf_u">unit</label><select id="bf_u" value={f.unit} onChange={set("unit")}><option>ml</option><option>g</option></select></div>
      </div>
      <div className="field"><label htmlFor="bf_us">{t("usage")}</label><textarea id="bf_us" value={f.usage} onChange={set("usage")} /></div>
      <div className="field"><label htmlFor="bf_ue">{t("usage")} (EN)</label><textarea id="bf_ue" value={f.usage_en} onChange={set("usage_en")} /></div>
      <div className="field"><label htmlFor="bf_f">{t("feedback")}</label><textarea id="bf_f" value={f.feedback} onChange={set("feedback")} /></div>
    </Modal>
  );
}
function BlendsAdmin({ m }) {
  const { t, pick } = useLang();
  const toast = useToast();
  const [rows, reload] = useTable("blends", { eq: { member_id: m.id }, order: ["date", false] });
  const [ed, setEd] = useState(null);
  const name = useProductName();
  if (!rows) return <Loading />;
  return (
    <>
      <button className="btn primary sm" onClick={() => setEd({})} style={{ marginBottom: 12 }}>+ {t("add_blend")}</button>
      {!rows.length ? <div className="empty">{t("blends_empty")}</div> :
        <div className="tablewrap panel"><table><thead><tr><th>{t("date")}</th><th>{t("title")}</th><th>{t("formula")}</th><th></th></tr></thead>
          <tbody>{rows.map((b) => <tr key={b.id}><td className="mono">{b.date}</td><td>{pick(b.title, b.title_en)}</td><td className="small">{(b.items || []).map((i) => `${name(i)} ${i.drops ?? ""}`).join("、")}</td>
            <td style={{ whiteSpace: "nowrap" }}><button className="btn ghost sm" onClick={() => setEd(b)}>{t("edit")}</button><button className="btn ghost sm danger" onClick={async () => { await db.remove("blends", b.id); toast(t("saved")); reload(); }}>{t("del")}</button></td></tr>)}</tbody></table></div>}
      {ed && <BlendForm m={m} b={ed} onClose={() => setEd(null)} onSaved={() => { setEd(null); reload(); }} />}
    </>
  );
}

/* 需求与进度 */
function NeedsAdmin({ m }) {
  const { t, cv, pick } = useLang();
  const cat = useCatalog();
  const toast = useToast();
  const [rows, reload] = useTable("needs", { eq: { member_id: m.id }, order: ["date", false] });
  const [f, setF] = useState({ kind: "need", title: "", body: "", status: "open", parent_id: "", pain_tags: [], date: today() });
  if (!rows) return <Loading />;
  const roots = rows.filter((n) => !n.parent_id);
  const add = async () => {
    if (!f.title.trim() && !f.body.trim()) return;
    try { await db.insert("needs", { ...f, parent_id: f.parent_id || null, member_id: m.id, author: "admin" }); setF({ ...f, title: "", body: "" }); toast(t("saved")); reload(); } catch (e) { toast(e.message); }
  };
  return (
    <>
      <div className="panel pad" style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
        <div className="grid3">
          <div className="field"><label htmlFor="nf_k">{t("kind")}</label><select id="nf_k" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="need">{t("need")}</option><option value="progress">{t("progress")}</option></select></div>
          <div className="field"><label htmlFor="nf_p">↳</label><select id="nf_p" value={f.parent_id} onChange={(e) => setF({ ...f, parent_id: e.target.value })}><option value="">—</option>{roots.map((n) => <option key={n.id} value={n.id}>{cv(n.title || n.body).slice(0, 30)}</option>)}</select></div>
          <div className="field"><label htmlFor="nf_d">{t("date")}</label><input id="nf_d" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="nf_t">{t("title")}</label><input id="nf_t" type="text" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="field"><label htmlFor="nf_b">{t("body")}</label><textarea id="nf_b" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
        <div className="field"><span className="lab">{t("feelings")}</span><div className="chips">{cat.pains.map((p) => <button key={p.id} type="button" className="chip" aria-pressed={f.pain_tags.includes(p.id)} onClick={() => setF({ ...f, pain_tags: f.pain_tags.includes(p.id) ? f.pain_tags.filter((x) => x !== p.id) : [...f.pain_tags, p.id] })}>{pick(p.zh, p.en)}</button>)}</div></div>
        <button className="btn primary" style={{ alignSelf: "flex-start" }} onClick={add}>{t("add")}</button>
      </div>
      {!rows.length ? <div className="empty">{t("needs_empty")}</div> :
        <div className="tablewrap panel"><table><thead><tr><th>{t("date")}</th><th>{t("kind")}</th><th>{t("body")}</th><th>{t("status")}</th><th></th></tr></thead>
          <tbody>{rows.map((n) => <tr key={n.id}><td className="mono">{n.date}</td><td>{t(n.kind === "need" ? "need" : "progress")}{n.parent_id ? " ↳" : ""}<div className="small muted">{t(n.author === "member" ? "by_me" : "by_coach")}</div></td><td><b>{cv(n.title)}</b> {cv(n.body)}</td>
            <td><select aria-label={t("status")} value={n.status} onChange={async (e) => { await db.update("needs", n.id, { status: e.target.value }); reload(); }} style={{ width: "auto" }}>{["open", "improving", "resolved"].map((s) => <option key={s} value={s}>{t("status_" + s)}</option>)}</select></td>
            <td><button className="btn ghost sm danger" onClick={async () => { await db.remove("needs", n.id); reload(); }}>{t("del")}</button></td></tr>)}</tbody></table></div>}
    </>
  );
}

function TeamAdmin({ m, members }) {
  const [st] = useTable("member_status");
  const [levels] = useTable("levels");
  if (!st || !levels) return <Loading />;
  return <Team tree={buildTree(members, m.id)} st={Object.fromEntries(st.map((s) => [s.member_id, s]))} levels={levels} admin />;
}

/* ---------- 导入报表 ---------- */
const FIELDS = ["doterra_id", "name", "points", "balance_owed", "pv", "lrp_pv", "ov", "lrp_months", "legs", "rank", "member_level", "period"];
const GUESS = { doterra_id: /id|会员号|编号|account/i, name: /name|姓名|名字/i, points: /point|积分/i, balance_owed: /balance|欠|owed/i, pv: /^pv$|personal|个人/i, lrp_pv: /lrp/i, ov: /^ov$|organi|组织/i, lrp_months: /month|月数/i, legs: /leg|线/i, rank: /rank|等级|阶级/i, member_level: /level|会员等级/i, period: /period|月份|date/i };
function ImportAdmin() {
  const { t, cv, pick } = useLang();
  const toast = useToast();
  const [members] = useTable("members");
  const [levels] = useTable("levels");
  const [sheet, setSheet] = useState(null);
  const [map, setMap] = useState({});
  const [period, setPeriod] = useState(today().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const onFile = async (file) => {
    const wb = XLSX.read(await file.arrayBuffer());
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    const headers = Object.keys(rows[0] || {});
    const m = {}; for (const f of FIELDS) { const h = headers.find((x) => GUESS[f].test(x) && !Object.values(m).includes(x)); if (h) m[f] = h; }
    setMap(m); setSheet({ headers, rows });
  };
  const resolve = (r) => {
    const id = map.doterra_id && String(r[map.doterra_id]).trim();
    const nm = map.name && String(r[map.name]).trim();
    return members.find((m) => (id && m.doterra_id === id) || (!id && nm && m.name === nm)) || (nm ? members.find((m) => m.name === nm) : null);
  };
  const rankCode = (v) => { const s = String(v || "").trim().toLowerCase(); if (!s) return undefined; const l = levels.find((l) => l.kind === "rank" && [l.code, l.name_zh, l.name_en.toLowerCase()].includes(s)); return l ? l.code : s; };
  const go = async () => {
    setBusy(true); let n = 0;
    const out = [];
    for (const r of sheet.rows) {
      const m = resolve(r); if (!m) continue;
      const row = { member_id: m.id, period: (map.period && r[map.period]) || period, source: "import", updated_at: new Date().toISOString() };
      for (const f of ["points", "balance_owed", "pv", "lrp_pv", "ov", "lrp_months", "legs"]) if (map[f] && r[map[f]] !== "") row[f] = Number(String(r[map[f]]).replace(/[^0-9.\-]/g, "")) || 0;
      if (map.rank) row.rank = rankCode(r[map.rank]);
      if (map.member_level) row.member_level = String(r[map.member_level]).trim();
      out.push(row); n++;
    }
    try { await db.upsert("member_status", out, "member_id"); toast(`${t("imported")} ${n}`); } catch (e) { toast(e.message); }
    setBusy(false);
  };
  if (!members || !levels) return <Loading />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p className="muted" style={{ margin: 0, maxWidth: "70ch" }}>{t("import_sub")}</p>
      <input type="file" id="imp_f" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
      {sheet && <>
        <div className="panel pad">
          <h3 style={{ fontSize: 17, marginBottom: 12 }}>{t("map_cols")}</h3>
          <div className="grid3">{FIELDS.map((f) => <div className="field" key={f}><label htmlFor={"mp_" + f}>{f}</label><select id={"mp_" + f} value={map[f] || ""} onChange={(e) => setMap({ ...map, [f]: e.target.value || undefined })}><option value="">{t("ignore")}</option>{sheet.headers.map((h) => <option key={h} value={h}>{h}</option>)}</select></div>)}
            <div className="field"><label htmlFor="mp_per">{t("period")}</label><input id="mp_per" type="text" value={period} onChange={(e) => setPeriod(e.target.value)} /></div></div>
        </div>
        <div className="tablewrap panel"><table><thead><tr><th>{t("preview_rows")}</th>{FIELDS.filter((f) => map[f]).map((f) => <th key={f}>{f}</th>)}</tr></thead>
          <tbody>{sheet.rows.slice(0, 15).map((r, i) => { const m = resolve(r); return <tr key={i}><td>{m ? cv(m.name) : <span style={{ color: "var(--rose)" }}>{t("unmatched")}</span>}</td>{FIELDS.filter((f) => map[f]).map((f) => <td key={f} className="small">{String(r[map[f]])}</td>)}</tr>; })}</tbody></table></div>
        <button className="btn primary" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={go}>{t("do_import")} ({sheet.rows.filter(resolve).length})</button>
      </>}
    </div>
  );
}

/* ---------- 等级规则 ---------- */
function LevelsAdmin() {
  const { t } = useLang();
  const toast = useToast();
  const [rows, reload] = useTable("levels");
  const [edit, setEdit] = useState({});
  if (!rows) return <Loading />;
  const kinds = ["member", "reward", "rank", "bonus"];
  const cols = ["name_zh", "name_en", "req_pv", "req_lrp_pv", "req_ov", "req_legs", "req_lrp_months", "note_zh"];
  const val = (l, c) => (edit[l.id]?.[c] !== undefined ? edit[l.id][c] : l[c] ?? "");
  const save = async (l) => {
    const p = { ...edit[l.id] }; for (const c of ["req_pv", "req_lrp_pv", "req_ov", "req_legs", "req_lrp_months"]) if (c in p) p[c] = p[c] === "" ? null : Number(p[c]);
    try { await db.update("levels", l.id, p); toast(t("saved")); setEdit({ ...edit, [l.id]: undefined }); reload(); } catch (e) { toast(e.message); }
  };
  return (
    <>
      <p className="notice honey">{t("levels_note")}</p>
      {kinds.map((k) => (
        <div key={k} className="block">
          <h2>{t({ member: "member_level", reward: "points_reward", rank: "rank", bonus: "bonus" }[k])}</h2>
          <div className="tablewrap panel"><table><thead><tr>{cols.map((c) => <th key={c}>{c.replace("req_", "")}</th>)}<th></th></tr></thead>
            <tbody>{rows.filter((l) => l.kind === k).sort((a, b) => a.sort - b.sort).map((l) => <tr key={l.id}>{cols.map((c) => <td key={c}><input type="text" aria-label={c} style={{ minWidth: c.startsWith("req") ? 70 : 120, padding: "5px 8px" }} value={val(l, c)} onChange={(e) => setEdit({ ...edit, [l.id]: { ...(edit[l.id] || {}), [c]: e.target.value } })} /></td>)}
              <td>{edit[l.id] && <button className="btn primary sm" onClick={() => save(l)}>{t("save")}</button>}</td></tr>)}</tbody></table></div>
        </div>
      ))}
    </>
  );
}

/* ---------- 配方管理 ---------- */
function RecipesAdmin() {
  const { t, pick, cv } = useLang();
  const toast = useToast();
  const [trows, reload] = useTable("recipes");
  const [orig] = useTable("recipe_originals");
  const [base, setBase] = useState(null);
  useEffect(() => { import("../data/catalog.json").then((m) => setBase(m.default.recipes)); }, []);
  const rows = useMemo(() => {
    if (!trows || !base) return null;
    const t = new Map(trows.map((r) => [r.id, r]));
    const out = base.map((r) => t.get(r.id) || { id: r.id, data: r, hidden: false, _base: true });
    for (const r of trows) if (!base.find((b) => b.id === r.id)) out.push(r);
    return out;
  }, [trows, base]);
  const [q, setQ] = useState("");
  const [ed, setEd] = useState(null);
  if (!rows) return <Loading />;
  const o = Object.fromEntries((orig || []).map((x) => [x.id, x]));
  const list = rows.filter((r) => !q || JSON.stringify(r.data).includes(q) || o[r.id]?.title_orig?.includes(q));
  return (
    <>
      <input id="ra_q" type="search" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360, marginBottom: 12 }} />
      <div className="tablewrap panel"><table><thead><tr><th>{t("title")}</th><th>{t("original_title")}</th><th>{t("tags")}</th><th>{t("hidden")}</th><th></th></tr></thead>
        <tbody>{list.map((r) => <tr key={r.id}><td>{pick(r.data.title_zh, r.data.title_en)}{r.data.review && <div><span className="pill rose">{t("review_flag")}</span></div>}</td><td className="small muted">{o[r.id]?.title_orig || ""}</td><td className="small">{(r.data.flags || []).map((f) => t("flag_" + f)).join("、")}</td>
          <td><input type="checkbox" aria-label={t("hidden")} checked={!!r.hidden} onChange={async (e) => { await db.upsert("recipes", { id: r.id, data: r.data, hidden: e.target.checked, updated_at: new Date().toISOString() }); resetCatalog(); reload(); toast(t("saved")); }} /></td>
          <td><button className="btn ghost sm" onClick={() => setEd(r)}>{t("edit")}</button></td></tr>)}</tbody></table></div>
      {ed && <RecipeEdit r={ed} onClose={() => setEd(null)} onSaved={() => { setEd(null); resetCatalog(); reload(); }} />}
    </>
  );
}
function RecipeEdit({ r, onClose, onSaved }) {
  const { t } = useLang();
  const toast = useToast();
  const [f, setF] = useState(r.data);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => { try { await db.upsert("recipes", { id: r.id, data: f, hidden: !!r.hidden, updated_at: new Date().toISOString() }); toast(t("saved")); onSaved(); } catch (e) { toast(e.message); } };
  return (
    <Modal title={t("edit")} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{t("cancel")}</button><button className="btn primary" onClick={save}>{t("save")}</button></>}>
      <div className="grid2">
        <div className="field"><label htmlFor="re_t">{t("title")}</label><input id="re_t" type="text" value={f.title_zh} onChange={set("title_zh")} /></div>
        <div className="field"><label htmlFor="re_te">English</label><input id="re_te" type="text" value={f.title_en} onChange={set("title_en")} /></div>
      </div>
      <div className="field"><span className="lab">{t("formula")}</span><ItemRows items={f.items} setItems={(items) => setF({ ...f, items })} mode="blend" /></div>
      <div className="field"><label htmlFor="re_c">{t("carrier")}</label><input id="re_c" type="text" value={f.carrier || ""} onChange={set("carrier")} /></div>
      <div className="field"><label htmlFor="re_u">{t("usage")}</label><textarea id="re_u" value={f.usage_zh} onChange={set("usage_zh")} /></div>
      <div className="field"><label htmlFor="re_ue">{t("usage")} (EN)</label><textarea id="re_ue" value={f.usage_en} onChange={set("usage_en")} /></div>
    </Modal>
  );
}
