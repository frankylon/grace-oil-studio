import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

export const BRAND = {
  zh: "Grace 芳疗工作室",
  en: "Grace Aromatherapy",
};

// [简体, English]  繁体由 OpenCC 自动转换
const S = {
  nav_home: ["首页", "Home"], nav_oils: ["精油百科", "Oils"], nav_recipes: ["配方", "Blends"], nav_member: ["会员中心", "My account"], nav_admin: ["管理后台", "Admin"],
  login: ["会员登入", "Sign in"], logout: ["登出", "Sign out"],
  hero_title: ["每一瓶油，都清楚怎么用", "Every bottle, with clear instructions"],
  hero_sub: ["按身体感受找精油、看配方，一键请我们为你调好一瓶。", "Find oils by how you feel, read real blends, and ask us to mix one for you in one tap."],
  search_ph: ["搜索精油、配方或身体感受，例如：肩颈、睡眠、薰衣草", "Search oils, blends or needs, e.g. neck, sleep, lavender"],
  by_feeling: ["按感受找", "Find by need"], popular: ["常用配方", "Popular blends"], all_recipes: ["全部配方", "All blends"], all_oils: ["全部精油", "All oils"],
  kind_all: ["全部", "All"], kind_single: ["单方", "Single oils"], kind_blend: ["复方", "Blends"], kind_touch: ["呵护滚珠", "Touch roll-ons"], kind_spa: ["SPA 护理", "SPA care"], kind_carrier: ["基底油", "Carrier"],
  massage: ["按摩相关", "Massage use"], high: ["高", "High"], mid: ["中", "Medium"], low: ["低", "Low"],
  results: ["个结果", "results"], no_results: ["没有找到相符的内容，换个关键词试试。", "Nothing matched. Try another word."],
  latin: ["学名", "Botanical name"], aroma: ["香气", "Aroma"], part: ["萃取部位", "Plant part"], extraction: ["萃取方法", "Extraction"], constituents: ["主要成分", "Main constituents"],
  ingredients: ["配方成分", "Ingredients"], origin: ["产地", "Origin"], skin: ["肌肤敏感度", "Skin sensitivity"], size: ["规格", "Size"], retail: ["零售价", "Retail"], wholesale: ["会员价", "Member price"],
  benefits: ["主要功效（官方说法）", "Primary benefits (official)"], about: ["介绍", "About"], how_use: ["怎么用", "How to use"], directions: ["使用方法", "Directions"], cautions: ["注意事项", "Cautions"],
  scenes: ["适合场景", "Good for"], methods: ["使用方式", "Methods"], feelings: ["对应感受", "Helps with"], used_in: ["用到这款油的配方", "Blends that use this oil"],
  official_page: ["doTERRA 官网页面", "doTERRA product page"], nhp: ["加拿大天然健康产品 NPN", "Health Canada NPN product"],
  formula: ["配方", "Formula"], drops: ["滴", "drops"], carrier: ["基底", "Carrier"], usage: ["用法", "How to use"], total: ["合共", "Total"],
  choose_one: ["以下任选一种", "Choose one of"], or_alt: ["或者用这组", "Or use this set"], not_in_catalog: ["非本目录产品", "Not in catalog"],
  one_click: ["一键配油", "Mix this for me"], one_click_sub: ["我们按这条配方帮你调好一瓶，确认后会联系你。", "We'll mix this blend for you and contact you to confirm."],
  bottle: ["瓶子", "Bottle"], b_roll10: ["10ml 滚珠瓶", "10 ml roller"], b_30: ["30ml 瓶", "30 ml bottle"], b_spray: ["喷雾瓶", "Spray bottle"], b_cream: ["乳霜罐", "Cream jar"], b_drops: ["只要单油，不用调", "Just the oils, unmixed"],
  your_name: ["你的名字", "Your name"], contact: ["微信 / 电话 / 电邮", "WeChat / phone / email"], notes: ["备注（过敏、香味喜好、急不急）", "Notes (allergies, scent, timing)"],
  submit: ["提交配油申请", "Send request"], sent: ["已收到！我们会尽快联系你。", "Got it! We'll be in touch soon."], send_fail: ["提交失败，请稍后再试或直接联系我们。", "Couldn't send. Try again or contact us directly."],
  own_status: ["你已有", "You have"], need_buy: ["你未买过", "Not bought yet"],
  disclaimer: ["本站内容为日常芳香养护分享，不能代替医生诊断或治疗。孕妇、哺乳期、婴幼儿、正在服药或有病症者，使用前请咨询医生。敏感肌肤请先稀释并做局部测试。", "Content here is for everyday aromatic wellness and does not replace medical diagnosis or treatment. If pregnant, nursing, giving to young children, on medication or under a doctor's care, consult your doctor first. Dilute and patch test on sensitive skin."],
  independent: ["本站为 doTERRA 独立健康倡导者个人网站，非 doTERRA 官方网站。", "Independent doTERRA Wellness Advocate website, not the official doTERRA site."],
  flag_internal: ["含内服", "Internal use"], flag_eye_area: ["眼周使用，避开眼睛", "Near the eyes, avoid eyes"], flag_infant: ["婴幼儿配方，需充分稀释", "For little ones, dilute well"],
  flag_pregnancy_avoid: ["孕期避免", "Avoid in pregnancy"], flag_sensitive_area: ["敏感部位，先稀释测试", "Sensitive area, dilute and test"], flag_oral: ["口腔使用", "Oral use"], flag_hot_oil: ["含热性精油，务必稀释", "Contains hot oils, always dilute"],
  dilution: ["约稀释", "approx."],
  // 登入
  login_title: ["会员登入", "Member sign in"], login_sub: ["输入你登记的电邮，我们会寄一个 6 位验证码给你。", "Enter the email you registered with. We'll send you a 6-digit code."],
  email: ["电邮", "Email"], phone: ["电话", "Phone"], send_code: ["发送验证码", "Send code"], code: ["验证码", "Code"], verify: ["登入", "Sign in"], code_sent: ["验证码已寄出，请查收电邮。", "Code sent. Check your inbox."],
  use_phone: ["改用手机短信", "Use phone instead"], use_email: ["改用电邮", "Use email instead"], login_fail: ["登入失败：", "Sign-in failed: "],
  not_linked: ["这个账号还没有关联会员资料。请把你登入用的电邮或电话告诉我们，我们关联后你就能看到自己的记录。", "This sign-in isn't linked to a member record yet. Tell us the email or phone you used and we'll link it."],
  demo_login: ["演示登入", "Demo sign in"], demo_as_member: ["以会员 Venus 身份查看", "View as member Venus"], demo_as_admin: ["以管理员身份查看", "View as admin"],
  demo_banner: ["演示模式：资料只保存在这个浏览器，连接数据库后才会正式启用。", "Demo mode: data stays in this browser until the database is connected."],
  // 会员中心
  hello: ["你好", "Hi"], overview: ["总览", "Overview"], my_blends: ["我的配油", "My blends"], my_orders: ["购买记录", "Purchases"], my_needs: ["需求与进度", "Needs & progress"], my_team: ["我的团队", "My team"], my_requests: ["配油申请", "Blend requests"],
  points: ["积分", "Points"], balance: ["欠款", "Balance owed"], pv_month: ["本月 PV", "PV this month"], lrp_pv: ["本月 LRP PV", "LRP PV this month"], ov: ["组织业绩 OV", "Team OV"], lrp_months: ["连续 LRP 月数", "LRP months in a row"], legs: ["达标直属线", "Qualified legs"],
  data_as_of: ["数据月份", "Data for"], updated: ["更新于", "Updated"],
  member_level: ["会员等级", "Member level"], points_reward: ["积分回馈", "Points back"], rank: ["事业等级", "Rank"], bonus: ["奖金等级", "Bonus level"],
  next: ["下一级", "Next"], to_go: ["还差", "to go"], reached: ["已达到最高一级", "Top level reached"], current: ["目前", "Current"], none_yet: ["未达到", "Not yet"],
  months: ["个月", "months"], legs_u: ["条线", "legs"],
  blends_empty: ["还没有配油记录。", "No blends yet."], orders_empty: ["还没有购买记录。", "No purchases yet."], needs_empty: ["还没有记录。", "Nothing recorded yet."], team_empty: ["你名下暂时没有推荐的会员。", "No one in your team yet."],
  add_progress: ["记录我的近况", "Add an update"], progress_ph: ["例如：这周睡得好一点，肩颈还是紧……", "e.g. Sleeping better this week, shoulders still tight…"], post: ["提交", "Post"],
  status_open: ["跟进中", "In progress"], status_improving: ["有改善", "Improving"], status_resolved: ["已改善", "Resolved"],
  need: ["需求", "Need"], progress: ["进度", "Update"], by_me: ["我写的", "By me"], by_coach: ["顾问记录", "From your advisor"],
  share_health: ["让我的上线看到我的配油和需求记录", "Let my upline see my blends and needs"],
  req_new: ["已提交", "Received"], req_preparing: ["调配中", "Mixing"], req_ready: ["可取货", "Ready"], req_done: ["已完成", "Done"], req_cancelled: ["已取消", "Cancelled"],
  order: ["订单", "Order"], date: ["日期", "Date"], account: ["账户", "Account"], items: ["产品", "Items"], qty: ["数量", "Qty"], price: ["价格", "Price"], pv: ["PV", "PV"], reason: ["理由 / 备注", "Reason / note"], payment: ["付款", "Payment"],
  t_gift: ["赠品", "Gift"], t_kit: ["套组", "Kit"], t_bogo: ["买一送一", "BOGO"], t_points: ["积分兑换", "Points"], t_group: ["拼单", "Group buy"],
  team_size: ["团队人数", "Team size"], direct: ["直推", "Direct"], view: ["查看", "View"], back: ["返回", "Back"], downline_of: ["的团队", "'s team"],
  health_hidden: ["对方没有开放配油和需求记录。", "This member keeps blends and needs private."],
  owned_oils: ["买过的产品", "Products bought"], last: ["上次", "Last"],
  // 管理
  a_requests: ["配油申请", "Requests"], a_members: ["会员", "Members"], a_import: ["导入报表", "Import"], a_levels: ["等级规则", "Levels"], a_recipes: ["配方管理", "Recipes"],
  save: ["保存", "Save"], cancel: ["取消", "Cancel"], del: ["删除", "Delete"], edit: ["编辑", "Edit"], add: ["新增", "Add"], saved: ["已保存", "Saved"], confirm_del: ["确定删除？", "Delete this?"],
  new_member: ["新会员", "New member"], name: ["姓名", "Name"], sponsor: ["推荐人（上线）", "Sponsor (upline)"], doterra_id: ["doTERRA 会员号", "doTERRA ID"], joined: ["加入日期", "Joined"], member_type: ["身份", "Type"],
  mt_retail: ["零售客户", "Retail"], mt_wholesale: ["批发会员", "Wholesale"], mt_builder: ["事业会员", "Builder"], admin_notes: ["内部备注（客人看不到）", "Internal notes (hidden from member)"],
  status_edit: ["积分 / 欠款 / 业绩", "Points / balance / volume"], add_order: ["新增订单", "Add order"], add_blend: ["新增配油", "Add blend"], add_need: ["新增需求 / 进度", "Add need / update"],
  from_recipe: ["从配方套用", "Start from recipe"], title: ["名称", "Title"], purpose: ["用途", "Purpose"], feedback: ["效果回馈", "Feedback"], oil: ["精油", "Oil"], add_row: ["加一行", "Add row"],
  import_sub: ["上传从 doTERRA 后台导出的 Excel 或 CSV，按 doTERRA 会员号对应会员，更新积分、PV、OV、等级等。", "Upload an Excel or CSV export from doTERRA back office. Rows are matched by doTERRA ID to update points, PV, OV and rank."],
  choose_file: ["选择文件", "Choose file"], map_cols: ["对应栏位", "Match columns"], ignore: ["不导入", "Skip"], preview_rows: ["预览", "Preview"], do_import: ["开始导入", "Import"], imported: ["已导入", "Imported"], unmatched: ["找不到会员", "No matching member"],
  period: ["数据月份", "Period"], all_members: ["全部会员", "All members"], search: ["搜索", "Search"], status: ["状态", "Status"], kind: ["类型", "Type"], body: ["内容", "Details"], tags: ["标签", "Tags"],
  hidden: ["隐藏", "Hidden"], original_title: ["原始名称（仅后台）", "Original title (admin only)"], loading: ["载入中…", "Loading…"],
  met: ["已达标", "Met"],
  brand_sub: ["芳疗工作室", "Aromatherapy"], find_blend: ["按感受配油", "Find my blend"],
  foot_h: ["下次见", "Until next time"], foot_p: ["想调一瓶专属的？在任何一条配方按「一键配油」，留下你的情况，我们按你来配。", "Want something just for you? Tap “Mix this for me” on any blend, tell us about yourself, and we'll mix it for you."],
  levels_note: ["等级门槛按 doTERRA 公开资料预设，请对照 doTERRA 加拿大最新薪酬计划核对后再给会员看。改完按保存即生效。", "Thresholds are pre-filled from public doTERRA material. Check them against the current doTERRA Canada compensation plan before members see them."],
  review_flag: ["建议人工审阅", "Needs review"],
  load_fail: ["资料载入失败，请稍后再试。", "Couldn't load. Please try again."], forbidden: ["你没有权限查看这个页面。", "You don't have access to this page."],
};

const LangCtx = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => { try { return localStorage.getItem("yuen.lang") || "zhs"; } catch { return "zhs"; } });
  const [conv, setConv] = useState(null);
  useEffect(() => {
    try { localStorage.setItem("yuen.lang", lang); } catch {}
    document.documentElement.lang = lang === "en" ? "en" : lang === "zht" ? "zh-Hant" : "zh-Hans";
    if (lang === "zht" && !conv) {
      import("opencc-js/cn2t").then((m) => {
        const OpenCC = m.default || m;
        const c = OpenCC.Converter({ from: "cn", to: "hk" });
        setConv(() => c);
      }).catch(() => {});
    }
  }, [lang, conv]);
  const cv = useCallback((s) => (s == null ? "" : lang === "zht" && conv ? conv(String(s)) : String(s)), [lang, conv]);
  const t = useCallback((k) => { const v = S[k]; if (!v) return k; return lang === "en" ? v[1] : cv(v[0]); }, [lang, cv]);
  // pick: 双语字段 zh/en
  const pick = useCallback((zh, en) => (lang === "en" ? (en || zh || "") : cv(zh || en || "")), [lang, cv]);
  const value = useMemo(() => ({ lang, setLang, t, cv, pick, brand: lang === "en" ? BRAND.en : cv(BRAND.zh) }), [lang, t, cv, pick]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}
export const useLang = () => useContext(LangCtx);
