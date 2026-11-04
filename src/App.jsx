import { BrowserRouter, MemoryRouter, NavLink, Route, Routes, Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { LangProvider, useLang } from "./i18n";
import { AuthProvider, CatalogProvider, ToastProvider, useAuth } from "./ctx";
import { DEMO, auth } from "./api";
import { OilDetail, Oils, RecipeDetail, Recipes, Search } from "./pages/Public";
import Home, { Wordmark } from "./pages/Home";
import "./home.css";
import { asset } from "./img";
import Login from "./pages/Login";
import { DownlineView, MyAccount } from "./pages/Member";
import Admin from "./pages/Admin";

function Header() {
  const { t, lang, setLang, brand } = useLang();
  const { session, isAdmin } = useAuth();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const go = () => { if (pathname === "/") document.getElementById("feel")?.scrollIntoView({ behavior: "smooth" }); else { nav("/"); setTimeout(() => document.getElementById("feel")?.scrollIntoView(), 400); } };
  return (
    <header className="top">
      {DEMO && <div className="demo-banner">{t("demo_banner")}</div>}
      <div className="wrap row">
        <Link to="/" className="brand" aria-label={brand}><b>{lang === "en" ? "Yuen" : "源"}</b><span>{lang === "en" ? "Oil Studio" : t("brand_sub")}</span></Link>
        <nav className="nav" aria-label="main">
          <NavLink to="/oils">{t("nav_oils")}</NavLink>
          <NavLink to="/recipes">{t("nav_recipes")}</NavLink>
          {session ? <NavLink to="/me">{t("nav_member")}</NavLink> : <NavLink to="/login">{t("login")}</NavLink>}
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
        <div><span>{pick("源 精油配方馆", "Yuen Oil Studio")}</span><span>{pick("温哥华", "Vancouver, BC")}</span><span>{pick("芳疗师手调 doTERRA 精油", "Hand-mixed doTERRA blends")}</span></div>
        <nav aria-label="footer"><span>{pick("看看", "Browse")}</span><Link to="/recipes">{t("all_recipes")}</Link><Link to="/oils">{t("nav_oils")}</Link><Link to="/search">{pick("搜索", "Search")}</Link></nav>
        <div><span>{pick("会员", "Members")}</span><Link to="/login">{t("login")}</Link><Link to="/me">{t("nav_member")}</Link></div>
        <div><span>{pick("配一瓶", "Get a bottle")}</span><span>{pick("说出你的感受，我按滴为你调好，再通知你来取。", "Tell me how you feel; I mix it by the drop and let you know when it is ready.")}</span></div>
      </div>
      <span />
      <div>
        <Wordmark />
        <p className="legal">{t("independent")} {t("disclaimer")}</p>
      </div>
    </footer>
  );
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
      <Route path="/me" element={<MyAccount />} />
      <Route path="/me/m/:id" element={<DownlineView />} />
      <Route path="/admin" element={<Admin />} />
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
      </Router>
    </AuthProvider></CatalogProvider></ToastProvider></LangProvider>
  );
}
