import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useLang } from "../i18n";
import { useAuth } from "../ctx";
import { auth, DEMO } from "../api";

const ERR = {
  exists: ["这个邮箱已经注册过了，请直接登入；忘记密码可以重设。", "This email is already registered. Sign in, or reset your password."],
  invalid: ["帐号或密码不对。", "Wrong phone/email or password."],
  weak_password: ["密码至少 8 位。", "Password needs at least 8 characters."],
  bad_email: ["邮箱格式不对。", "That email doesn't look right."],
  no_name: ["请填你的名字。", "Please enter your name."],
};

export default function Login() {
  const { t, pick } = useLang();
  const { session, refresh, isStaff, isAdmin, profile } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [tab, setTab] = useState(sp.get("tab") === "register" ? "register" : "login");
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "", password2: "", ref: sp.get("ref") || "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  if (session) return <Navigate to={isStaff && !profile?.member_id ? (isAdmin ? "/admin" : "/staff") : "/me"} replace />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const fail = (x) => setErr(pick(...(ERR[x.code] || [t("login_fail") + (x.message || ""), x.message || "Error"])));
  const login = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await auth.signIn(f); await refresh(); } catch (x) { fail(x); }
    setBusy(false);
  };
  const register = async (e) => {
    e.preventDefault(); setErr("");
    if (f.password !== f.password2) { setErr(pick("两次输入的密码不一样。", "Passwords don't match.")); return; }
    setBusy(true);
    try { await auth.register(f); await refresh(); nav("/me"); } catch (x) { fail(x); }
    setBusy(false);
  };
  const forgot = async () => {
    setErr(""); setNote("");
    if (!f.email.trim() || !f.email.includes("@")) { setErr(pick("先在上面填上你注册用的邮箱。用手机号登入的会员，请联系 Grace 重设密码。", "Enter the email you registered with. Phone sign-in members: ask Grace to reset it.")); return; }
    setBusy(true);
    try { await auth.resetPassword(f.email); setNote(pick("重设密码的邮件已经发出，请到邮箱点链接设新密码。", "We've emailed you a link to set a new password.")); } catch (x) { fail(x); }
    setBusy(false);
  };
  return (
    <div style={{ maxWidth: 460, margin: "24px auto" }} className="panel pad">
      <h1 style={{ fontSize: 28 }}>{tab === "login" ? pick("会员登入", "Member sign-in") : pick("注册会员", "Become a member")}</h1>
      {DEMO && <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "16px 0" }}>
        <p className="notice honey" style={{ margin: 0 }}>{t("demo_banner")}</p>
        <button className="btn primary" onClick={async () => { await auth.demoSignIn("member"); nav("/me"); }}>{t("demo_as_member")}</button>
        <button className="btn" onClick={async () => { await auth.demoSignIn("admin"); nav("/admin"); }}>{t("demo_as_admin")}</button>
        <button className="btn" onClick={async () => { await auth.demoSignIn("therapist"); nav("/staff"); }}>{t("demo_as_staff")}</button>
      </div>}
      <div className="fseg" style={{ margin: "14px 0 18px" }}>
        <button aria-pressed={tab === "login"} onClick={() => { setTab("login"); setErr(""); }}>{pick("登入", "Sign in")}</button>
        <button aria-pressed={tab === "register"} onClick={() => { setTab("register"); setErr(""); }}>{pick("注册", "Register")}</button>
      </div>
      {tab === "login" ? (
        <form onSubmit={login} className="lg-form">
          <div className="field"><label htmlFor="lg_e">{pick("手机号或邮箱", "Phone or email")}</label><input id="lg_e" type="text" inputMode="email" autoComplete="username" value={f.email} onChange={set("email")} placeholder={pick("例如 6045551234", "e.g. 6045551234")} required /></div>
          <div className="field"><label htmlFor="lg_p">{pick("密码", "Password")}</label><input id="lg_p" type="password" autoComplete="current-password" value={f.password} onChange={set("password")} required /></div>
          <button className="btn primary" disabled={busy || !f.email || !f.password}>{pick("登入", "Sign in")}</button>
          <p className="muted small" style={{ margin: 0 }}>{pick("doTERRA 会员：帐号是你的手机号，初始密码是手机号后六位。忘记密码请联系 Grace。", "doTERRA members: sign in with your phone number; the first password is its last six digits. Forgot it? Ask Grace.")}</p>
          <button type="button" className="btn ghost sm" onClick={forgot} disabled={busy}>{pick("用邮箱注册的：忘记密码", "Registered by email: forgot password")}</button>
          <p className="muted small" style={{ margin: 0 }}>{pick("还没有帐户？", "No account yet? ")}<button type="button" className="linkbtn" onClick={() => setTab("register")}>{pick("免费注册", "Register free")}</button></p>
        </form>
      ) : (
        <form onSubmit={register} className="lg-form">
          <p className="muted small" style={{ margin: 0 }}>{pick("注册后可以预约服务、请 Grace 为你配油、查看服务报告。买过 doTERRA 的会员，你的上线会帮你开通订单和积分记录。", "Members can book sessions, ask Grace for a blend and read their service reports. If you buy doTERRA, your upline will switch on your orders and points.")}</p>
          <div className="field"><label htmlFor="rg_n">{pick("名字", "Name")}</label><input id="rg_n" type="text" autoComplete="name" value={f.name} onChange={set("name")} required /></div>
          <div className="field"><label htmlFor="rg_e">{pick("邮箱（登入用）", "Email (for sign-in)")}</label><input id="rg_e" type="email" autoComplete="email" value={f.email} onChange={set("email")} required /></div>
          <div className="field"><label htmlFor="rg_t">{pick("电话", "Phone")}</label><input id="rg_t" type="tel" autoComplete="tel" value={f.phone} onChange={set("phone")} placeholder="+1 604 555 0123" /></div>
          <div className="field"><label htmlFor="rg_p">{pick("密码（至少 8 位）", "Password (8+ characters)")}</label><input id="rg_p" type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={set("password")} required /></div>
          <div className="field"><label htmlFor="rg_p2">{pick("再输入一次密码", "Repeat password")}</label><input id="rg_p2" type="password" autoComplete="new-password" minLength={8} value={f.password2} onChange={set("password2")} required /></div>
          <div className="field"><label htmlFor="rg_r">{pick("推荐人（选填）：会员号、电话或邮箱", "Referred by (optional): member no., phone or email")}</label><input id="rg_r" type="text" value={f.ref} onChange={set("ref")} /></div>
          <button className="btn primary" disabled={busy || !f.name || !f.email || f.password.length < 8}>{busy ? pick("注册中…", "Creating…") : pick("注册并登入", "Register & sign in")}</button>
        </form>
      )}
      {err && <p style={{ color: "var(--warn)" }}>{err}</p>}
      {note && <p style={{ color: "var(--accent)" }}>{note}</p>}
    </div>
  );
}

/* 从邮件里的「重设密码」链接回来 */
export function ResetPassword() {
  const { pick } = useLang();
  const { session, refresh } = useAuth();
  const nav = useNavigate();
  const [p1, setP1] = useState(""); const [p2, setP2] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(true);
  useEffect(() => { const x = setTimeout(() => setWait(false), 2500); return () => clearTimeout(x); }, []);
  if (!session) return <div className="panel pad" style={{ maxWidth: 460, margin: "24px auto" }}>{wait ? <p>{pick("正在验证链接…", "Checking your link…")}</p> : <p>{pick("链接已经失效或用过了。请回到登入页，再点一次「忘记密码」。", "This link has expired or was already used. Go back to sign-in and request a new one.")}</p>}</div>;
  const save = async (e) => {
    e.preventDefault(); setErr("");
    if (p1.length < 8) { setErr(pick("密码至少 8 位。", "At least 8 characters.")); return; }
    if (p1 !== p2) { setErr(pick("两次输入的密码不一样。", "Passwords don't match.")); return; }
    setBusy(true);
    try { await auth.setPassword(p1); await refresh(); nav("/me"); } catch (x) { setErr(x.message || "error"); }
    setBusy(false);
  };
  return (
    <form onSubmit={save} className="panel pad lg-form" style={{ maxWidth: 460, margin: "24px auto" }}>
      <h1 style={{ fontSize: 26 }}>{pick("设一个新密码", "Set a new password")}</h1>
      <div className="field"><label htmlFor="rp1">{pick("新密码（至少 8 位）", "New password (8+)")}</label><input id="rp1" type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} /></div>
      <div className="field"><label htmlFor="rp2">{pick("再输入一次", "Repeat")}</label><input id="rp2" type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} /></div>
      <button className="btn primary" disabled={busy}>{pick("保存密码", "Save password")}</button>
      {err && <p style={{ color: "var(--warn)" }}>{err}</p>}
    </form>
  );
}
