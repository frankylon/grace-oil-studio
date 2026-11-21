import { BrowserRouter, MemoryRouter, NavLink, Route, Routes, Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { BlendRequest } from "./components";
import { LangProvider, useLang } from "./i18n";
import { AuthProvider, CatalogProvider, ToastProvider, useAuth } from "./ctx";
import { DEMO, auth } from "./api";
import { OilDetail, Oils, RecipeDetail, Recipes, Search } from "./pages/Public";
import Home, { Wordmark } from "./pages/Home";
import "./home.css";
import { asset } from "./img";
import Login, { ResetPassword } from "./pages/Login";
import { DownlineView, MyAccount } from "./pages/Member";
import Admin from "./pages/Admin";
import { BookPage, ClientChart, RecordEditor, StaffHome } from "./pages/Service";

function Header() {
  const { t, lang, setLang, brand } = useLang();
  const { session, isAdmin, isStaff } = useAuth();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const go = () => window.dispatchEvent(new Event("open-consult"));
  return (
    <header className="top">
      {DEMO && <div className="demo-banner">{t("demo_banner")}</div>}
      <div className="wrap row">
        <Link to="/" className="brand" aria-label={brand}><b>Grace</b><span>{lang === "en" ? "Aromatherapy" : t("brand_sub")}</span></Link>
        <nav className="nav" aria-label="main">
          <NavLink to="/oils">{t("nav_oils")}</NavLink>
          <NavLink to="/recipes">{t("nav_recipes")}</NavLink>
          <NavLink to="/book">{t("nav_book")}</NavLink>
          {session ? <NavLink to="/me">{t("nav_member")}</NavLink> : <NavLink to="/login">{t("login")}</NavLink>}
          {isStaff && <NavLink to="/staff">{t("nav_staff")}</NavLink>}
          {isAdmin && <NavLink to="/admin">{t("nav_admin")}</NavLink>}
        </nav>
        <div className="seg" role="group" aria-label="Language">
          {[["zhs", "简"], ["zht", "繁"], ["en", "EN"]].map(([k, l]) => <button key={k} aria-pressed={lang === k} onClick={() => setLang(k)}>{l}</button>)}
        </div>
        {session && <button className="btn ghost sm" onClick={() => auth.signOut()}>{t("logout")}</button>}
        <button className="btn primary sm" onClick={go}>{t("find_blend")}</button>
      </div>
    </header>
  );
}
function Footer() {
  const { t, pick } = useLang();
  return (
    <footer className="fx">
      <div className="cols">
        <div><span>{pick("Grace 芳疗工作室", "Grace Aromatherapy")}</span><span>{pick("温哥华", "Vancouver, BC")}</span><span>{pick("芳疗师手调 doTERRA 精油", "Hand-mixed doTERRA blends")}</span></div>
        <nav aria-label="footer"><span>{pick("看看", "Browse")}</span><Link to="/recipes">{t("all_recipes")}</Link><Link to="/oils">{t("nav_oils")}</Link><Link to="/search">{pick("搜索", "Search")}</Link></nav>
        <div><span>{pick("会员", "Members")}</span><Link to="/login">{t("login")}</Link><Link to="/me">{t("nav_member")}</Link></div>
        <div><span>{pick("配一瓶", "Get a bottle")}</span><span>{t("foot_p")}</span></div>
      </div>
      <span />
      <div>
        <Wordmark />
        <p className="legal">{t("independent")} {t("disclaimer")}</p>
      </div>
    </footer>
  );
}
function Consult() {
  const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => setOpen(true); window.addEventListener("open-consult", f); return () => window.removeEventListener("open-consult", f); }, []);
  return open ? <BlendRequest onClose={() => setOpen(false)} /> : null;
}
function Shell() {
  const { pathname } = useLocation();
  const home = pathname === "/";
  const routes = (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/search" element={<Search />} />
      <Route path="/oils" element={<Oils />} />
      <Route path="/oils/:id" element={<OilDetail />} />
      <Route path="/recipes" element={<Recipes />} />
      <Route path="/recipes/:id" element={<RecipeDetail />} />
      <Route path="/login" element={<Login />} />
      <Route path="/reset" element={<ResetPassword />} />
      <Route path="/me" element={<MyAccount />} />
      <Route path="/me/m/:id" element={<DownlineView />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/book" element={<BookPage />} />
      <Route path="/staff" element={<StaffHome />} />
      <Route path="/staff/c/:id" element={<ClientChart />} />
      <Route path="/staff/r/:id" element={<RecordEditor />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
  return <>{home ? <main>{routes}</main> : <main className="wrap">{routes}</main>}</>;
}
function ScrollTop() { const { pathname } = useLocation(); useEffect(() => { window.scrollTo(0, 0); }, [pathname]); return null; }

const Router = import.meta.env.VITE_MEMORY_ROUTER ? MemoryRouter : BrowserRouter;

export default function App() {
  return (
    <LangProvider><ToastProvider><CatalogProvider><AuthProvider>
      <Router>
        <ScrollTop />
        <Header />
        <Shell />
        <Footer />
        <Consult />
      </Router>
    </AuthProvider></CatalogProvider></ToastProvider></LangProvider>
  );
}
