// 管理员给会员开通登入：帐号＝手机号，初始密码＝手机号后六位。
// 只有管理员 / 超级经营者能调用。mode: "create"（开通，已开通的跳过）或 "reset"（把密码重设回手机后六位）。
// 登入用的邮箱是用手机号生成的内部地址（不会收发邮件），会员在登入页直接打手机号即可。
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
export const phoneKey = (p: string) => { let d = String(p || "").replace(/\D/g, ""); if (d.length === 11 && d[0] === "1") d = d.slice(1); return d; };
const loginEmail = (d: string) => `p${d}@members.grace-oil-studio.app`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who } = await sb.auth.getUser(token);
  if (!who?.user) return json({ error: "not_signed_in" }, 401);
  const { data: prof } = await sb.from("profiles").select("role, member_id").eq("id", who.user.id).maybeSingle();
  let ok = prof?.role === "admin";
  if (!ok && prof?.member_id) { const { data: me } = await sb.from("members").select("tier").eq("id", prof.member_id).maybeSingle(); ok = me?.tier === "super"; }
  if (!ok) return json({ error: "no_permission" }, 403);

  let p: any; try { p = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const mode = p.mode === "reset" ? "reset" : "create";
  const ids: string[] = Array.isArray(p.member_ids) ? p.member_ids.slice(0, 500) : [];
  const { data: ms } = await sb.from("members").select("id, name, phone, login_user_id").in("id", ids);
  const out: any[] = [];
  for (const m of ms || []) {
    const d = phoneKey(m.phone);
    if (d.length < 7) { out.push({ id: m.id, name: m.name, status: "no_phone" }); continue; }
    const email = loginEmail(d); const password = d.slice(-6);
    let uid: string | null = m.login_user_id || null;
    if (uid && mode === "create") { out.push({ id: m.id, name: m.name, status: "exists", login: d }); continue; }
    if (!uid) {
      const { data: c, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: m.name, phone: d, default_pw: true } });
      if (error) { out.push({ id: m.id, name: m.name, status: /registered|exists/i.test(error.message) ? "taken" : "error", message: error.message, login: d }); continue; }
      uid = c.user!.id;
    } else {
      const { error } = await sb.auth.admin.updateUserById(uid, { email, password, user_metadata: { name: m.name, phone: d, default_pw: true } });
      if (error) { out.push({ id: m.id, name: m.name, status: "error", message: error.message }); continue; }
    }
    // 触发器已经建好 profile，这里把它连到这位会员
    await sb.from("profiles").update({ member_id: m.id }).eq("id", uid);
    await sb.from("members").update({ login_phone: d, login_user_id: uid, login_created_at: new Date().toISOString() }).eq("id", m.id);
    out.push({ id: m.id, name: m.name, status: mode === "reset" && m.login_user_id ? "reset" : "created", login: d });
  }
  return json({ ok: true, results: out });
});
