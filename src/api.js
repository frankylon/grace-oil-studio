// 数据层：有 Supabase 环境变量时连真数据库，否则进入「演示模式」（资料存在浏览器里）
import { createClient } from "@supabase/supabase-js";

// Supabase 的网址和 anon key 本来就是公开给浏览器用的（权限由数据库行级规则把关）
const URL = import.meta.env.VITE_SUPABASE_URL || (import.meta.env.VITE_DEMO ? "" : "https://wijgatwlgyowqoqroqgj.supabase.co");
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || (import.meta.env.VITE_DEMO ? "" : "sb_publishable_XSO9SsMAJQA2z8WNOsA5pw_SEeMJQay");
export const DEMO = !(URL && KEY);

let sb = null;
if (!DEMO) sb = createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true } });

/* ---------------- 目录 ---------------- */
let catalogPromise = null;
export function loadCatalog() {
  if (catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    // 产品与配方随网站打包；数据库只存后台改过或隐藏的配方
    const base = (await import("./data/catalog.json")).default;
    let rows = [], prows = [];
    try { rows = await db.select("recipes"); } catch {}
    try { prows = await db.select("products"); } catch {}
    const ov = new Map(rows.map((r) => [r.id, r]));
    const recipes = [];
    for (const r of base.recipes) { const o = ov.get(r.id); if (o) { if (!o.hidden) recipes.push({ ...o.data, id: r.id }); ov.delete(r.id); } else recipes.push(r); }
    for (const o of ov.values()) if (!o.hidden) recipes.push({ ...o.data, id: o.id });
    recipes.sort((x, y) => (x.sort ?? 0) - (y.sort ?? 0));
    const pov = new Map(prows.map((r) => [r.id, r]));
    const products = base.products.filter((p) => !pov.get(p.id)?.hidden).map((p) => (pov.get(p.id) ? { ...p, ...pov.get(p.id).data, id: p.id } : p));
    return { ...base, recipes, products };
  })();
  catalogPromise.catch(() => { catalogPromise = null; });
  return catalogPromise;
}
export function resetCatalog() { catalogPromise = null; }

/* ---------------- 演示数据库 ---------------- */
const LS = "grace.demo.v2";
let demo = null;
let demoUser = null; // {role, member_id}
const listeners = new Set();
async function demoDb() {
  if (demo) return demo;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LS) || "null"); } catch {}
  if (saved) demo = saved;
  else { const m = await import("./data/demo.json"); demo = JSON.parse(JSON.stringify(m.default)); }
  try { demoUser = JSON.parse(sessionStorage.getItem(LS + ".user") || "null"); } catch {}
  return demo;
}
function persist() { try { localStorage.setItem(LS, JSON.stringify(demo)); } catch {} }
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id" + Math.random().toString(36).slice(2));
function treeIds(rootId) {
  const ids = new Set([rootId]); let grew = true;
  while (grew) { grew = false; for (const m of demo.members) if (m.sponsor_id && ids.has(m.sponsor_id) && !ids.has(m.id)) { ids.add(m.id); grew = true; } }
  return ids;
}
function demoVisible(table, row) {
  if (["products", "recipes", "levels", "site_meta"].includes(table)) return true;
  if (!demoUser) return false;
  if (demoUser.role === "admin") return true;
  if (demoUser.role === "therapist") return ["staff", "members", "blends", "needs", "bookings", "service_records", "service_notes"].includes(table);
  const me = demoUser.member_id; const myTier = demo.members.find((x) => x.id === me)?.tier; const tree = ["builder", "super"].includes(myTier) ? treeIds(me) : new Set([me]);
  const shares = (id) => id === me || (tree.has(id) && demo.members.find((m) => m.id === id)?.share_health_with_upline);
  switch (table) {
    case "members": return tree.has(row.id);
    case "member_status": case "orders": case "pts_moves": return tree.has(row.member_id);
    case "blends": case "needs": return shares(row.member_id);
    case "blend_requests": case "bookings": return row.member_id === me;
    case "service_records": return row.status === "final" && shares(row.member_id);
    case "inv_items": return true;
    case "fin_entries": { const h = (demo.inv_holders || []).find((x) => x.id === row.holder_id); return !!h?.member_id && tree.has(h.member_id); }
    case "dt_accounts": return tree.has(row.member_id);
    case "inv_holders": if (row.member_id && tree.has(row.member_id)) return true; { const mine = (demo.inv_holders || []).filter((h) => h.member_id === me).map((h) => h.id); return mine.includes(row.id) || (demo.inv_moves || []).some((m) => ["loan", "repay", "settle"].includes(m.kind) && ((mine.includes(m.from_holder) && m.to_holder === row.id) || (mine.includes(m.to_holder) && m.from_holder === row.id))); }
    case "inv_moves": if ([row.to_holder, row.from_holder].some((id) => { const h = (demo.inv_holders || []).find((x) => x.id === id); return h?.member_id && tree.has(h.member_id); })) return true; { const mine = (demo.inv_holders || []).filter((h) => h.member_id === me).map((h) => h.id); return mine.includes(row.from_holder) || mine.includes(row.to_holder); }
    default: return false;
  }
}

/* ---------------- 通用读写 ---------------- */
export const db = {
  async select(table, opt = {}) {
    if (DEMO) {
      await demoDb();
      let rows = (demo[table] || []).filter((r) => demoVisible(table, r));
      for (const [k, v] of Object.entries(opt.eq || {})) rows = rows.filter((r) => r[k] === v);
      for (const [k, v] of Object.entries(opt.in || {})) rows = rows.filter((r) => v.includes(r[k]));
      if (opt.order) { const [c, asc] = opt.order; rows = [...rows].sort((a, b) => String(a[c] ?? "").localeCompare(String(b[c] ?? "")) * (asc ? 1 : -1)); }
      return JSON.parse(JSON.stringify(rows));
    }
    let q = sb.from(table).select(opt.select || "*");
    for (const [k, v] of Object.entries(opt.eq || {})) q = q.eq(k, v);
    for (const [k, v] of Object.entries(opt.in || {})) q = q.in(k, v);
    if (opt.order) q = q.order(opt.order[0], { ascending: !!opt.order[1] });
    if (opt.limit) q = q.limit(opt.limit);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async insert(table, row) {
    if (DEMO) {
      await demoDb();
      const staff = ["admin", "therapist"].includes(demoUser?.role);
      if (table === "blend_requests" || table === "bookings" || (table === "needs" && demoUser)) { /* 允许 */ }
      else if (demoUser?.role === "member" && ["fin_entries", "dt_accounts", "inv_holders", "inv_items"].includes(table)) { /* 会员给自己记账 */ }
      else if (demoUser?.role === "member" && table === "inv_moves" && row.kind === "in" && !row.from_holder) { /* 会员给自己入库 */ }
      else if (staff && ["service_records", "service_notes", "members", "blends"].includes(table)) { /* 芳疗师可写 */ }
      else if (demoUser?.role !== "admin") throw new Error("not allowed");
      const r = { id: uid(), created_at: new Date().toISOString(), ...row };
      (demo[table] = demo[table] || []).push(r); persist(); return r;
    }
    // 客人提交配油申请时没有读取权限，所以不回读
    if (table === "blend_requests" || (table === "bookings" && !row.therapist_id)) { const { error } = await sb.from(table).insert(row); if (error) throw error; return row; }
    const { data, error } = await sb.from(table).insert(row).select();
    if (error) throw error;
    return data && data[0];
  },
  async update(table, id, patch, idCol = "id") {
    if (DEMO) {
      await demoDb();
      if (demoUser?.role !== "admin" && !(demoUser?.role === "therapist" && ["bookings", "service_records"].includes(table)) && !(demoUser?.role === "member" && ["fin_entries", "dt_accounts"].includes(table))) throw new Error("not allowed");
      const r = (demo[table] || []).find((x) => x[idCol] === id);
      if (r) Object.assign(r, patch); else (demo[table] = demo[table] || []).push({ [idCol]: id, ...patch });
      persist(); return r;
    }
    const { error } = await sb.from(table).update(patch).eq(idCol, id);
    if (error) throw error;
  },
  async upsert(table, rows, onConflict = "id") {
    if (DEMO) {
      await demoDb(); if (demoUser?.role !== "admin") throw new Error("not allowed");
      const arr = Array.isArray(rows) ? rows : [rows];
      for (const row of arr) {
        const r = (demo[table] = demo[table] || []).find((x) => x[onConflict] === row[onConflict]);
        if (r) Object.assign(r, row); else demo[table].push({ id: row.id || uid(), ...row });
      }
      persist(); return;
    }
    const { error } = await sb.from(table).upsert(rows, { onConflict });
    if (error) throw error;
  },
  async remove(table, id, idCol = "id") {
    if (DEMO) {
      await demoDb(); if (demoUser?.role !== "admin" && !(demoUser?.role === "member" && ["fin_entries", "dt_accounts", "inv_moves"].includes(table))) throw new Error("not allowed");
      demo[table] = (demo[table] || []).filter((x) => x[idCol] !== id); persist(); return;
    }
    const { error } = await sb.from(table).delete().eq(idCol, id);
    if (error) throw error;
  },
  async rpc(name, args) {
    if (DEMO) {
      await demoDb();
      if (name === "set_share_health" && demoUser?.member_id) {
        const m = demo.members.find((x) => x.id === demoUser.member_id); if (m) m.share_health_with_upline = args.v; persist();
      }
      if (name === "link_my_member") return demoUser?.member_id || null;
      if (name === "set_member_tier") { const m = demo.members.find((x) => x.id === args.target); if (m) { m.tier = args.t; persist(); } return args.t; }
      return null;
    }
    const { data, error } = await sb.rpc(name, args);
    if (error) throw error;
    return data;
  },
};

/* ---------------- 登入 ---------------- */
export const auth = {
  async session() {
    if (DEMO) { await demoDb(); return demoUser ? { user: { id: "demo", email: demoUser.role + "@demo" } } : null; }
    const { data } = await sb.auth.getSession(); return data.session;
  },
  onChange(cb) {
    if (DEMO) { listeners.add(cb); return () => listeners.delete(cb); }
    // 不能在这个回调里直接再调 Supabase（会互相等待卡死），所以放到下一轮再处理
    const { data } = sb.auth.onAuthStateChange((_e, s) => { setTimeout(() => cb(s), 0); });
    return () => data.subscription.unsubscribe();
  },
  async sendOtp({ email, phone }) {
    if (DEMO) throw new Error("demo");
    const { error } = await sb.auth.signInWithOtp(email ? { email, options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + "/me" } } : { phone });
    if (error) throw error;
  },
  async register({ name, email, phone, password, ref }) {
    if (DEMO) {
      await demoDb();
      const m = { id: uid(), name, email, phone, tier: "customer", member_type: "retail", sponsor_id: (demo.members.find((x) => ref && (x.doterra_id === ref || x.email === ref)) || {}).id || null, joined: new Date().toISOString().slice(0, 10), accounts: [], created_at: new Date().toISOString() };
      demo.members.push(m); persist();
      demoUser = { role: "member", member_id: m.id }; try { sessionStorage.setItem(LS + ".user", JSON.stringify(demoUser)); } catch {}
      const s = await auth.session(); listeners.forEach((f) => f(s)); return;
    }
    const { data, error } = await sb.functions.invoke("register", { body: { name, email, phone, password, ref } });
    if (error) { let code = ""; try { code = (await error.context.json()).error; } catch {} const e = new Error(code || error.message); e.code = code; throw e; }
    if (data?.error) { const e = new Error(data.error); e.code = data.error; throw e; }
    const { error: e2 } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (e2) throw e2;
  },
  async signIn({ email, password }) {
    if (DEMO) throw new Error("demo");
    const id = email.trim().toLowerCase();
    // 不含 @ 就当手机号：会员用手机号登入（帐号由管理员开通）
    const login = id.includes("@") ? id : phoneLoginEmail(id);
    const { error } = await sb.auth.signInWithPassword({ email: login, password });
    if (error) { const e = new Error(error.message); e.code = /invalid/i.test(error.message) ? "invalid" : ""; throw e; }
  },
  async resetPassword(email) {
    if (DEMO) throw new Error("demo");
    const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: window.location.origin + "/reset" });
    if (error) throw error;
  },
  async setPassword(password) {
    if (DEMO) return;
    const { error } = await sb.auth.updateUser({ password, data: { default_pw: false } });
    if (error) throw error;
  },
  async verifyOtp({ email, phone, token }) {
    const { error } = await sb.auth.verifyOtp(email ? { email, token, type: "email" } : { phone, token, type: "sms" });
    if (error) throw error;
  },
  async signOut() {
    if (DEMO) { demoUser = null; try { sessionStorage.removeItem(LS + ".user"); } catch {} listeners.forEach((f) => f(null)); return; }
    await sb.auth.signOut();
  },
  async demoSignIn(role) {
    await demoDb();
    demoUser = role === "admin" ? { role: "admin", member_id: null, staff_id: demo.staff?.[0]?.id }
      : role === "therapist" ? { role: "therapist", member_id: null, staff_id: demo.demo_staff_id }
      : { role: "member", member_id: demo.demo_member_id };
    try { sessionStorage.setItem(LS + ".user", JSON.stringify(demoUser)); } catch {}
    const s = await auth.session(); listeners.forEach((f) => f(s));
  },
  async profile() {
    if (DEMO) { await demoDb(); if (!demoUser) return null; const mm = demoUser.member_id && demo.members.find((x) => x.id === demoUser.member_id); return { ...demoUser, tier: demoUser.role === "admin" ? "super" : mm?.tier || "customer" }; }
    const { data: s } = await sb.auth.getSession();
    if (!s.session) return null;
    let { data } = await sb.from("profiles").select("role,member_id").eq("id", s.session.user.id).maybeSingle();
    if (!data || !data.member_id) {
      try { await sb.rpc("link_my_member"); } catch {}
      ({ data } = await sb.from("profiles").select("role,member_id").eq("id", s.session.user.id).maybeSingle());
    }
    const prof = data || { role: "member", member_id: null };
    prof.default_pw = !!s.session.user.user_metadata?.default_pw;
    if (prof.member_id) { const { data: mm } = await sb.from("members").select("tier").eq("id", prof.member_id).maybeSingle(); prof.tier = mm?.tier || "customer"; }
    if (prof.role === "admin" || prof.role === "therapist") {
      const { data: st } = await sb.from("staff").select("id,name").eq("user_id", s.session.user.id).maybeSingle();
      prof.staff_id = st?.id || null; prof.staff_name = st?.name || "";
    }
    return prof;
  },
};

/* ---------------- 收据文件 + AI 识别 ---------------- */
const demoFiles = new Map(); // 演示模式：文件只放在这次打开的页面里
export const files = {
  async upload(path, file) {
    if (DEMO) { demoFiles.set(path, URL_.createObjectURL(file)); return path; }
    const { error } = await sb.storage.from("receipts").upload(path, file, { upsert: true, contentType: file.type });
    if (error && !/exists/i.test(error.message)) throw error;
    return path;
  },
  async url(path) {
    if (DEMO) return demoFiles.get(path) || null;
    const { data, error } = await sb.storage.from("receipts").createSignedUrl(path, 600);
    if (error) throw error; return data.signedUrl;
  },
  async remove(paths) { if (DEMO || !paths?.length) return; await sb.storage.from("receipts").remove(paths); },
};
const URL_ = globalThis.URL;
export async function aiReceipt(kind, parts, context) {
  if (DEMO) {
    await new Promise((r) => setTimeout(r, 900));
    return { fields: { date: new Date().toISOString().slice(0, 10), merchant: "doTERRA Canada", txn_id: "DEMO-" + Math.floor(Math.random() * 90000 + 10000), item: kind === "income" ? "精油销售" : "精油订单（演示识别结果）", amount: 128.45, currency: "CAD", tax: 6.12, category: kind === "income" ? "卖精油" : "精油进货", pay_method: "credit", lines: kind === "income" ? [] : [{ name: "Lavender 15 mL", qty: 2, unit_price: 26.67 }, { name: "Frankincense 15 mL", qty: 1, unit_price: 85.33 }, { name: "10ml Roller Bottles", qty: 12, unit_price: 0.5 }], summary: "演示模式：没有真的读收据，这是示例结果" } };
  }
  const { data, error } = await sb.functions.invoke("receipt-ai", { body: { kind, files: parts, context } });
  if (error) { let code = ""; try { code = (await error.context.json()).error; } catch {} const e = new Error(code || error.message); e.code = code; throw e; }
  return data;
}

/* 手机号登入：帐号由管理员开通，初始密码是手机号后六位 */
export const phoneKey = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.length === 11 && d[0] === "1") d = d.slice(1); return d; };
export const phoneLoginEmail = (p) => `p${phoneKey(p)}@members.grace-oil-studio.app`;
export async function memberLogins(mode, memberIds) {
  if (DEMO) { await demoDb(); return { results: memberIds.map((id) => { const m = demo.members.find((x) => x.id === id); const d = phoneKey(m?.phone); if (d.length < 7) return { id, name: m?.name, status: "no_phone" }; if (m) { m.login_phone = d; m.login_created_at = new Date().toISOString(); } persist(); return { id, name: m?.name, status: mode === "reset" ? "reset" : "created", login: d }; }) }; }
  const { data, error } = await sb.functions.invoke("member-login", { body: { mode, member_ids: memberIds } });
  if (error) { let code = ""; try { code = (await error.context.json()).error; } catch {} throw new Error(code || error.message); }
  return data;
}

export function resetDemo() { try { localStorage.removeItem(LS); } catch {} demo = null; }
