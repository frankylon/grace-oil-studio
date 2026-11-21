// 会员注册：用邮箱 + 密码开帐户，不用点邮件链接。
// 已经在系统里的会员（同一个邮箱或电话）会自动连上原来的资料；新会员建一条「普通会员」资料。
// 填了推荐人（会员号 / 电话 / 邮箱）就挂到那位会员下面。
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const digits = (x: string) => String(x || "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let p: any; try { p = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const email = String(p.email || "").trim().toLowerCase();
  const password = String(p.password || "");
  const name = String(p.name || "").trim().slice(0, 80);
  const phone = String(p.phone || "").trim().slice(0, 40);
  const ref = String(p.ref || "").trim().slice(0, 80);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "bad_email" }, 400);
  if (password.length < 8) return json({ error: "weak_password" }, 400);
  if (!name) return json({ error: "no_name" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: created, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, phone } });
  if (error) return json({ error: /registered|exists/i.test(error.message) ? "exists" : "create_failed", message: error.message }, 400);
  const uid = created.user!.id;

  // 触发器已经按邮箱 / 电话连上旧资料；没有的话新建
  const { data: prof } = await sb.from("profiles").select("member_id").eq("id", uid).maybeSingle();
  let memberId = prof?.member_id || null;
  if (!memberId) {
    let sponsor: string | null = null;
    if (ref) {
      const d = digits(ref);
      const { data: ms } = await sb.from("members").select("id, doterra_id, phone, email");
      const hit = (ms || []).find((m: any) => (m.doterra_id && m.doterra_id === ref) || (m.email && m.email.toLowerCase() === ref.toLowerCase()) || (d.length >= 7 && digits(m.phone) === d));
      if (hit) sponsor = hit.id;
      else {
        const { data: acc } = await sb.from("dt_accounts").select("member_id").eq("member_no", ref).limit(1);
        if (acc?.length) sponsor = acc[0].member_id;
      }
    }
    const { data: m, error: e2 } = await sb.from("members").insert({ name, email, phone, sponsor_id: sponsor, tier: "customer", member_type: "retail", joined: new Date().toISOString().slice(0, 10), admin_notes: ref && !sponsor ? `注册时填的推荐人：${ref}（没对上）` : "" }).select("id").single();
    if (e2) return json({ error: "member_failed", message: e2.message }, 500);
    memberId = m.id;
    await sb.from("profiles").upsert({ id: uid, member_id: memberId, role: "member" });
  }
  return json({ ok: true });
});
