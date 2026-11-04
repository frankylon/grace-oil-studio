// 预约、芳疗师工作台、客人服务档案（像医生的病历：每次服务一份记录，任何芳疗师都能看到上一次做了什么）
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useLang } from "../i18n";
import { useAuth, useCatalog, useToast } from "../ctx";
import { db } from "../api";
import { Loading, useProductName } from "../components";

export const SLOTS = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00"];
const NEEDS = [["肩颈紧", "Tight shoulders"], ["腰背酸", "Sore back"], ["睡不好", "Poor sleep"], ["压力大", "Stress"], ["手脚冷", "Cold hands & feet"], ["经期不适", "Period comfort"], ["肠胃不适", "Tummy"], ["肌肤", "Skin"]];
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const BK_STATUS = { new: ["待确认", "New"], confirmed: ["已确认", "Confirmed"], done: ["已完成", "Done"], cancelled: ["已取消", "Cancelled"] };
const KIND = { home: ["上门服务", "Home visit"], studio: ["到工作室", "At the studio"] };

function useStaffList() {
  const [list, setList] = useState([]);
  useEffect(() => { db.select("staff", { order: ["created_at", true] }).then(setList).catch(() => setList([])); }, []);
  return list;
}

/* ================= 客人预约 ================= */
export function BookPage() {
  const { pick } = useLang();
  const { member, profile, session } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ kind: "studio", date: "", slot: "", address: "", needs: [], need: "", name: "", contact: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { setF((x) => ({ ...x, name: x.name || member?.name || "", contact: x.contact || member?.phone || member?.email || session?.user?.email || "" })); }, [member, session]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const ok = f.date && f.slot && f.name.trim() && f.contact.trim() && (f.kind === "studio" || f.address.trim());
  const submit = async (e) => {
    e.preventDefault(); if (!ok) return; setBusy(true);
    try {
      await db.insert("bookings", {
        member_id: profile?.member_id || null, name: f.name.trim(), contact: f.contact.trim(), kind: f.kind,
        address: f.kind === "home" ? f.address.trim() : "", date: f.date, slot: f.slot,
        need: [f.needs.join("、"), f.need.trim()].filter(Boolean).join("；"), status: "new",
      });
      setDone(true);
    } catch { toast(pick("提交失败，请稍后再试", "Couldn't send, please try again")); }
    setBusy(false);
  };
  if (done) return (
    <div className="svc-narrow"><h1 className="page-title">{pick("预约已收到", "Booking received")}</h1>
      <p>{pick(`我们会尽快联系你确认 ${f.date} ${f.slot} 的${pick(...KIND[f.kind])}，并安排芳疗师。`, `We'll contact you to confirm ${f.date} at ${f.slot} and assign a therapist.`)}</p>
      <p style={{ marginTop: 20 }}><Link className="btn" to="/">{pick("回首页", "Back home")}</Link></p></div>
  );
  return (
    <form className="svc-narrow" onSubmit={submit}>
      <h1 className="page-title">{pick("预约芳疗服务", "Book a session")}</h1>
      <p className="muted" style={{ marginBottom: 28 }}>{pick("芳疗师可以上门，也可以来工作室。选好时间，我们确认后安排芳疗师。", "A therapist can come to you, or you can visit the studio. Pick a time and we'll confirm and assign a therapist.")}</p>
      <div className="svc-form">
        <div className="field"><span className="lab">{pick("服务方式", "Where")}</span>
          <div className="seg2">{Object.entries(KIND).map(([k, v]) => <button type="button" key={k} aria-pressed={f.kind === k} onClick={() => set("kind", k)}>{pick(...v)}</button>)}</div></div>
        {f.kind === "home" && <div className="field"><label htmlFor="bk_a">{pick("上门地址", "Address")}</label><input id="bk_a" type="text" value={f.address} onChange={(e) => set("address", e.target.value)} placeholder={pick("街道、城市", "Street, city")} /></div>}
        <div className="field"><label htmlFor="bk_d">{pick("日期", "Date")}</label><input id="bk_d" type="date" min={today()} value={f.date} onChange={(e) => set("date", e.target.value)} /></div>
        <div className="field"><span className="lab">{pick("时间", "Time")}</span>
          <div className="seg2 wrap">{SLOTS.map((s) => <button type="button" key={s} aria-pressed={f.slot === s} onClick={() => set("slot", s)}>{s}</button>)}</div></div>
        <div className="field"><span className="lab">{pick("想改善的（可多选）", "What would you like help with")}</span>
          <div className="seg2 wrap">{NEEDS.map(([zh, en]) => <button type="button" key={zh} aria-pressed={f.needs.includes(zh)} onClick={() => set("needs", f.needs.includes(zh) ? f.needs.filter((x) => x !== zh) : [...f.needs, zh])}>{pick(zh, en)}</button>)}</div></div>
        <div className="field"><label htmlFor="bk_n">{pick("补充说明（多久了、过敏、怕不怕力）", "Anything else (how long, allergies, pressure)")}</label><textarea id="bk_n" value={f.need} onChange={(e) => set("need", e.target.value)} /></div>
        <div className="grid2">
          <div className="field"><label htmlFor="bk_nm">{pick("名字", "Name")}</label><input id="bk_nm" type="text" value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="field"><label htmlFor="bk_c">{pick("微信 / 电话 / 电邮", "WeChat / phone / email")}</label><input id="bk_c" type="text" value={f.contact} onChange={(e) => set("contact", e.target.value)} /></div>
        </div>
        <button className="btn primary" disabled={busy || !ok}>{pick("提交预约", "Request booking")}</button>
      </div>
    </form>
  );
}

/* ================= 服务记录时间线（客人、芳疗师、管理员共用） ================= */
export function useServiceHistory(memberId) {
  const [recs, setRecs] = useState(null);
  const load = useCallback(async () => {
    if (!memberId) return;
    try { setRecs(await db.select("service_records", { eq: { member_id: memberId }, order: ["date", false] })); } catch { setRecs([]); }
  }, [memberId]);
  useEffect(() => { load(); }, [load]);
  return { recs, reload: load };
}

function OilLine({ oils }) {
  const name = useProductName();
  const { pick } = useLang();
  if (!oils?.length) return null;
  return <span>{oils.map((o) => `${o.product ? name(o) : o.oil}${o.drops ? ` ${o.drops}${pick("滴", " drops")}` : ""}${o.note ? `（${o.note}）` : ""}`).join("、")}</span>;
}

export function RecordCard({ r, staff, staffView, open: open0 }) {
  const { pick, cv } = useLang();
  const [open, setOpen] = useState(!!open0);
  const th = staff.find((s) => s.id === r.therapist_id) || (r.therapist_name ? { name: r.therapist_name } : null);
  const rows = [["concern", "你提到的状况", "What you told us"], ["observation", "芳疗师观察", "What we noticed"], ["treatment", "这次的处理", "What we did"], ["advice", "居家建议", "At home"], ["followup", "下次跟进", "Next time"]];
  return (
    <article className={`svc-rec ${r.status === "draft" ? "draft" : ""}`}>
      <button type="button" className="svc-rec-h" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="d">{r.date}</span>
        <span className="t">{cv(r.concern?.slice(0, 40) || pick("服务记录", "Session"))}{r.concern?.length > 40 ? "…" : ""}</span>
        <span className="m">{pick(...(KIND[r.kind] || KIND.studio))}{th ? ` · ${cv(th.name)}` : ""}{r.status === "draft" ? ` · ${pick("草稿", "Draft")}` : ""}</span>
      </button>
      {open && <div className="svc-rec-b">
        {r.report?.trim() ? <p className="svc-report">{cv(r.report)}</p> : <dl>
          {rows.map(([k, zh, en]) => r[k]?.trim() ? <div key={k}><dt>{pick(zh, en)}</dt><dd>{cv(r[k])}</dd></div> : null)}
          {r.oils?.length > 0 && <div><dt>{pick("使用的精油", "Oils used")}</dt><dd><OilLine oils={r.oils} /></dd></div>}
        </dl>}
        {staffView && <p style={{ marginTop: 14 }}><Link className="link small" to={`/staff/r/${r.id}`}>{pick("打开这份记录", "Open record")}</Link></p>}
      </div>}
    </article>
  );
}

export function ServiceHistory({ memberId, staffView }) {
  const { pick } = useLang();
  const { recs } = useServiceHistory(memberId);
  const staff = useStaffList();
  if (!recs) return <Loading />;
  if (!recs.length) return <div className="empty">{pick("还没有服务记录。", "No sessions yet.")}</div>;
  return <div className="svc-list">{recs.map((r, i) => <RecordCard key={r.id} r={r} staff={staff} staffView={staffView} open={i === 0} />)}</div>;
}

export function MyBookings({ memberId }) {
  const { pick } = useLang();
  const [list, setList] = useState(null);
  useEffect(() => { db.select("bookings", { eq: { member_id: memberId }, order: ["date", false] }).then(setList).catch(() => setList([])); }, [memberId]);
  if (!list) return <Loading />;
  return (
    <div className="svc-list">
      <p><Link className="btn primary" to="/book">{pick("预约新服务", "Book a session")}</Link></p>
      {!list.length ? <div className="empty">{pick("还没有预约。", "No bookings yet.")}</div> :
        list.map((b) => <div key={b.id} className="svc-bk"><b>{b.date} {b.slot}</b><span>{pick(...(KIND[b.kind] || KIND.studio))}</span><span className="muted">{b.need}</span><span className="pill">{pick(...(BK_STATUS[b.status] || BK_STATUS.new))}</span></div>)}
    </div>
  );
}

/* ================= 芳疗师工作台 ================= */
function StaffGate({ children }) {
  const { session, isStaff, loading } = useAuth();
  const { pick } = useLang();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (!isStaff) return <div className="empty">{pick("这个页面只有芳疗师和管理员可以用。", "Only therapists and admins can use this page.")}</div>;
  return children;
}

export function StaffHome() { return <StaffGate><StaffHomeIn /></StaffGate>; }
function StaffHomeIn() {
  const { pick, cv } = useLang();
  const { staffId, isAdmin } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const staff = useStaffList();
  const [tab, setTab] = useState("bk");
  const [bks, setBks] = useState(null);
  const [members, setMembers] = useState([]);
  const [q, setQ] = useState("");
  const load = useCallback(async () => {
    const [b, m] = await Promise.all([db.select("bookings", { order: ["date", true] }).catch(() => []), db.select("members", { order: ["name", true] }).catch(() => [])]);
    setBks(b); setMembers(m);
  }, []);
  useEffect(() => { load(); }, [load]);
  const mine = (bks || []).filter((b) => b.status !== "cancelled" && b.status !== "done" && (isAdmin || b.therapist_id === staffId));
  const me = staff.find((s) => s.id === staffId);
  const start = async (b) => {
    try {
      let mid = b.member_id;
      if (!mid) {
        const m = await db.insert("members", { name: b.name || pick("新客人", "New client"), phone: b.contact || "", member_type: "retail", joined: today(), admin_notes: pick("由预约建立", "Created from a booking") });
        mid = m.id;
        await db.update("bookings", b.id, { member_id: mid });
      }
      const r = await db.insert("service_records", { member_id: mid, booking_id: b.id, therapist_id: b.therapist_id || staffId, date: b.date || today(), kind: b.kind, concern: b.need || "", status: "draft" });
      nav(`/staff/r/${r.id}`);
    } catch (e) { toast(pick("开不了记录：", "Couldn't start: ") + (e.message || "")); }
  };
  const ms = members.filter((m) => !q || [m.name, m.name_en, m.phone, m.email, m.doterra_id].some((x) => String(x || "").toLowerCase().includes(q.toLowerCase())));
  if (!bks) return <Loading />;
  return (
    <>
      <h1 className="page-title">{pick("工作台", "Workspace")}{me ? ` · ${cv(me.name)}` : ""}</h1>
      <div className="tabs">{[["bk", pick("我的预约", "My bookings")], ["cl", pick("客人档案", "Clients")]].map(([k, l]) => <button key={k} aria-current={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "bk" && (!mine.length ? <div className="empty">{pick("暂时没有分配给你的预约。", "No bookings assigned to you yet.")}</div> :
        <div className="svc-list">{mine.map((b) => { const th = staff.find((s) => s.id === b.therapist_id); return (
          <div key={b.id} className="svc-bk">
            <b>{b.date} {b.slot}</b>
            <span>{pick(...(KIND[b.kind] || KIND.studio))}{b.address ? ` · ${b.address}` : ""}</span>
            <span>{cv(b.name)} <span className="muted">{b.contact}</span></span>
            <span className="muted">{cv(b.need)}</span>
            <span className="pill">{pick(...(BK_STATUS[b.status] || BK_STATUS.new))}{th ? ` · ${cv(th.name)}` : ""}</span>
            <span className="acts">
              {b.member_id && <Link className="btn sm" to={`/staff/c/${b.member_id}`}>{pick("看档案", "Client file")}</Link>}
              <button className="btn primary sm" onClick={() => start(b)}>{pick("开始服务记录", "Start record")}</button>
            </span>
          </div>); })}</div>)}
      {tab === "cl" && <>
        <input type="search" placeholder={pick("搜索名字、电话、电邮", "Search name, phone, email")} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 420, marginBottom: 16 }} />
        <div className="svc-list">{ms.map((m) => <Link key={m.id} className="svc-bk link-row" to={`/staff/c/${m.id}`}><b>{cv(m.name)}</b><span className="muted">{m.phone || m.email}</span><span className="muted">{m.doterra_id ? `#${m.doterra_id}` : ""}</span></Link>)}</div>
      </>}
    </>
  );
}

export function ClientChart() { return <StaffGate><ClientChartIn /></StaffGate>; }
function ClientChartIn() {
  const { id } = useParams();
  const { pick, cv } = useLang();
  const { staffId } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [m, setM] = useState(null);
  const [extra, setExtra] = useState({ blends: [], needs: [] });
  useEffect(() => {
    db.select("members", { eq: { id } }).then((x) => setM(x[0] || false)).catch(() => setM(false));
    Promise.all([db.select("blends", { eq: { member_id: id }, order: ["date", false] }).catch(() => []), db.select("needs", { eq: { member_id: id }, order: ["date", false] }).catch(() => [])]).then(([blends, needs]) => setExtra({ blends, needs }));
  }, [id]);
  const create = async () => {
    try { const r = await db.insert("service_records", { member_id: id, therapist_id: staffId, date: today(), kind: "studio", status: "draft" }); nav(`/staff/r/${r.id}`); }
    catch (e) { toast(e.message || "error"); }
  };
  if (m === null) return <Loading />;
  if (!m) return <div className="empty">{pick("找不到这位客人。", "Client not found.")}</div>;
  const openNeeds = extra.needs.filter((n) => n.kind === "need" && n.status !== "resolved");
  return (
    <>
      <div className="crumbs"><Link to="/staff">{pick("工作台", "Workspace")}</Link><span>/</span><span>{cv(m.name)}</span></div>
      <div className="svc-head">
        <div><h1 className="page-title">{cv(m.name)}</h1><p className="muted">{[m.phone, m.email, m.doterra_id && `#${m.doterra_id}`].filter(Boolean).join(" · ")}</p></div>
        <button className="btn primary" onClick={create}>{pick("新服务记录", "New session record")}</button>
      </div>
      <div className="svc-two">
        <section><h2 className="svc-h2">{pick("历次服务", "Session history")}</h2><ServiceHistory memberId={id} staffView /></section>
        <aside>
          {m.admin_notes && <div className="svc-side"><h3>{pick("内部备注", "Internal notes")}</h3><p>{cv(m.admin_notes)}</p></div>}
          <div className="svc-side"><h3>{pick("目前的需要", "Open needs")}</h3>{openNeeds.length ? openNeeds.map((n) => <p key={n.id}>{cv(n.title || n.body || "")}</p>) : <p className="muted">{pick("没有记录", "None recorded")}</p>}</div>
          <div className="svc-side"><h3>{pick("以往配油", "Past blends")}</h3>{extra.blends.length ? extra.blends.slice(0, 6).map((b) => <p key={b.id}><span className="muted">{b.date}</span> {cv(b.title || "")}</p>) : <p className="muted">{pick("没有记录", "None recorded")}</p>}</div>
        </aside>
      </div>
    </>
  );
}

/* 语音转文字：用浏览器自带的听写（Chrome / Safari / 手机都支持） */
function useDictation(onText) {
  const rec = useRef(null);
  const [on, setOn] = useState(false);
  const Ctor = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const start = (lang) => {
    if (!Ctor) return false;
    const r = new Ctor(); r.lang = lang; r.continuous = true; r.interimResults = false;
    r.onresult = (e) => { let s = ""; for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) s += e.results[i][0].transcript; if (s) onText(s); };
    r.onend = () => setOn(false); r.onerror = () => setOn(false);
    r.start(); rec.current = r; setOn(true); return true;
  };
  const stop = () => { rec.current?.stop(); setOn(false); };
  return { supported: !!Ctor, on, start, stop };
}

export function RecordEditor() { return <StaffGate><RecordEditorIn /></StaffGate>; }
function RecordEditorIn() {
  const { id } = useParams();
  const { pick, cv } = useLang();
  const { staffId, isAdmin, profile } = useAuth();
  const cat = useCatalog();
  const pname = useProductName();
  const toast = useToast();
  const staff = useStaffList();
  const [r, setR] = useState(null);
  const [m, setM] = useState(null);
  const [prev, setPrev] = useState(null);
  const [notes, setNotes] = useState([]);
  const [note, setNote] = useState("");
  const [lang, setLang] = useState("zh-CN");
  const [dirty, setDirty] = useState(false);
  const [oilQ, setOilQ] = useState("");
  const dict = useDictation((s) => setNote((x) => (x ? x + " " : "") + s));
  useEffect(() => {
    (async () => {
      const rs = await db.select("service_records", { eq: { id } }).catch(() => []);
      const rec = rs[0]; if (!rec) { setR(false); return; }
      setR(rec);
      const [ms, all, ns] = await Promise.all([db.select("members", { eq: { id: rec.member_id } }), db.select("service_records", { eq: { member_id: rec.member_id }, order: ["date", false] }), db.select("service_notes", { eq: { record_id: id }, order: ["created_at", true] })]);
      setM(ms[0]); setNotes(ns);
      setPrev(all.filter((x) => x.id !== id && (x.date < rec.date || (x.date === rec.date && x.created_at < rec.created_at)))[0] || null);
    })();
  }, [id]);
  if (r === null) return <Loading />;
  if (!r) return <div className="empty">{pick("找不到这份记录。", "Record not found.")}</div>;
  const set = (k, v) => { setR((x) => ({ ...x, [k]: v })); setDirty(true); };
  const me = staff.find((s) => s.id === staffId);
  const th = staff.find((s) => s.id === r.therapist_id);
  const save = async (patch = {}) => {
    const body = { date: r.date, kind: r.kind, therapist_id: r.therapist_id, therapist_name: staff.find((s) => s.id === r.therapist_id)?.name || r.therapist_name || "", concern: r.concern, observation: r.observation, treatment: r.treatment, oils: r.oils, advice: r.advice, followup: r.followup, report: r.report, status: r.status, updated_at: new Date().toISOString(), ...patch };
    try { await db.update("service_records", id, body); setR((x) => ({ ...x, ...patch })); setDirty(false); toast(pick("已保存", "Saved")); return true; }
    catch (e) { toast(pick("保存失败：", "Save failed: ") + (e.message || "")); return false; }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    try { const n = await db.insert("service_notes", { record_id: id, body: note.trim(), kind: dict.on ? "voice" : "typed", author_name: me?.name || profile?.staff_name || "" }); setNotes((x) => [...x, n || { id: Math.random(), body: note.trim(), created_at: new Date().toISOString(), author_name: me?.name }]); setNote(""); }
    catch (e) { toast(e.message || "error"); }
  };
  const composeText = () => {
    const kind = pick(...(KIND[r.kind] || KIND.studio));
    const oils = (r.oils || []).map((o) => `${o.product ? pname(o) : o.oil}${o.drops ? ` ${o.drops} 滴` : ""}${o.note ? `（${o.note}）` : ""}`).join("、");
    const parts = [
      `${r.date} · ${kind}${th ? ` · 芳疗师 ${th.name}` : ""}`,
      r.concern && `【你提到的状况】\n${r.concern}`,
      r.observation && `【芳疗师观察】\n${r.observation}`,
      r.treatment && `【这次的处理】\n${r.treatment}`,
      oils && `【使用的精油】\n${oils}`,
      r.advice && `【居家建议】\n${r.advice}`,
      r.followup && `【下次跟进】\n${r.followup}`,
    ].filter(Boolean);
    return parts.join("\n\n");
  };
  const compose = () => set("report", composeText());
  const products = cat.ready ? cat.products.filter((p) => oilQ && (p.name_zh + p.name_en).toLowerCase().includes(oilQ.toLowerCase())).slice(0, 8) : [];
  const addOil = (p) => { set("oils", [...(r.oils || []), { product: p.id, oil: p.name_zh, drops: "", note: "" }]); setOilQ(""); };
  const setOil = (i, k, v) => set("oils", r.oils.map((o, j) => (j === i ? { ...o, [k]: v } : o)));
  const F = (k, zh, en, rows = 3) => <div className="field"><label htmlFor={`f_${k}`}>{pick(zh, en)}</label><textarea id={`f_${k}`} rows={rows} value={r[k] || ""} onChange={(e) => set(k, e.target.value)} /></div>;
  return (
    <>
      <div className="crumbs"><Link to="/staff">{pick("工作台", "Workspace")}</Link><span>/</span>{m && <Link to={`/staff/c/${m.id}`}>{cv(m.name)}</Link>}<span>/</span><span>{r.date}</span></div>
      <div className="svc-head">
        <div><h1 className="page-title">{pick("服务记录", "Session record")}{m ? ` · ${cv(m.name)}` : ""}</h1>
          <p className="muted">{r.status === "final" ? pick("已完成，客人在会员页看得到", "Finished — the client can see it") : pick("草稿，只有团队看得到", "Draft — only the team can see it")}{dirty ? ` · ${pick("有未保存的修改", "unsaved changes")}` : ""}</p></div>
        <div className="acts">
          <button className="btn" onClick={() => save()}>{pick("保存", "Save")}</button>
          {r.status === "draft" ? <button className="btn primary" onClick={() => { const report = r.report?.trim() ? r.report : composeText(); setR((x) => ({ ...x, report })); save({ status: "final", finalized_at: new Date().toISOString(), report }); }}>{pick("完成并发给客人", "Finish & share with client")}</button>
            : <button className="btn" onClick={() => save({ status: "draft" })}>{pick("改回草稿", "Back to draft")}</button>}
        </div>
      </div>

      {prev && <div className="svc-prev"><b>{pick("上一次", "Last time")} · {prev.date}{staff.find((s) => s.id === prev.therapist_id) ? ` · ${cv(staff.find((s) => s.id === prev.therapist_id).name)}` : ""}</b>
        {prev.concern && <p><span className="muted">{pick("状况：", "Concern: ")}</span>{cv(prev.concern)}</p>}
        {prev.treatment && <p><span className="muted">{pick("处理：", "Did: ")}</span>{cv(prev.treatment)}</p>}
        {prev.oils?.length > 0 && <p><span className="muted">{pick("用油：", "Oils: ")}</span><OilLine oils={prev.oils} /></p>}
        {prev.followup && <p><span className="muted">{pick("跟进：", "Follow-up: ")}</span>{cv(prev.followup)}</p>}
      </div>}

      <div className="svc-two">
        <section className="svc-form">
          <div className="grid3">
            <div className="field"><label htmlFor="f_date">{pick("日期", "Date")}</label><input id="f_date" type="date" value={r.date || ""} onChange={(e) => set("date", e.target.value)} /></div>
            <div className="field"><label htmlFor="f_kind">{pick("方式", "Where")}</label><select id="f_kind" value={r.kind} onChange={(e) => set("kind", e.target.value)}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{pick(...v)}</option>)}</select></div>
            <div className="field"><label htmlFor="f_th">{pick("芳疗师", "Therapist")}</label><select id="f_th" value={r.therapist_id || ""} onChange={(e) => set("therapist_id", e.target.value || null)} disabled={!isAdmin && r.therapist_id && r.therapist_id !== staffId}><option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{cv(s.name)}</option>)}</select></div>
          </div>
          {F("concern", "客人说的状况", "What the client said")}
          {F("observation", "芳疗师观察", "What you noticed")}
          {F("treatment", "这次做了什么", "What you did")}
          <div className="field"><span className="lab">{pick("用油", "Oils used")}</span>
            {(r.oils || []).map((o, i) => <div key={i} className="svc-oil"><b>{o.product ? pname(o) : o.oil}</b>
              <input type="number" min="0" placeholder={pick("滴", "drops")} value={o.drops} onChange={(e) => setOil(i, "drops", e.target.value ? Number(e.target.value) : "")} aria-label={pick("滴数", "drops")} />
              <input type="text" placeholder={pick("用在哪里", "where")} value={o.note || ""} onChange={(e) => setOil(i, "note", e.target.value)} aria-label={pick("备注", "note")} />
              <button type="button" className="btn ghost sm" onClick={() => set("oils", r.oils.filter((_, j) => j !== i))}>{pick("删除", "Remove")}</button></div>)}
            <input type="search" placeholder={pick("输入精油名字加入，例如 乳香", "Type an oil to add, e.g. Frankincense")} value={oilQ} onChange={(e) => setOilQ(e.target.value)} />
            {products.length > 0 && <div className="svc-pick">{products.map((p) => <button type="button" key={p.id} onClick={() => addOil(p)}>{pick(p.name_zh, p.name_en)}</button>)}</div>}
          </div>
          {F("advice", "居家建议", "At-home advice")}
          {F("followup", "下次跟进", "Next time")}
          <div className="field"><div className="svc-rep-h"><label htmlFor="f_report">{pick("给客人的服务报告", "Report for the client")}</label><button type="button" className="btn sm" onClick={compose}>{pick("按上面内容整理成报告", "Compose from the fields above")}</button></div>
            <textarea id="f_report" rows={10} value={r.report || ""} onChange={(e) => set("report", e.target.value)} placeholder={pick("按上面的按钮自动整理，可以再修改。", "Use the button to compose it, then edit.")} /></div>
        </section>

        <aside className="svc-notes">
          <h2 className="svc-h2">{pick("服务中笔记", "Notes during the session")}</h2>
          <p className="small muted">{pick("只有团队看得到。边做边记客人说的话，可以打字或者语音。", "Team only. Jot down what the client says, by typing or voice.")}</p>
          {notes.map((n) => <div key={n.id} className="svc-note"><span className="small muted">{(n.created_at || "").slice(0, 16).replace("T", " ")} · {cv(n.author_name || "")}{n.kind === "voice" ? pick(" · 语音", " · voice") : ""}</span><p>{cv(n.body)}</p></div>)}
          <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={pick("客人说……", "The client says…")} aria-label={pick("新笔记", "New note")} />
          <div className="acts">
            {dict.supported ? <>
              <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={pick("语音语言", "Voice language")} style={{ width: "auto" }}><option value="zh-CN">普通话</option><option value="zh-HK">粤语</option><option value="en-US">English</option></select>
              {dict.on ? <button type="button" className="btn" onClick={dict.stop}>{pick("停止录音", "Stop")}</button> : <button type="button" className="btn" onClick={() => dict.start(lang)}>{pick("语音输入", "Dictate")}</button>}
            </> : <span className="small muted">{pick("这个浏览器不支持语音，可以用手机键盘上的麦克风。", "Voice isn't supported here; use your keyboard's mic.")}</span>}
            <button type="button" className="btn primary" onClick={addNote} disabled={!note.trim()}>{pick("加入笔记", "Add note")}</button>
          </div>
          {notes.length > 0 && <button type="button" className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => set("observation", [r.observation, ...notes.map((n) => n.body)].filter(Boolean).join("\n"))}>{pick("把笔记放进「芳疗师观察」", "Copy notes into ‘What you noticed’")}</button>}
        </aside>
      </div>
    </>
  );
}

/* ================= 后台：预约 + 芳疗师 ================= */
export function BookingsAdmin() {
  const { pick, cv } = useLang();
  const toast = useToast();
  const staff = useStaffList();
  const [list, setList] = useState(null);
  const [show, setShow] = useState("open");
  const load = useCallback(() => db.select("bookings", { order: ["date", true] }).then(setList).catch(() => setList([])), []);
  useEffect(() => { load(); }, [load]);
  const upd = async (b, patch) => { try { await db.update("bookings", b.id, patch); setList((l) => l.map((x) => (x.id === b.id ? { ...x, ...patch } : x))); toast(pick("已更新", "Updated")); } catch (e) { toast(e.message || "error"); } };
  if (!list) return <Loading />;
  const rows = list.filter((b) => (show === "open" ? ["new", "confirmed"].includes(b.status) : true));
  return (
    <>
      <div className="seg2" style={{ marginBottom: 16 }}>{[["open", pick("待处理", "Open")], ["all", pick("全部", "All")]].map(([k, l]) => <button key={k} aria-pressed={show === k} onClick={() => setShow(k)}>{l}</button>)}</div>
      {!rows.length ? <div className="empty">{pick("没有预约。", "No bookings.")}</div> : <div className="svc-list">{rows.map((b) => (
        <div key={b.id} className="svc-bk">
          <b>{b.date} {b.slot}</b>
          <span>{pick(...(KIND[b.kind] || KIND.studio))}{b.address ? ` · ${b.address}` : ""}</span>
          <span>{cv(b.name)} <span className="muted">{b.contact}</span></span>
          <span className="muted">{cv(b.need)}</span>
          <span className="acts">
            <select value={b.therapist_id || ""} onChange={(e) => upd(b, { therapist_id: e.target.value || null, status: e.target.value && b.status === "new" ? "confirmed" : b.status })} aria-label={pick("指派芳疗师", "Assign therapist")} style={{ width: "auto" }}>
              <option value="">{pick("指派芳疗师…", "Assign therapist…")}</option>{staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{cv(s.name)}</option>)}</select>
            <select value={b.status} onChange={(e) => upd(b, { status: e.target.value })} aria-label={pick("状态", "Status")} style={{ width: "auto" }}>{Object.entries(BK_STATUS).map(([k, v]) => <option key={k} value={k}>{pick(...v)}</option>)}</select>
            {b.member_id && <Link className="btn sm" to={`/staff/c/${b.member_id}`}>{pick("档案", "File")}</Link>}
          </span>
        </div>))}</div>}
    </>
  );
}

export function StaffAdmin() {
  const { pick, cv } = useLang();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [f, setF] = useState({ name: "", email: "", phone: "", title: "芳疗师" });
  const load = useCallback(() => db.select("staff", { order: ["created_at", true] }).then(setList).catch(() => setList([])), []);
  useEffect(() => { load(); }, [load]);
  const add = async (e) => {
    e.preventDefault(); if (!f.name.trim() || !f.email.trim()) return;
    try { await db.insert("staff", { ...f, name: f.name.trim(), email: f.email.trim().toLowerCase(), active: true }); setF({ name: "", email: "", phone: "", title: "芳疗师" }); load(); toast(pick("已加入", "Added")); }
    catch (x) { toast(x.message || "error"); }
  };
  if (!list) return <Loading />;
  return (
    <>
      <p className="muted" style={{ maxWidth: "60ch" }}>{pick("在这里加芳疗师的名字和电邮。她用这个电邮在「登入」页收验证码登入，就会自动进入芳疗师工作台，可以看客人档案、写服务记录。", "Add a therapist's name and email here. When she signs in with that email she gets the therapist workspace: client files and session records.")}</p>
      <div className="svc-list" style={{ marginTop: 16 }}>{list.map((s) => (
        <div key={s.id} className="svc-bk"><b>{cv(s.name)}</b><span className="muted">{s.title}</span><span>{s.email}</span><span className="muted">{s.user_id ? pick("已登入过", "Has signed in") : pick("还没登入", "Not signed in yet")}</span>
          <span className="acts"><button className="btn sm" onClick={async () => { try { await db.update("staff", s.id, { active: !s.active }); load(); } catch (x) { toast(x.message || "error"); } }}>{s.active ? pick("停用", "Deactivate") : pick("启用", "Activate")}</button></span></div>))}</div>
      <form onSubmit={add} className="svc-form" style={{ marginTop: 28, maxWidth: 640 }}>
        <h3>{pick("加芳疗师", "Add a therapist")}</h3>
        <div className="grid2">
          <div className="field"><label htmlFor="st_n">{pick("名字", "Name")}</label><input id="st_n" type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="st_e">{pick("电邮（登入用）", "Email (for sign-in)")}</label><input id="st_e" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="field"><label htmlFor="st_p">{pick("电话", "Phone")}</label><input id="st_p" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div className="field"><label htmlFor="st_t">{pick("职称", "Title")}</label><input id="st_t" type="text" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        </div>
        <button className="btn primary" disabled={!f.name.trim() || !f.email.trim()}>{pick("加入", "Add")}</button>
      </form>
    </>
  );
}
