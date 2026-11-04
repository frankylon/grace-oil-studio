import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { auth, db, loadCatalog } from "./api";
import { ownedSet } from "./util";

/* ---------- 目录 ---------- */
const CatCtx = createContext(null);
export function CatalogProvider({ children }) {
  const [cat, setCat] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { loadCatalog().then(setCat).catch((e) => setErr(e)); }, []);
  const value = useMemo(() => {
    if (!cat) return { ready: false, err };
    const byId = Object.fromEntries(cat.products.map((p) => [p.id, p]));
    const recipesByProduct = {};
    for (const r of cat.recipes) for (const it of [...(r.items || []), ...((r.alt_items || []).flat())]) if (it.product) (recipesByProduct[it.product] = recipesByProduct[it.product] || new Set()).add(r.id);
    const catById = Object.fromEntries((cat.cats || []).map((c) => [c.id, c]));
    const painById = Object.fromEntries((cat.pains || []).map((c) => [c.id, c]));
    return { ready: true, ...cat, byId, recipesByProduct, catById, painById };
  }, [cat, err]);
  return <CatCtx.Provider value={value}>{children}</CatCtx.Provider>;
}
export const useCatalog = () => useContext(CatCtx);

/* ---------- 登入 ---------- */
const AuthCtx = createContext(null);
export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, session: null, profile: null, member: null, owned: null });
  const refresh = useCallback(async () => {
    try {
      const session = await auth.session();
      if (!session) { setState({ loading: false, session: null, profile: null, member: null, owned: null }); return; }
      const profile = await auth.profile();
      let member = null, owned = null;
      if (profile?.member_id) {
        const ms = await db.select("members", { eq: { id: profile.member_id } });
        member = ms[0] || null;
        const orders = await db.select("orders", { eq: { member_id: profile.member_id } });
        owned = ownedSet(orders);
      }
      setState({ loading: false, session, profile, member, owned });
    } catch (e) {
      console.warn(e);
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);
  useEffect(() => { refresh(); return auth.onChange(() => refresh()); }, [refresh]);
  const value = useMemo(() => ({ ...state, refresh, isAdmin: state.profile?.role === "admin", isStaff: ["admin", "therapist"].includes(state.profile?.role), staffId: state.profile?.staff_id || null }), [state, refresh]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);

/* ---------- 提示 ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const show = useCallback((m) => { setMsg(m); clearTimeout(window.__tt); window.__tt = setTimeout(() => setMsg(null), 2200); }, []);
  return <ToastCtx.Provider value={show}>{children}{msg && <div className="toast" role="status">{msg}</div>}</ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);
