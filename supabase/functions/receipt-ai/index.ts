// AI 识别收据（Grace 芳疗工作室）：把收据 / 发票（图片或 PDF，一张或几张同一笔）交给 Claude，
// 读出日期、商家、单号、金额、税、类别，以及订单里的每一样货（用来一键入库），返回给网页填表。
// 参考源财务系统 ledger 的 receipt-ai。需要 Edge Function 密钥 ANTHROPIC_API_KEY；可选 ANTHROPIC_MODEL（默认 claude-sonnet-5-5）。
// 已登入、连上会员或是管理员的帐号可以用（会员给自己记账）。
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "no_api_key" }, 503);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who } = await admin.auth.getUser(token);
  const uid = who?.user?.id;
  if (!uid) return json({ error: "not_signed_in" }, 401);
  const prof = await admin.from("profiles").select("role, member_id").eq("id", uid).maybeSingle();
  if (!prof.data || (prof.data.role !== "admin" && !prof.data.member_id)) return json({ error: "no_permission" }, 403);

  let p: any;
  try { p = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const files: { mime: string; data: string }[] = Array.isArray(p.files) ? p.files : [];
  if (!files.length || files.length > 8) return json({ error: "too_many_files" }, 400);
  let total = 0;
  for (const f of files) {
    if (!f?.data) return json({ error: "bad_file" }, 400);
    if (f.mime !== "application/pdf" && !IMAGE.includes(f.mime)) return json({ error: "unsupported_type" }, 415);
    total += String(f.data).length;
  }
  if (total > 24_000_000) return json({ error: "file_too_large" }, 413);
  const kind = p.kind === "income" ? "income" : "expense";
  const ctx = p.context || {};
  const lang = ctx.lang === "en" ? "英文" : "中文";
  const list = (a: unknown) => JSON.stringify(Array.isArray(a) ? a.slice(0, 60) : []);
  const today = new Date().toISOString().slice(0, 10);
  const many = files.length > 1 ? `一共有 ${files.length} 张图 / 文件，它们是同一笔交易的不同单据（例如发票和付款截图），请合在一起看，只回复一笔。` : "";
  const who2 = ctx.account ? `，记在「${ctx.account}」这个帐户名下` : "";

  const ask = kind === "expense"
    ? `这是收据、发票、账单或扣费截图，是一位 doTERRA 精油健康倡导者（温哥华）做精油生意或日常经营的一笔支出${who2}。可能是在 doTERRA 官网下的精油订单、瓶子配件、宣传印刷、广告、餐饮、汽车油费停车、快递等。${many}今天是 ${today}。
读出内容，只回复一个 JSON 对象，不要任何其他文字：
{"date":"YYYY-MM-DD（交易 / 开票日期）","merchant":"商家或平台名","txn_id":"发票号 / 订单号 / 交易号，没有就空","item":"用${lang}简短说明买了什么","amount":总额数字（含税，用收据上的币种）,"currency":"CAD|USD|CNY","tax":其中税额数字或null,"category":"从类别列表里选一个（照抄原文），选不出就空",
"pay_method":"credit|debit|cash|etransfer|wechat|alipay|other 之一，判断不了就空","card_last4":"付款卡尾号四位，没有就空","doterra_member_no":"如果是 doTERRA 订单，上面的会员号 / 帐户号，没有就空","bill_to":"收据上的抬头 / 客户名，没有就空",
"lines":[{"name":"货品名称，照收据原文（例如 Lavender 15 mL）","sku":"货号 / 产品编号，没有就空","qty":数量数字,"unit_price":单价数字或null}],
"summary":"一句话${lang}摘要"}
lines：只在这是买实物货品（精油、瓶子、配件、印刷品等）而且收据上列出了品项时才填，每一行一样货；服务、餐饮、油费、广告等不是货品的，lines 用空数组。免费赠品单价填 0。
类别：${list(ctx.categories)}
看不清或收据上没有的字段留空，不要猜。金额只填数字。`
    : `这是收款单、发票、转账记录或收入凭证（可能是卖精油、芳疗服务、doTERRA 奖金等）${who2}。${many}今天是 ${today}。
读出内容，只回复一个 JSON 对象，不要任何其他文字：
{"date":"YYYY-MM-DD","merchant":"付款方 / 客人","item":"用${lang}简短说明收的是什么钱","amount":总额数字（含税）,"currency":"CAD|USD|CNY","tax":其中税额数字或null,"category":"从类别列表里选一个（照抄原文），选不出就空",
"pay_method":"cash|debit|credit|etransfer|wechat|alipay|other 之一，判断不了就空","txn_id":"单号 / 发票号，没有就空","summary":"一句话${lang}摘要"}
类别：${list(ctx.categories)}
看不清的字段留空，不要猜。金额只填数字。`;

  const content: any[] = files.map((f) => f.mime === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data } }
    : { type: "image", source: { type: "base64", media_type: f.mime, data: f.data } });
  content.push({ type: "text", text: ask });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5", max_tokens: 3000, messages: [{ role: "user", content }] }),
  });
  const out = await r.json().catch(() => null);
  if (!r.ok) return json({ error: "claude_error", status: r.status, message: out?.error?.message || "" }, 502);
  const text = (out?.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  let fields: any = null;
  try { fields = m ? JSON.parse(m[0]) : null; } catch { fields = null; }
  if (!fields) return json({ error: "unreadable" }, 422);
  if (!Array.isArray(fields.lines)) fields.lines = [];
  return json({ ok: true, fields });
});
