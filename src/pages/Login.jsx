import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useLang } from "../i18n";
import { useAuth } from "../ctx";
import { auth, DEMO } from "../api";

export default function Login() {
  const { t } = useLang();
  const { session, refresh, isStaff, isAdmin, profile } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState("email");
  const [id, setId] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (session) return <Navigate to={isStaff && !profile?.member_id ? (isAdmin ? "/admin" : "/staff") : "/me"} replace />;
  const key = mode === "email" ? { email: id.trim() } : { phone: id.trim() };
  const send = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await auth.sendOtp(key); setSent(true); } catch (x) { setErr(t("login_fail") + (x.message || "")); }
    setBusy(false);
  };
  const verify = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await auth.verifyOtp({ ...key, token: code.trim() }); await refresh(); } catch (x) { setErr(t("login_fail") + (x.message || "")); }
    setBusy(false);
  };
  return (
    <div style={{ maxWidth: 440, margin: "24px auto" }} className="panel pad">
      <h1 style={{ fontSize: 28 }}>{t("login_title")}</h1>
      {DEMO ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          <p className="notice honey" style={{ margin: 0 }}>{t("demo_banner")}</p>
          <button className="btn primary" onClick={async () => { await auth.demoSignIn("member"); nav("/me"); }}>{t("demo_as_member")}</button>
          <button className="btn" onClick={async () => { await auth.demoSignIn("admin"); nav("/admin"); }}>{t("demo_as_admin")}</button>
          <button className="btn" onClick={async () => { await auth.demoSignIn("therapist"); nav("/staff"); }}>{t("demo_as_staff")}</button>
        </div>
      ) : (
        <>
          <p className="muted">{t("login_sub")}</p>
          {!sent ? (
            <form onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="field"><label htmlFor="lg_id">{t(mode)}</label>
                <input id="lg_id" type={mode === "email" ? "email" : "tel"} autoComplete={mode === "email" ? "email" : "tel"} value={id} onChange={(e) => setId(e.target.value)} placeholder={mode === "email" ? "name@example.com" : "+1 604 555 0123"} required /></div>
              <button className="btn primary" disabled={busy || !id.trim()}>{t("send_code")}</button>
              <button type="button" className="btn ghost sm" onClick={() => setMode(mode === "email" ? "phone" : "email")}>{t(mode === "email" ? "use_phone" : "use_email")}</button>
            </form>
          ) : (
            <form onSubmit={verify} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p className="notice" style={{ margin: 0 }}>{t("code_sent")}</p>
              <div className="field"><label htmlFor="lg_code">{t("code")}</label>
                <input id="lg_code" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required /></div>
              <button className="btn primary" disabled={busy || !code.trim()}>{t("verify")}</button>
              <button type="button" className="btn ghost sm" onClick={() => { setSent(false); setCode(""); }}>{t("back")}</button>
            </form>
          )}
          {err && <p style={{ color: "var(--rose)" }}>{err}</p>}
        </>
      )}
    </div>
  );
}
