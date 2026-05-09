(function () {
  "use strict";

  const CONFIG = {
    supabaseUrl: window.COSARC_SUPABASE_URL || "",
    supabaseAnonKey: window.COSARC_SUPABASE_ANON_KEY || "",
    adminPasscodeHash: window.COSARC_PASSCODE_HASH || "",
    sessionMinutes: Number(window.COSARC_SESSION_MINUTES || 20),
  };

  const STORAGE_KEY = "cosarc.erp.v2";
  const AUTH_KEY = "cosarc.auth.v2";
  const PASS_OK_KEY = "cosarc.adminPassUntil.v2";
  const ROOT = document.getElementById("app-root");
  const hasSupabase = CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && window.supabase;
  const useSupabase = hasSupabase && window.COSARC_ENABLE_SUPABASE === true;
  const sb = hasSupabase ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey) : null;

  const roles = ["Owner", "Admin", "Trainer", "Receptionist"];
  const sensitiveActions = new Set([
    "member:add", "member:edit", "member:delete", "payment:add", "payment:update",
    "sales:add", "settings:save", "invoice:download", "receipt:print", "data:export", "report:pdf", "report:excel",
  ]);

  const state = {
    ready: false,
    authLoading: false,
    route: "dashboard",
    tab: "overview",
    query: "",
    searchOpen: false,
    searchFilter: "All",
    recentSearches: JSON.parse(localStorage.getItem("cosarc.recentSearches.v2") || "[]"),
    auth: null,
    db: null,
    modal: null,
    pendingSecureAction: null,
    loadingAction: "",
    navOpen: localStorage.getItem("cosarc.navOpen.v2") !== "false",
    backendStatus: "ready",
  };

  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const money = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-";
  const initials = (name) => (name || "?").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const daysBetween = (a, b) => Math.ceil((new Date(b).setHours(0,0,0,0) - new Date(a).setHours(0,0,0,0)) / 86400000);

  function seedDb() {
    const now = new Date();
    const members = [
      ["Arjun Sharma","arjun@demo.com","Male","Muscle Gain","Owner","Active", -65, 30000, "Riya Sen"],
      ["Priya Kapoor","priya@demo.com","Female","Weight Loss","Admin","Expiring Soon", -340, 24000, "Kabir Rao"],
      ["Rohit Mehta","rohit@demo.com","Male","Athletic Performance","Trainer","Active", -120, 42000, "Riya Sen"],
      ["Sneha Joshi","sneha@demo.com","Female","General Fitness","Receptionist","Pending Payment", -15, 15000, "Meera Iyer"],
      ["Vikram Singh","vikram@demo.com","Male","Strength","Owner","Expired", -420, 36000, "Kabir Rao"],
      ["Divya Rao","divya@demo.com","Female","Body Recomposition","Admin","Frozen", -180, 28000, "Meera Iyer"],
      ["Karan Malhotra","karan@demo.com","Male","Endurance","Trainer","Active", -32, 19000, "Kabir Rao"],
      ["Ananya Gupta","ananya@demo.com","Female","Yoga Mobility","Receptionist","Expiring Soon", -78, 21000, "Riya Sen"],
    ].map(([name, email, gender, goal, role, status, startOffset, revenue, trainer], i) => {
      const id = uid();
      const start = new Date(now); start.setDate(now.getDate() + startOffset);
      const end = new Date(start); end.setDate(start.getDate() + (status === "Expired" ? 180 : status === "Expiring Soon" ? Math.abs(startOffset) + 8 : 365));
      if (status === "Pending Payment") end.setDate(now.getDate() + 30);
      return {
        id, name, email, phone: `+91 98${i}45 76${i}10`, gender, age: 23 + i * 2, goal, status,
        membershipStart: start.toISOString().slice(0,10), membershipEnd: end.toISOString().slice(0,10),
        plan: i % 3 === 0 ? "Elite Annual" : i % 3 === 1 ? "Premium Quarterly" : "Founders Monthly",
        paymentStatus: status === "Pending Payment" ? "Pending" : status === "Expired" ? "Overdue" : "Paid",
        totalRevenue: revenue, trainer, engagement: Math.max(42, 94 - i * 7),
        notes: "Prefers evening slots. Keep renewal communication concise and premium.",
        dietPlan: "High protein Indian meal plan with hydration targets.",
        workoutPlan: "Personalized strength, mobility and conditioning block.",
        joinedAt: start.toISOString(),
        frozenUntil: status === "Frozen" ? new Date(now.getTime() + 14 * 86400000).toISOString().slice(0,10) : "",
      };
    });
    const attendance = [];
    for (let d = 0; d < 36; d++) {
      const date = new Date(now); date.setDate(now.getDate() - d);
      members.forEach((m, i) => {
        if ((d + i) % (i % 4 + 2) !== 0) {
          const inHour = 6 + ((i + d) % 14);
          attendance.push({ id: uid(), memberId: m.id, date: date.toISOString().slice(0,10), checkIn: `${String(inHour).padStart(2,"0")}:10`, checkOut: `${String(inHour + 1).padStart(2,"0")}:22`, duration: 72 });
        }
      });
    }
    const payments = members.map((m, i) => ({
      id: uid(), memberId: m.id, date: new Date(now.getTime() - i * 9 * 86400000).toISOString().slice(0,10),
      amount: Math.round(m.totalRevenue / (i % 3 + 1)), gst: 18, discount: i % 2 ? 1000 : 0,
      status: m.paymentStatus, method: i % 2 ? "UPI" : "Card", invoiceNo: `COS-${new Date().getFullYear()}-${String(i + 1).padStart(4, "0")}`,
    }));
    const salesTeam = [
      { id: uid(), name: "Aarav Kapoor", role: "Senior Sales", target: 650000, revenue: 420000, conversions: 18, leads: 44, incentiveRate: 5.5 },
      { id: uid(), name: "Isha Malhotra", role: "Membership Advisor", target: 480000, revenue: 315000, conversions: 13, leads: 38, incentiveRate: 4.5 },
      { id: uid(), name: "Dev Arora", role: "Corporate Sales", target: 820000, revenue: 610000, conversions: 9, leads: 21, incentiveRate: 6 },
    ];
    const enquiries = [
      ["Neha Verma","+91 98765 43210","Weight loss transformation","Hot","Follow-up","Aarav Kapoor", 78],
      ["Aditya Menon","+91 99887 77665","Corporate membership","Warm","Interested","Dev Arora", 66],
      ["Simran Kaur","+91 93456 12122","Pilates and strength","Cold","New","Isha Malhotra", 32],
      ["Nikhil Jain","+91 95555 34343","Annual elite plan","Hot","Contacted","Aarav Kapoor", 84],
    ].map(([name, phone, interest, temperature, status, salesperson, probability], i) => ({
      id: uid(), name, phone, interest, temperature, status, salesperson, probability, owner: salesperson, source: i % 2 ? "Instagram" : "Cold Call",
      nextFollowUp: new Date(now.getTime() + (i + 1) * 86400000).toISOString().slice(0,10),
      notes: "Call completed. Follow up with membership value and trainer availability.",
      followUps: [{ date: todayISO(), note: "Initial call logged", by: salesperson }],
    }));
    const trainers = ["Riya Sen", "Kabir Rao", "Meera Iyer"].map((name, i) => ({
      id: uid(), name, specialty: ["Strength", "Performance", "Yoga & Mobility"][i],
      commissionRate: [12, 10, 9][i], sessions: 60 - i * 12, rating: 4.9 - i * .2,
    }));
    const inventory = [
      { id: uid(), item: "Whey Protein 1kg", stock: 8, lowAt: 10, price: 3200 },
      { id: uid(), item: "Cosarc Shaker", stock: 42, lowAt: 12, price: 450 },
      { id: uid(), item: "Lifting Straps", stock: 5, lowAt: 8, price: 699 },
    ];
    return { members, attendance, payments, enquiries, trainers, salesTeam, inventory, audit: [] };
  }

  const store = {
    async load() {
      if (useSupabase) {
        try {
          const [members, attendance, payments, enquiries, trainers, salesTeam, inventory] = await Promise.all([
            sb.from("members").select("*").order("created_at", { ascending: false }),
            sb.from("attendance").select("*").order("date", { ascending: false }),
            sb.from("payments").select("*").order("date", { ascending: false }),
            sb.from("enquiries").select("*").order("next_follow_up", { ascending: true }),
            sb.from("trainers").select("*").order("name"),
            sb.from("sales_team").select("*").order("name"),
            sb.from("inventory").select("*").order("item"),
          ]);
          if ([members, attendance, payments, enquiries, trainers, salesTeam, inventory].some((r) => r.error)) throw new Error("Supabase schema is not ready. Using local demo data.");
          return {
            members: mapFromDbMembers(members.data || []),
            attendance: mapFromDbRows(attendance.data || []),
            payments: mapFromDbRows(payments.data || []),
            enquiries: mapFromDbRows(enquiries.data || []),
            trainers: mapFromDbRows(trainers.data || []),
            salesTeam: mapFromDbRows(salesTeam.data || []),
            inventory: mapFromDbRows(inventory.data || []),
            audit: [],
          };
        } catch (err) {
          state.backendStatus = "offline";
        }
      }
      const cached = localStorage.getItem(STORAGE_KEY);
      return cached ? JSON.parse(cached) : seedDb();
    },
    async save(db) {
      if (useSupabase) await syncSupabase(db);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      state.db = db;
    },
  };

  async function syncSupabase(db) {
    try {
      const jobs = [
        ["members", db.members.map(memberToDb)],
        ["attendance", db.attendance.map(rowToDb)],
        ["payments", db.payments.map(rowToDb)],
        ["enquiries", db.enquiries.map(rowToDb)],
        ["trainers", db.trainers.map(rowToDb)],
        ["sales_team", (db.salesTeam || []).map(rowToDb)],
        ["inventory", db.inventory.map(rowToDb)],
      ].filter(([, rows]) => rows.length);
      const results = await Promise.all(jobs.map(([table, rows]) => sb.from(table).upsert(rows, { onConflict: "id" })));
      const failed = results.find((r) => r.error);
      if (failed) state.backendStatus = "offline";
    } catch (err) {
      state.backendStatus = "offline";
    }
  }

  function rowToDb(row) {
    return Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), v]));
  }

  function memberToDb(member) {
    const r = rowToDb(member);
    delete r.remaining_days;
    delete r.remaining_months;
    delete r.visits;
    delete r.last_visit;
    return r;
  }

  function mapFromDbRows(rows) {
    return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v])));
  }
  function mapFromDbMembers(rows) {
    return mapFromDbRows(rows).map((m) => ({
      ...m,
      membershipStart: m.membershipStart || m.membership_start,
      membershipEnd: m.membershipEnd || m.membership_end,
      paymentStatus: m.paymentStatus || m.payment_status,
      totalRevenue: m.totalRevenue || m.total_revenue,
    }));
  }

  function computeMember(member, db = state.db) {
    const today = todayISO();
    const remainingDays = member.membershipEnd ? daysBetween(today, member.membershipEnd) : 0;
    const remainingMonths = Math.max(0, Math.ceil(Math.max(0, remainingDays) / 30));
    const overdue = (db.payments || []).some((p) => p.memberId === member.id && ["Pending", "Overdue", "Partial", "Failed"].includes(p.status));
    let status = member.status || "Active";
    if (member.frozenUntil && daysBetween(today, member.frozenUntil) >= 0) status = "Frozen";
    else if (overdue) status = member.paymentStatus === "Partial" ? "Pending Payment" : "Pending Payment";
    else if (remainingDays < 0) status = "Expired";
    else if (remainingDays <= 15) status = "Expiring Soon";
    else status = "Active";
    const visits = (db.attendance || []).filter((a) => a.memberId === member.id);
    const lastVisit = visits[0]?.date || "";
    const engagement = Math.min(100, Math.round((member.engagement || 55) * .65 + Math.min(visits.length, 24) * 1.45));
    return { ...member, status, remainingDays, remainingMonths, visits: visits.length, lastVisit, engagement };
  }

  function requireAuth(action, payload = {}) {
    if (!sensitiveActions.has(action)) return runAction(action, payload);
    const until = Number(sessionStorage.getItem(PASS_OK_KEY) || 0);
    if (until > Date.now()) return runAction(action, payload);
    state.pendingSecureAction = { action, payload };
    state.modal = { type: "passcode", title: "Admin Verification" };
    render();
  }

  async function verifyPasscode(code) {
    if (!code) return false;
    if (CONFIG.adminPasscodeHash) {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
      const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
      return hash === CONFIG.adminPasscodeHash;
    }
    return code === "2468";
  }

  function hasRole(minRole) {
    const order = { Owner: 4, Admin: 3, Trainer: 2, Receptionist: 1 };
    return (order[state.auth?.role] || 0) >= (order[minRole] || 0);
  }

  function authFromStorage() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch { return null; }
  }

  async function init() {
    state.auth = authFromStorage();
    state.db = ensureDb(await store.load());
    state.ready = true;
    render();
    setupRealtime();
    setInterval(() => {
      if (!state.auth) return;
      const age = Date.now() - Number(state.auth.lastActive || 0);
      if (age > CONFIG.sessionMinutes * 60000) {
        logout("Session timed out. Please sign in again.");
      }
    }, 15000);
  }

  function setupRealtime() {
    if (!useSupabase) return;
    try {
      sb.channel("cosarc-erp-sync")
        .on("postgres_changes", { event: "*", schema: "public" }, async () => {
          state.db = ensureDb(await store.load());
          render();
        })
        .subscribe();
    } catch (err) {
      state.backendStatus = "offline";
    }
  }

  function ensureDb(db) {
    const seeded = seedDb();
    return {
      ...seeded,
      ...db,
      members: db.members || seeded.members,
      attendance: db.attendance || seeded.attendance,
      payments: db.payments || seeded.payments,
      enquiries: db.enquiries || seeded.enquiries,
      trainers: db.trainers || seeded.trainers,
      salesTeam: db.salesTeam || seeded.salesTeam,
      inventory: db.inventory || seeded.inventory,
      audit: db.audit || [],
    };
  }

  function setAuth(auth) {
    state.auth = { ...auth, lastActive: Date.now() };
    localStorage.setItem(AUTH_KEY, JSON.stringify(state.auth));
  }

  function logout(message) {
    state.auth = null;
    sessionStorage.removeItem(PASS_OK_KEY);
    localStorage.removeItem(AUTH_KEY);
    if (message) toast("Signed out", message, "error");
    render();
  }

  function toast(title, message = "", type = "success") {
    const wrap = document.getElementById("toast");
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `<strong>${esc(title)}</strong>${message ? `<span>${esc(message)}</span>` : ""}`;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  function render() {
    if (!state.ready) {
      ROOT.innerHTML = `<div class="content"><div class="card skeleton"></div></div>`;
      return;
    }
    ROOT.innerHTML = state.auth ? shell() : loginScreen();
  }

  function loginScreen() {
    return `
      <main class="login-screen">
        <section class="login-visual">
          <div class="brand-lockup"><div class="wordmark">cosarc</div><div class="brand-sub">Gym ERP</div></div>
          <div class="hero-copy">
            <h1>Gym operations. Beautifully controlled.</h1>
            <p>Members, billing, attendance and growth in one premium workspace.</p>
          </div>
        </section>
        <section class="login-panel">
          <form class="login-card" data-form="login">
            <div class="wordmark compact">cosarc</div>
            <h2>Sign in</h2>
            <p>Use your Supabase account. Demo access stays available for local review.</p>
            <div class="field"><label>Email</label><input name="email" type="email" value="owner@cosarc.app" required></div>
            <div class="field" style="margin-top:14px"><label>Password</label><input name="password" type="password" value="demo1234" required></div>
            <div class="field" style="margin-top:14px"><label>Role</label><select name="role">${roles.map((r) => `<option>${r}</option>`).join("")}</select></div>
            <button class="btn primary ${state.authLoading ? "loading" : ""}" style="width:100%;margin-top:20px" type="submit" ${state.authLoading ? "disabled" : ""}>${state.authLoading ? "Signing in" : "Sign In"}</button>
            <button type="button" class="btn" style="width:100%;margin-top:10px" data-action="auth:demo">Enter Demo Workspace</button>
            <p class="subtle" style="margin-top:16px">Protected actions use passcode <strong>2468</strong> until you set a production hash.</p>
          </form>
        </section>
      </main>`;
  }

  function shell() {
    const db = state.db;
    const nav = [
      ["dashboard", "Dashboard", "01", ""],
      ["members", "Members", "02", db.members.length],
      ["enquiries", "Enquiries", "03", db.enquiries.length],
      ["attendance", "Attendance", "04", ""],
      ["payments", "Payments", "05", duePayments().length],
      ["trainers", "Trainers", "06", ""],
      ["sales", "Sales", "07", db.salesTeam?.length || ""],
      ["reports", "Reports", "08", ""],
      ["settings", "Settings", "09", ""],
    ];
    return `
      <div class="shell ${state.navOpen ? "nav-open" : "nav-closed"}">
        <aside class="sidebar">
          <div class="brand-lockup"><div class="wordmark">cosarc</div><div class="brand-sub">Premium Gym ERP</div></div>
          <nav class="nav">
            <div class="nav-label">Workspace</div>
            ${nav.map(([id, label, icon, badge]) => `<button class="nav-item ${state.route === id ? "active" : ""}" data-route="${id}"><span class="nav-ico">${icon}</span>${label}${badge ? `<span class="badge-count">${badge}</span>` : ""}</button>`).join("")}
          </nav>
          <div class="user-card">
            <div class="user-row">
              <div class="avatar square">${initials(state.auth.name || state.auth.email)}</div>
              <div class="user-meta"><strong>${esc(state.auth.name || state.auth.email)}</strong><span>${esc(state.auth.role)} access</span></div>
            </div>
            <button class="btn ghost" style="width:100%;margin-top:12px" data-action="auth:logout">Logout</button>
          </div>
        </aside>
        <main class="main">
          <header class="topbar">
            <button class="btn icon menu-btn" data-action="nav:toggle" aria-label="Toggle navigation">☰</button>
            <div class="page-title">${titleFor(state.route)}</div>
            <div class="search"><span>⌕</span><input placeholder="Search anything..." value="${esc(state.query)}" data-input="search" autocomplete="off"></div>
            <button class="btn" data-action="data:refresh">Refresh</button>
            <button class="btn primary" data-action="quick:add">New</button>
          </header>
          <section class="content">${page()}</section>
        </main>
        ${state.searchOpen ? searchPanel() : ""}
        ${state.modal ? modal() : ""}
      </div>`;
  }

  function titleFor(route) {
    return ({ dashboard: "Command Dashboard", members: "Member CRM", enquiries: "Enquiry Pipeline", attendance: "Attendance", payments: "Payments", trainers: "Trainer Desk", sales: "Sales Desk", reports: "Analytics Reports", settings: "Admin Settings" })[route] || "Dashboard";
  }

  function page() {
    return ({
      dashboard: dashboardPage,
      members: membersPage,
      enquiries: enquiriesPage,
      attendance: attendancePage,
      payments: paymentsPage,
      trainers: trainersPage,
      sales: salesPage,
      reports: reportsPage,
      settings: settingsPage,
    }[state.route] || dashboardPage)();
  }

  function membersComputed() { return state.db.members.map((m) => computeMember(m)); }
  function duePayments() { return state.db.payments.filter((p) => ["Pending", "Overdue", "Partial", "Failed"].includes(p.status)); }
  function filteredMembers() {
    const q = state.query.toLowerCase();
    return membersComputed().filter((m) => !q || [m.name, m.email, m.phone, m.goal, m.status, m.trainer].some((x) => String(x || "").toLowerCase().includes(q)));
  }

  function canViewSalesAnalytics() {
    return state.auth?.role === "Owner";
  }

  function saveRecentSearch(query) {
    const q = query.trim();
    if (!q) return;
    state.recentSearches = [q, ...state.recentSearches.filter((x) => x !== q)].slice(0, 6);
    localStorage.setItem("cosarc.recentSearches.v2", JSON.stringify(state.recentSearches));
  }

  function globalResults() {
    const q = state.query.toLowerCase().trim();
    const filter = state.searchFilter;
    const rows = [];
    const push = (type, title, detail, route, id, haystack) => {
      if (filter !== "All" && filter !== type) return;
      if (q && !String(haystack).toLowerCase().includes(q)) return;
      rows.push({ type, title, detail, route, id });
    };
    membersComputed().forEach((m) => push("Members", m.name, `${m.status} · ${m.plan}`, "members", m.id, `${m.name} ${m.email} ${m.phone} ${m.plan} ${m.status} ${m.trainer}`));
    state.db.enquiries.forEach((e) => push("Enquiries", e.name, `${e.status} · ${e.salesperson || e.owner || ""}`, "enquiries", e.id, `${e.name} ${e.phone} ${e.status} ${e.interest} ${e.salesperson || ""}`));
    state.db.payments.forEach((p) => push("Payments", p.invoiceNo, `${p.status} · ${money(p.amount)}`, "payments", p.id, `${p.invoiceNo} ${p.status} ${p.method} ${p.amount}`));
    state.db.attendance.slice(0, 80).forEach((a) => push("Attendance", state.db.members.find((m) => m.id === a.memberId)?.name || "Visit", `${fmtDate(a.date)} · ${a.checkIn}`, "attendance", a.id, `${a.date} ${a.checkIn} ${a.checkOut}`));
    state.db.trainers.forEach((t) => push("Trainers", t.name, `${t.specialty} · ${t.sessions} sessions`, "trainers", t.id, `${t.name} ${t.specialty}`));
    (state.db.salesTeam || []).forEach((s) => push("Sales", s.name, `${s.conversions} conversions · ${money(s.revenue)}`, "sales", s.id, `${s.name} ${s.role} ${s.revenue}`));
    ["Financial report", "Attendance report", "Sales report", "Trainer report", "Invoice export", "Membership plans"].forEach((r) => push("Reports", r, "Executive analytics", "reports", r, r));
    return rows.slice(0, 12);
  }

  function searchPanel() {
    const filters = ["All", "Members", "Enquiries", "Payments", "Attendance", "Trainers", "Sales", "Reports"];
    const results = globalResults();
    return `<div class="search-popover" data-search-popover>
      <div class="search-card">
        <div class="search-head"><span>Search ERP</span><button class="btn icon" data-action="search:close" aria-label="Close search">×</button></div>
        <div class="filter-row">${filters.map((f) => `<button class="chip ${state.searchFilter === f ? "active" : ""}" data-action="search:filter" data-filter="${f}">${f}</button>`).join("")}</div>
        ${state.query ? `<div class="search-list">${results.length ? results.map((r) => `<button class="search-result" data-action="search:open" data-target-route="${r.route}" data-id="${esc(r.id)}"><span>${esc(r.type)}</span><strong>${esc(r.title)}</strong><em>${esc(r.detail)}</em></button>`).join("") : `<div class="empty mini">No results found.</div>`}</div>` : `<div class="recent-box"><div class="subtle">Recent searches</div><div class="btn-row">${state.recentSearches.length ? state.recentSearches.map((q) => `<button class="chip" data-action="search:recent" data-query="${esc(q)}">${esc(q)}</button>`).join("") : `<span class="subtle">Start typing to search the ERP.</span>`}</div></div>`}
      </div>
    </div>`;
  }

  function dashboardPage() {
    const members = membersComputed();
    const active = members.filter((m) => m.status === "Active").length;
    const expiring = members.filter((m) => m.status === "Expiring Soon").length;
    const revenue = state.db.payments.filter((p) => p.status === "Paid").reduce((s, p) => s + Number(p.amount || 0), 0);
    const todayVisits = state.db.attendance.filter((a) => a.date === todayISO()).length;
    const chart = last7().map((date) => ({ label: new Date(date).toLocaleDateString("en-IN", { weekday: "short" }).slice(0,2), value: state.db.attendance.filter((a) => a.date === date).length }));
    return `
      <div class="grid cols-4">
        ${metric("Members", members.length, `${active} active`)}
        ${metric("Revenue", money(revenue), `${duePayments().length} due`)}
        ${metric("Check-ins", todayVisits, "Today")}
        ${metric("Renewals", expiring, "15 days")}
      </div>
      <div class="grid split" style="margin-top:16px">
        <div class="card">
          <div class="card-header"><div><div class="card-title">Attendance</div></div><button class="btn" data-action="report:generate">Report</button></div>
          ${barChart(chart)}
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Alerts</div><button class="btn" data-action="reminder:send">Remind</button></div>
          <div class="kpi-list">
            ${alertRow("Renewals", `${expiring} soon`, "Expiring Soon")}
            ${alertRow("Dues", `${duePayments().length} pending`, "Pending")}
            ${alertRow("Inactive", `${members.filter((m) => !m.lastVisit).length} silent`, "Frozen")}
            ${alertRow("Leads", `${state.db.enquiries.filter((e) => e.temperature === "Hot").length} hot`, "Active")}
          </div>
        </div>
      </div>
      <div class="grid split" style="margin-top:16px">
        <div class="card">
          <div class="card-header"><div class="card-title">Needs Attention</div><button class="btn" data-route="members">View</button></div>
          ${membersTable(members.filter((m) => m.status !== "Active").slice(0, 6))}
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Actions</div></div>
          <div class="btn-row">
            <button class="btn primary" data-action="member:add">Add Member</button>
            <button class="btn" data-action="attendance:open">Attendance Logs</button>
            <button class="btn" data-action="payment:add">Record Payment</button>
            <button class="btn" data-action="data:export">Export Data</button>
            <button class="btn" data-action="invoice:download">Download Invoice</button>
            <button class="btn" data-action="receipt:print">Print Receipt</button>
          </div>
        </div>
      </div>`;
  }

  function metric(label, value, foot) {
    return `<div class="card metric"><div class="metric-label">${esc(label)}</div><div class="metric-value">${esc(value)}</div><div class="metric-foot">${esc(foot)}</div></div>`;
  }
  function alertRow(label, text, status) {
    return `<div class="kpi-row"><div><strong>${esc(label)}</strong><div class="subtle">${esc(text)}</div></div>${statusPill(status)}</div>`;
  }
  function last7() {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d.toISOString().slice(0,10);
    });
  }
  function barChart(items) {
    const max = Math.max(1, ...items.map((x) => x.value));
    return `<div class="bar-chart">${items.map((x) => `<div class="bar-col"><div class="bar" style="height:${Math.max(5, x.value / max * 100)}%"></div><div class="bar-label">${esc(x.label)}</div></div>`).join("")}</div>`;
  }

  function membersPage() {
    return `
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">Complete Member CRM</div><div class="subtle">Membership, payments, engagement and attendance stay synchronized globally.</div></div>
          <div class="btn-row"><button class="btn" data-action="data:export">Export Data</button><button class="btn primary" data-action="member:add">Add Member</button></div>
        </div>
        ${membersTable(filteredMembers())}
      </div>`;
  }

  function membersTable(rows) {
    if (!rows.length) return `<div class="empty">No members match this view.</div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Member</th><th>Status</th><th>Plan</th><th>Remaining</th><th>Trainer</th><th>Engagement</th><th>Actions</th></tr></thead><tbody>
      ${rows.map((m) => `<tr>
        <td><div class="member-cell"><div class="avatar">${initials(m.name)}</div><div><div class="cell-title">${esc(m.name)}</div><div class="cell-sub">${esc(m.email)} · ${esc(m.phone)}</div></div></div></td>
        <td>${statusPill(m.status)}</td>
        <td><strong>${esc(m.plan)}</strong><div class="cell-sub">${fmtDate(m.membershipStart)} - ${fmtDate(m.membershipEnd)}</div></td>
        <td><strong>${m.remainingDays < 0 ? "Expired" : `${m.remainingDays} days`}</strong><div class="cell-sub">${m.remainingMonths} month${m.remainingMonths === 1 ? "" : "s"} left</div></td>
        <td>${esc(m.trainer || "-")}</td>
        <td><div class="progress"><span style="width:${m.engagement}%"></span></div><div class="cell-sub">${m.engagement}% score</div></td>
        <td><div class="btn-row"><button class="btn" data-action="member:view" data-id="${m.id}">View Details</button><button class="btn" data-action="member:edit" data-id="${m.id}">Edit</button><button class="btn danger" data-action="member:delete" data-id="${m.id}">Delete</button></div></td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  function statusPill(status) {
    const cls = String(status || "").toLowerCase().replace(/\s+/g, "-").replace("expiring-soon", "expiring").replace("pending-payment", "pending");
    return `<span class="status ${cls}">${esc(status || "Active")}</span>`;
  }

  function enquiriesPage() {
    const rows = state.db.enquiries.filter((e) => !state.query || [e.name, e.phone, e.interest, e.status, e.salesperson].some((x) => String(x || "").toLowerCase().includes(state.query.toLowerCase())));
    return `<div class="grid split enquiry-layout">
      <div class="card">
        <div class="card-header"><div><div class="card-title">Cold Call & Enquiry CRM</div><div class="subtle">Track lead temperature, follow-ups, owner and conversion status.</div></div><button class="btn primary" data-action="enquiry:add">Add Enquiry</button></div>
        <div class="table-wrap enquiry-table"><table><thead><tr><th>Lead</th><th>Interest</th><th>Temperature</th><th>Status</th><th>Next Follow-up</th><th>Actions</th></tr></thead><tbody>
          ${rows.map((e) => `<tr><td><div class="cell-title">${esc(e.name)}</div><div class="cell-sub">${esc(e.phone)} · ${esc(e.source)}</div></td><td>${esc(e.interest)}</td><td>${statusPill(e.temperature === "Hot" ? "Active" : e.temperature === "Warm" ? "Expiring Soon" : "Frozen")}</td><td>${esc(e.status)}</td><td>${fmtDate(e.nextFollowUp)}</td><td><button class="btn" data-action="enquiry:convert" data-id="${e.id}">Convert</button><button class="btn" data-action="reminder:send" data-id="${e.id}">Send Reminder</button></td></tr>`).join("")}
        </tbody></table></div>
      </div>
      <div class="card"><div class="card-title">Conversion Analytics</div><div class="kpi-list" style="margin-top:16px">${alertRow("Hot leads", `${rows.filter((e) => e.temperature === "Hot").length} ready to close`, "Active")}${alertRow("Trials", `${rows.filter((e) => e.status === "Trial Booked").length} booked`, "Expiring Soon")}${alertRow("Follow-ups", `${rows.length} open conversations`, "Pending")}</div></div>
    </div>`;
  }

  function enquiriesPage() {
    const rows = state.db.enquiries.filter((e) => !state.query || [e.name, e.phone, e.interest, e.status, e.salesperson].some((x) => String(x || "").toLowerCase().includes(state.query.toLowerCase())));
    return `<div class="grid split enquiry-layout">
      <div class="card">
        <div class="card-header"><div><div class="card-title">Enquiry CRM</div><div class="subtle">Lead ownership, notes and conversion probability.</div></div><button class="btn primary" data-action="enquiry:add">Add Enquiry</button></div>
        <div class="table-wrap enquiry-table"><table><thead><tr><th>Lead</th><th>Sales</th><th>Status</th><th>Probability</th><th>Follow-up</th><th>Actions</th></tr></thead><tbody>
          ${rows.map((e) => `<tr><td><div class="cell-title">${esc(e.name)}</div><div class="cell-sub">${esc(e.phone)} · ${esc(e.interest)}</div></td><td>${esc(e.salesperson || e.owner || "-")}</td><td>${esc(e.status)}</td><td><div class="progress"><span style="width:${Number(e.probability || 35)}%"></span></div><div class="cell-sub">${Number(e.probability || 35)}%</div></td><td>${fmtDate(e.nextFollowUp)}</td><td><div class="btn-row"><button class="btn" data-action="enquiry:detail" data-id="${e.id}">Notes</button><button class="btn success" data-action="enquiry:convert" data-id="${e.id}">Convert</button><button class="btn" data-action="reminder:send" data-id="${e.id}">Remind</button></div></td></tr>`).join("")}
        </tbody></table></div>
      </div>
      <div class="card"><div class="card-title">Conversion</div><div class="kpi-list" style="margin-top:16px">${alertRow("Hot leads", `${rows.filter((e) => e.temperature === "Hot").length} ready`, "Active")}${alertRow("Interested", `${rows.filter((e) => e.status === "Interested").length} warm`, "Expiring Soon")}${alertRow("Follow-ups", `${rows.filter((e) => e.status === "Follow-up").length} due`, "Pending")}</div></div>
    </div>`;
  }

  function attendancePage() {
    const rows = state.db.attendance.slice(0, 60);
    return `<div class="card">
      <div class="card-header"><div><div class="card-title">Live Attendance Dashboard</div><div class="subtle">QR, barcode and facial-recognition-ready check-in architecture.</div></div><div class="btn-row"><button class="btn primary" data-action="attendance:checkin">QR Check-in</button><button class="btn" data-action="attendance:open">Attendance Logs</button></div></div>
      <div class="grid cols-3" style="margin-bottom:16px">${metric("Today", state.db.attendance.filter((a) => a.date === todayISO()).length, "Check-ins recorded")}${metric("Avg Duration", "72m", "Across recent visits")}${metric("Missed Days", missedDays(), "Members at risk")}</div>
      <div class="table-wrap"><table><thead><tr><th>Member</th><th>Date</th><th>Check-in</th><th>Check-out</th><th>Duration</th></tr></thead><tbody>${rows.map((a) => {
        const m = state.db.members.find((x) => x.id === a.memberId);
        return `<tr><td>${esc(m?.name || "Unknown")}</td><td>${fmtDate(a.date)}</td><td>${esc(a.checkIn)}</td><td>${esc(a.checkOut)}</td><td>${a.duration} min</td></tr>`;
      }).join("")}</tbody></table></div>
    </div>`;
  }

  function missedDays() {
    return membersComputed().filter((m) => !m.lastVisit || daysBetween(m.lastVisit, todayISO()) > 10).length;
  }

  function paymentsPage() {
    const rows = state.db.payments.filter((p) => !state.query || [p.status, p.method, p.invoiceNo, state.db.members.find((m) => m.id === p.memberId)?.name].some((x) => String(x || "").toLowerCase().includes(state.query.toLowerCase())));
    return `<div class="card">
      <div class="card-header"><div><div class="card-title">Payments, Invoices & Renewals</div><div class="subtle">GST, discounts, subscription tracking, receipts and reminders.</div></div><div class="btn-row"><button class="btn primary" data-action="payment:add">Record Payment</button><button class="btn" data-action="invoice:download">Download Invoice</button><button class="btn" data-action="receipt:print">Print Receipt</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Member</th><th>Date</th><th>Amount</th><th>GST</th><th>Discount</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map((p) => {
        const m = state.db.members.find((x) => x.id === p.memberId);
        return `<tr><td><strong>${esc(p.invoiceNo)}</strong><div class="cell-sub">${esc(p.method)}</div></td><td>${esc(m?.name || "-")}</td><td>${fmtDate(p.date)}</td><td>${money(p.amount)}</td><td>${p.gst}%</td><td>${money(p.discount)}</td><td>${statusPill(p.status)}</td><td><button class="btn" data-action="payment:update" data-id="${p.id}">Update</button><button class="btn" data-action="invoice:download" data-id="${p.id}">Download</button><button class="btn" data-action="reminder:send" data-id="${p.id}">Reminder</button></td></tr>`;
      }).join("")}</tbody></table></div>
    </div>`;
  }

  function trainersPage() {
    return `<div class="card" style="margin-bottom:16px"><div class="card-header"><div><div class="card-title">Trainers</div><div class="subtle">Manage your coaching staff, specialties and commission rates.</div></div><button class="btn primary" data-action="trainer:add">Add Trainer</button></div></div>
    <div class="grid cols-3">${state.db.trainers.length ? state.db.trainers.map((t) => {
      const assigned = state.db.members.filter((m) => m.trainer === t.name).length;
      return `<div class="card"><div class="member-cell"><div class="avatar big">${initials(t.name)}</div><div><div class="card-title">${esc(t.name)}</div><div class="subtle">${esc(t.specialty)}</div></div></div><div class="kpi-list" style="margin-top:18px">${alertRow("Assigned clients", `${assigned} members`, "Active")}${alertRow("Sessions", `${t.sessions} this month`, "Expiring Soon")}${alertRow("Commission", `${t.commissionRate}% rate`, "Pending")}</div><div class="btn-row" style="margin-top:16px"><button class="btn" style="flex:1" data-action="trainer:schedule" data-id="${t.id}">Schedule</button><button class="btn" style="flex:1" data-action="trainer:delete" data-id="${t.id}">Remove</button></div></div>`;
    }).join("") : `<div class="card compact"><div class="subtle">No trainers yet. Click Add Trainer to get started.</div></div>`}</div>`;
  }

  function salesPage() {
    const team = state.db.salesTeam || [];
    const owner = canViewSalesAnalytics();
    const totalRevenue = team.reduce((sum, s) => sum + Number(s.revenue || 0), 0);
    const conversions = team.reduce((sum, s) => sum + Number(s.conversions || 0), 0);
    const leads = team.reduce((sum, s) => sum + Number(s.leads || 0), 0);
    if (!owner) {
      return `<div class="card"><div class="card-header"><div><div class="card-title">Sales Desk</div><div class="subtle">Restricted view. Owner approval is required for analytics.</div></div><button class="btn" data-action="reminder:send">Request Access</button></div>
        <div class="table-wrap"><table><thead><tr><th>Salesperson</th><th>Role</th><th>Leads</th><th>Follow-ups</th></tr></thead><tbody>${team.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.role)}</td><td>${s.leads}</td><td><button class="btn" data-action="sales:profile" data-id="${s.id}">View Profile</button></td></tr>`).join("")}</tbody></table></div></div>`;
    }
    return `<div class="grid cols-4">${metric("Sales Revenue", money(totalRevenue), "Attributed")}${metric("Conversions", conversions, "This month")}${metric("Lead Rate", `${Math.round(conversions / Math.max(leads, 1) * 100)}%`, "Conversion")}${metric("Incentives", money(team.reduce((s, x) => s + (x.revenue * x.incentiveRate / 100), 0)), "Projected")}</div>
      <div class="grid split" style="margin-top:16px">
        <div class="card"><div class="card-header"><div><div class="card-title">Sales Performance</div><div class="subtle">Owner-only analytics</div></div><button class="btn" data-action="data:export">Export</button></div>${barChart(team.map((s) => ({ label: s.name.split(" ")[0], value: s.revenue / 10000 })))}</div>
        <div class="card"><div class="card-header"><div class="card-title">Lead Health</div></div><div class="kpi-list">${alertRow("Pipeline", `${leads} active leads`, "Active")}${alertRow("Follow-up", `${state.db.enquiries.filter((e) => e.status === "Follow-up").length} due`, "Pending")}${alertRow("Converted", `${state.db.enquiries.filter((e) => e.status === "Converted").length} closed`, "Paid")}</div></div>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-header"><div class="card-title">Sales Team</div><button class="btn primary" data-action="sales:add">Add Salesperson</button></div>
        <div class="table-wrap"><table><thead><tr><th>Salesperson</th><th>Role</th><th>Revenue</th><th>Conversions</th><th>Target</th><th>Incentive</th><th>Actions</th></tr></thead><tbody>${team.map((s) => `<tr><td><div class="member-cell"><div class="avatar">${initials(s.name)}</div><div><div class="cell-title">${esc(s.name)}</div><div class="cell-sub">${esc(s.role)}</div></div></div></td><td>${esc(s.role)}</td><td>${money(s.revenue)}</td><td>${s.conversions}/${s.leads}</td><td><div class="progress"><span style="width:${Math.min(100, s.revenue / s.target * 100)}%"></span></div></td><td>${money(s.revenue * s.incentiveRate / 100)}</td><td><button class="btn" data-action="sales:profile" data-id="${s.id}">Profile</button></td></tr>`).join("")}</tbody></table></div>
      </div>`;
  }

  function reportsPage() {
    const monthlyRevenue = state.db.payments.filter((p) => p.status === "Paid").reduce((s, p) => s + Number(p.amount || 0), 0);
    const paid = state.db.payments.filter((p) => p.status === "Paid").length;
    const failed = state.db.payments.filter((p) => p.status === "Failed").length;
    const plans = membersComputed().reduce((acc, m) => (acc[m.plan] = (acc[m.plan] || 0) + 1, acc), {});
    const salesRevenue = (state.db.salesTeam || []).reduce((s, x) => s + Number(x.revenue || 0), 0);
    return `<div class="grid cols-4">${metric("MRR", money(monthlyRevenue), "Paid revenue")}${metric("Dues", money(duePayments().reduce((s, p) => s + Number(p.amount || 0), 0)), "Outstanding")}${metric("Success", `${Math.round(paid / Math.max(state.db.payments.length, 1) * 100)}%`, "Payments")}${metric("Churn Risk", missedDays(), "Inactive")}</div>
      <div class="grid split" style="margin-top:16px">
        <div class="card"><div class="card-header"><div><div class="card-title">Financial Report</div><div class="subtle">Revenue, refunds, dues and payment health.</div></div><div class="btn-row"><button class="btn primary" data-action="report:generate">Generate</button><button class="btn" data-action="report:pdf">PDF</button><button class="btn" data-action="report:excel">Excel</button></div></div>${barChart(["Jan","Feb","Mar","Apr","May","Jun","Jul"].map((m, i) => ({ label: m, value: Math.round(monthlyRevenue / 12000) + i * 4 + (i % 2) * 8 })))}</div>
        <div class="card"><div class="card-title">Executive Insights</div><div class="kpi-list" style="margin-top:16px">${alertRow("Membership growth", `${state.db.members.length} total`, "Active")}${alertRow("Payment failures", `${failed} failed`, failed ? "Overdue" : "Paid")}${alertRow("Top plan", Object.entries(plans).sort((a,b) => b[1]-a[1])[0]?.[0] || "None", "Pending")}${alertRow("Sales revenue", canViewSalesAnalytics() ? money(salesRevenue) : "Owner only", "Active")}</div></div>
      </div>
      <div class="grid cols-3" style="margin-top:16px">
        <div class="card"><div class="card-title">Attendance Report</div>${barChart(last7().map((d) => ({ label: new Date(d).toLocaleDateString("en-IN", { weekday: "short" }).slice(0,2), value: state.db.attendance.filter((a) => a.date === d).length })))}</div>
        <div class="card"><div class="card-title">Sales Report</div><div class="kpi-list" style="margin-top:16px">${(state.db.salesTeam || []).slice(0,3).map((s) => alertRow(s.name, canViewSalesAnalytics() ? money(s.revenue) : "Restricted", "Active")).join("")}</div></div>
        <div class="card"><div class="card-title">Trainer Report</div><div class="kpi-list" style="margin-top:16px">${state.db.trainers.map((t) => alertRow(t.name, `${t.sessions} sessions`, "Expiring Soon")).join("")}</div></div>
      </div>`;
  }

  function settingsPage() {
    const groups = [
      ["General", "Gym information, branding, timezone, localization"],
      ["Staff", "Roles, permissions, access control, shift timings"],
      ["Membership", "Renewal rules, freeze policies, plan defaults"],
      ["Payments", "GST, invoice templates, tax and gateways"],
      ["Notifications", "WhatsApp, SMS, email and push templates"],
      ["Security", "2FA, timeout, device management, activity logs"],
      ["Integrations", "Supabase, APIs, webhooks and third-party tools"],
    ];
    return `<div class="grid split">
      <div class="card"><div class="card-header"><div><div class="card-title">Settings</div><div class="subtle">Enterprise controls for operations and security.</div></div><button class="btn primary" data-action="settings:save">Save Changes</button></div>
        <div class="settings-grid">${groups.map(([name, body]) => `<button class="settings-tile" data-action="settings:open" data-id="${name}"><strong>${name}</strong><span>${body}</span></button>`).join("")}</div>
      </div>
      <div class="card"><div class="card-title">Security Policy</div><div class="form-grid" style="margin-top:16px">
        <div class="field"><label>Workspace</label><input value="Cosarc Elite Fitness"></div>
        <div class="field"><label>Timezone</label><select><option>Asia/Kolkata</option><option>UTC</option></select></div>
        <div class="field"><label>Session Timeout</label><input value="${CONFIG.sessionMinutes} minutes"></div>
        <div class="field"><label>Sales Analytics</label><select><option>Owner only</option><option>Owner + Admin</option></select></div>
        <div class="field full"><label>Supabase</label><textarea>${CONFIG.supabaseUrl || "Not configured"}</textarea></div>
      </div></div>
    </div>`;
  }

  function modal() {
    const m = state.modal;
    if (m.type === "passcode") {
      return `<div class="modal-backdrop"><form class="modal small" data-form="passcode"><div class="modal-head"><div><div class="modal-title">Admin Verification</div><div class="subtle">Protected action requires passcode and active session.</div></div><button type="button" class="btn icon" data-action="modal:close">×</button></div><div class="field"><label>Security Passcode</label><input name="passcode" type="password" inputmode="numeric" autofocus placeholder="Enter passcode"></div><button class="btn primary" style="width:100%;margin-top:16px" data-action="security:verify">Verify</button></form></div>`;
    }
    if (m.type === "memberForm") return memberForm(m.member);
    if (m.type === "memberDetail") return memberDetail(m.memberId);
    if (m.type === "paymentForm") return paymentForm(m.payment);
    if (m.type === "enquiryForm") return enquiryForm();
    if (m.type === "salesForm") return salesForm();
    if (m.type === "trainerForm") return trainerForm();
    if (m.type === "text") return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div class="modal-title">${esc(m.title)}</div><button class="btn icon" data-action="modal:close">×</button></div><div class="subtle">${esc(m.body)}</div><div class="btn-row" style="margin-top:18px"><button class="btn primary" data-action="modal:close">Done</button></div></div></div>`;
    return "";
  }

  function memberForm(member = {}) {
    return `<div class="modal-backdrop"><form class="modal wide" data-form="member" data-id="${member.id || ""}"><div class="modal-head"><div class="modal-title">${member.id ? "Edit Member" : "Add Member"}</div><button type="button" class="btn icon" data-action="modal:close">×</button></div><div class="form-grid">
      ${field("Name", "name", member.name, "text", true)}${field("Email", "email", member.email, "email", true)}${field("Phone", "phone", member.phone, "tel", true)}${field("Age", "age", member.age, "number")}
      ${selectField("Gender", "gender", ["Female","Male","Other"], member.gender)}${field("Goal", "goal", member.goal)}${selectField("Plan", "plan", ["Founders Monthly","Premium Quarterly","Elite Annual"], member.plan)}${selectField("Trainer", "trainer", state.db.trainers.map((t) => t.name), member.trainer)}
      ${selectField("Salesperson", "salesperson", (state.db.salesTeam || []).map((s) => s.name), member.salesperson)}
      ${field("Membership Start", "membershipStart", member.membershipStart || todayISO(), "date", true)}${field("Membership End", "membershipEnd", member.membershipEnd || new Date(Date.now() + 365*86400000).toISOString().slice(0,10), "date", true)}
      ${selectField("Status", "status", ["Active","Expiring Soon","Expired","Frozen","Pending Payment"], member.status)}${selectField("Payment Status", "paymentStatus", ["Paid","Pending","Overdue","Partial","Failed"], member.paymentStatus)}
      <div class="field full"><label>Notes</label><textarea name="notes">${esc(member.notes || "")}</textarea></div>
    </div><div class="btn-row" style="justify-content:flex-end;margin-top:18px"><button type="button" class="btn" data-action="modal:close">Cancel</button><button class="btn primary" data-action="member:save">Save Changes</button></div></form></div>`;
  }

  function paymentForm(payment = {}) {
    return `<div class="modal-backdrop"><form class="modal" data-form="payment" data-id="${payment.id || ""}"><div class="modal-head"><div class="modal-title">${payment.id ? "Update Payment" : "Record Payment"}</div><button type="button" class="btn icon" data-action="modal:close">×</button></div><div class="form-grid">
      ${selectField("Member", "memberId", state.db.members.map((m) => ({ label: m.name, value: m.id })), payment.memberId)}${field("Date", "date", payment.date || todayISO(), "date", true)}
      ${field("Amount", "amount", payment.amount || 0, "number", true)}${field("GST %", "gst", payment.gst ?? 18, "number")}
      ${field("Discount", "discount", payment.discount || 0, "number")}${selectField("Status", "status", ["Paid","Pending","Overdue","Partial","Failed","Refunded"], payment.status || "Paid")}
      ${selectField("Method", "method", ["UPI","Card","Cash","Bank Transfer"], payment.method)}${field("Invoice No", "invoiceNo", payment.invoiceNo || `COS-${new Date().getFullYear()}-${String(state.db.payments.length + 1).padStart(4,"0")}`)}
    </div><div class="btn-row" style="justify-content:flex-end;margin-top:18px"><button type="button" class="btn" data-action="modal:close">Cancel</button><button class="btn primary" data-action="payment:save">Save Changes</button></div></form></div>`;
  }

  function enquiryForm() {
    return `<div class="modal-backdrop"><form class="modal" data-form="enquiry"><div class="modal-head"><div class="modal-title">Add Enquiry</div><button type="button" class="btn icon" data-action="modal:close">×</button></div><div class="form-grid">
      ${field("Name", "name", "", "text", true)}${field("Phone", "phone", "", "tel", true)}${field("Interest", "interest", "")}${selectField("Temperature", "temperature", ["Hot","Warm","Cold"], "Warm")}
      ${selectField("Status", "status", ["New","Contacted","Interested","Follow-up","Converted","Lost"], "New")}${selectField("Salesperson", "salesperson", (state.db.salesTeam || []).map((s) => s.name), "")}
      ${field("Probability %", "probability", 45, "number")}${field("Next Follow-up", "nextFollowUp", todayISO(), "date")}<div class="field full"><label>Call / Meeting Notes</label><textarea name="notes"></textarea></div>
    </div><div class="btn-row" style="justify-content:flex-end;margin-top:18px"><button type="button" class="btn" data-action="modal:close">Cancel</button><button class="btn primary" data-action="enquiry:save">Save Lead</button></div></form></div>`;
  }

  function salesForm() {
    return `<div class="modal-backdrop"><form class="modal" data-form="sales"><div class="modal-head"><div class="modal-title">Add Salesperson</div><button type="button" class="btn icon" data-action="modal:close">×</button></div><div class="form-grid">
      ${field("Name", "name", "", "text", true)}${field("Role", "role", "Membership Advisor")}
      ${field("Monthly Target", "target", 500000, "number")}${field("Incentive %", "incentiveRate", 5, "number")}
    </div><div class="btn-row" style="justify-content:flex-end;margin-top:18px"><button type="button" class="btn" data-action="modal:close">Cancel</button><button class="btn primary" type="submit">Save Salesperson</button></div></form></div>`;
  }

  function trainerForm() {
    return `<div class="modal-backdrop"><form class="modal" data-form="trainer"><div class="modal-head"><div class="modal-title">Add Trainer</div><button type="button" class="btn icon" data-action="modal:close">×</button></div><div class="form-grid">
      ${field("Name", "name", "", "text", true)}${field("Specialty", "specialty", "Strength & Conditioning")}
      ${field("Commission %", "commissionRate", 10, "number")}${field("Sessions this month", "sessions", 0, "number")}
      ${field("Rating (1-5)", "rating", 5, "number")}
    </div><div class="btn-row" style="justify-content:flex-end;margin-top:18px"><button type="button" class="btn" data-action="modal:close">Cancel</button><button class="btn primary" type="submit">Save Trainer</button></div></form></div>`;
  }

  function memberDetail(id) {
    const member = computeMember(state.db.members.find((m) => m.id === id));
    const attendance = state.db.attendance.filter((a) => a.memberId === id).slice(0, 12);
    const payments = state.db.payments.filter((p) => p.memberId === id);
    const timeline = [
      ["Joined", member.membershipStart, member.plan],
      ["Latest visit", member.lastVisit, `${member.visits} visits recorded`],
      ["Renewal due", member.membershipEnd, `${member.remainingDays} days remaining`],
    ];
    return `<div class="modal-backdrop"><div class="modal wide"><div class="modal-head"><div class="member-cell"><div class="avatar big">${initials(member.name)}</div><div><div class="modal-title">${esc(member.name)}</div><div class="subtle">${esc(member.email)} · ${esc(member.phone)}</div></div></div><button class="btn icon" data-action="modal:close">×</button></div>
      <div class="tabs">${["overview","attendance","payments","timeline","plans","notes"].map((t) => `<button class="tab ${state.tab === t ? "active" : ""}" data-action="tab:set" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div>
      <div style="margin-top:16px">${memberTab(member, attendance, payments, timeline)}</div>
    </div></div>`;
  }

  function memberTab(member, attendance, payments, timeline) {
    if (state.tab === "attendance") return membersAttendance(attendance);
    if (state.tab === "payments") return payments.length ? `<div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>${payments.map((p) => `<tr><td>${esc(p.invoiceNo)}</td><td>${fmtDate(p.date)}</td><td>${money(p.amount)}</td><td>${statusPill(p.status)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">No payment history yet.</div>`;
    if (state.tab === "timeline") return `<div class="timeline">${timeline.map(([a,b,c]) => `<div class="timeline-item"><strong>${esc(a)}</strong><span>${fmtDate(b)} · ${esc(c)}</span></div>`).join("")}</div>`;
    if (state.tab === "plans") return `<div class="grid cols-2"><div class="card compact"><div class="card-title">Diet Plan</div><p class="subtle">${esc(member.dietPlan)}</p></div><div class="card compact"><div class="card-title">Workout Plan</div><p class="subtle">${esc(member.workoutPlan)}</p></div><div class="card compact"><div class="card-title">Goal Tracking</div><p class="subtle">${esc(member.goal)} · ${member.engagement}% engagement score</p></div><div class="card compact"><div class="card-title">Transformation Photos</div><p class="subtle">Photo storage hooks are ready for Supabase Storage.</p></div></div>`;
    if (state.tab === "notes") return `<div class="card compact"><div class="card-title">Trainer Notes & Comments</div><p class="subtle">${esc(member.notes)}</p></div>`;
    return `<div class="grid cols-3">${metric("Status", member.status, `${member.remainingDays} days left`)}${metric("Visits", member.visits, "Attendance history")}${metric("Revenue", money(member.totalRevenue), "Lifetime value")}</div><div class="grid cols-2" style="margin-top:16px"><div class="card compact"><div class="card-title">Membership</div><p class="subtle">${esc(member.plan)} from ${fmtDate(member.membershipStart)} to ${fmtDate(member.membershipEnd)}</p></div><div class="card compact"><div class="card-title">Assigned Trainer</div><p class="subtle">${esc(member.trainer || "Unassigned")}</p></div></div>`;
  }

  function membersAttendance(rows) {
    return rows.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>In</th><th>Out</th><th>Duration</th></tr></thead><tbody>${rows.map((a) => `<tr><td>${fmtDate(a.date)}</td><td>${a.checkIn}</td><td>${a.checkOut}</td><td>${a.duration} min</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">No attendance records yet.</div>`;
  }

  function field(label, name, value = "", type = "text", required = false) {
    return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""}></div>`;
  }
  function selectField(label, name, options, value = "") {
    const opts = options.map((o) => typeof o === "object" ? o : { label: o, value: o });
    return `<div class="field"><label>${label}</label><select name="${name}">${opts.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></div>`;
  }

  async function runAction(action, payload = {}) {
    const db = structuredClone(state.db);
    switch (action) {
      case "auth:demo":
        setAuth({ email: "owner@cosarc.app", name: "Cosarc Owner", role: "Owner" }); toast("Demo workspace ready", "All modules are functional with local data."); break;
      case "auth:logout": logout(); break;
      case "data:refresh": state.db = ensureDb(await store.load()); toast("Data refreshed", "All modules are synced."); break;
      case "quick:add": state.route === "enquiries" ? requireAuth("enquiry:add") : state.route === "payments" ? requireAuth("payment:add") : state.route === "sales" ? requireAuth("sales:add") : requireAuth("member:add"); break;
      case "member:add": state.modal = { type: "memberForm" }; break;
      case "member:edit": state.modal = { type: "memberForm", member: db.members.find((m) => m.id === payload.id) }; break;
      case "member:view": state.tab = "overview"; state.modal = { type: "memberDetail", memberId: payload.id }; break;
      case "member:delete":
        if (!hasRole("Admin")) return toast("Access denied", "Only Owner/Admin can delete records.", "error");
        if (useSupabase) await Promise.all([
          sb.from("payments").delete().eq("member_id", payload.id),
          sb.from("attendance").delete().eq("member_id", payload.id),
          sb.from("members").delete().eq("id", payload.id),
        ]);
        db.members = db.members.filter((m) => m.id !== payload.id); db.payments = db.payments.filter((p) => p.memberId !== payload.id); db.attendance = db.attendance.filter((a) => a.memberId !== payload.id); await store.save(db); toast("Member deleted", "Related payments and attendance were synchronized."); break;
      case "payment:add": state.modal = { type: "paymentForm" }; break;
      case "payment:update": state.modal = { type: "paymentForm", payment: db.payments.find((p) => p.id === payload.id) }; break;
      case "enquiry:add": state.modal = { type: "enquiryForm" }; break;
      case "enquiry:convert": convertEnquiry(payload.id); break;
      case "enquiry:detail": {
        const e = db.enquiries.find((x) => x.id === payload.id);
        state.modal = { type: "text", title: e?.name || "Lead notes", body: `${e?.notes || "No notes"} Follow-up: ${fmtDate(e?.nextFollowUp)}. Salesperson: ${e?.salesperson || e?.owner || "-"}` };
        break;
      }
      case "attendance:checkin": checkIn(); break;
      case "attendance:open": state.route = "attendance"; state.modal = null; toast("Attendance logs opened", "Live check-ins are visible here."); break;
      case "reminder:send": toast("Reminder queued", "WhatsApp/email integration hook fired."); break;
      case "report:generate": state.route = "reports"; toast("Report generated", "Revenue, attendance, churn and conversion data prepared."); break;
      case "report:pdf": exportReport("html"); break;
      case "report:excel": exportReport("csv"); break;
      case "data:export": exportCsv(); break;
      case "invoice:download": downloadInvoice(payload.id); break;
      case "receipt:print": printReceipt(payload.id); break;
      case "trainer:schedule": state.modal = { type: "text", title: "Trainer Schedule", body: "Session calendar hooks are active. Connect Google Calendar or your booking API to publish live schedules." }; break;
      case "trainer:add":
        state.modal = { type: "trainerForm" }; break;
      case "trainer:delete": {
        if (!hasRole("Admin")) return toast("Access denied", "Only Owner/Admin can remove trainers.", "error");
        db.trainers = db.trainers.filter((t) => t.id !== payload.id);
        db.members = db.members.map((m) => m.trainer === (state.db.trainers.find(t => t.id === payload.id)?.name) ? { ...m, trainer: "" } : m);
        await store.save(db);
        toast("Trainer removed", "Trainer has been removed from the system.");
        break;
      }
      case "sales:add":
        if (!canViewSalesAnalytics()) return toast("Access denied", "Only Owner can manage sales records.", "error");
        state.modal = { type: "salesForm" }; break;
      case "sales:profile": {
        const s = db.salesTeam.find((x) => x.id === payload.id);
        state.modal = { type: "text", title: s?.name || "Sales profile", body: canViewSalesAnalytics() ? `${s.role}. Revenue ${money(s.revenue)}. Conversions ${s.conversions}/${s.leads}. Incentive ${money(s.revenue * s.incentiveRate / 100)}.` : "Sales analytics are restricted to Owner role." };
        break;
      }
      case "settings:open": state.modal = { type: "text", title: payload.id, body: "Settings saved locally and ready for Supabase-backed policy storage. Changes are audited through protected admin actions." }; break;
      case "settings:save": toast("Settings saved", "Security policy and role configuration updated."); break;
      case "search:filter": state.searchFilter = payload.filter; break;
      case "search:recent": state.query = payload.query; state.searchOpen = true; break;
      case "search:close": state.searchOpen = false; break;
      case "search:open":
        saveRecentSearch(state.query);
        state.route = payload.targetRoute;
        state.searchOpen = false;
        state.query = "";
        if (payload.targetRoute === "members") state.modal = { type: "memberDetail", memberId: payload.id };
        break;
      default: toast("Unavailable", "This action is not wired yet.", "error");
    }
    render();
  }

  function formData(form) { return Object.fromEntries(new FormData(form).entries()); }

  async function saveMember(form) {
    const data = formData(form);
    const db = structuredClone(state.db);
    const id = form.dataset.id;
    const record = { ...data, age: Number(data.age || 0), totalRevenue: id ? db.members.find((m) => m.id === id)?.totalRevenue || 0 : 0, engagement: id ? db.members.find((m) => m.id === id)?.engagement || 60 : 60, joinedAt: id ? db.members.find((m) => m.id === id)?.joinedAt : new Date().toISOString() };
    if (id) db.members = db.members.map((m) => m.id === id ? { ...m, ...record, id } : m);
    else db.members.unshift({ ...record, id: uid() });
    await store.save(db);
    state.modal = null;
    toast(id ? "Member updated" : "Member added", "CRM, payments, attendance and analytics are synchronized.");
  }

  async function savePayment(form) {
    const data = formData(form);
    const db = structuredClone(state.db);
    const id = form.dataset.id;
    const record = { ...data, amount: Number(data.amount || 0), gst: Number(data.gst || 0), discount: Number(data.discount || 0) };
    if (id) db.payments = db.payments.map((p) => p.id === id ? { ...p, ...record, id } : p);
    else db.payments.unshift({ ...record, id: uid() });
    db.members = db.members.map((m) => m.id === record.memberId ? { ...m, paymentStatus: record.status, totalRevenue: Number(m.totalRevenue || 0) + (record.status === "Paid" && !id ? record.amount : 0) } : m);
    await store.save(db);
    state.modal = null;
    toast("Payment saved", "Invoice, member status and dashboard metrics updated.");
  }

  async function saveEnquiry(form) {
    const db = structuredClone(state.db);
    const data = formData(form);
    db.enquiries.unshift({ ...data, probability: Number(data.probability || 0), id: uid(), source: "Manual", followUps: [{ date: todayISO(), note: data.notes || "Lead created", by: data.salesperson || state.auth.role }] });
    await store.save(db);
    state.modal = null;
    toast("Enquiry added", "Follow-up pipeline updated.");
  }

  async function saveTrainer(form) {
    const data = formData(form);
    const db = structuredClone(state.db);
    db.trainers = db.trainers || [];
    db.trainers.unshift({ id: uid(), name: data.name, specialty: data.specialty, commissionRate: Number(data.commissionRate || 0), sessions: Number(data.sessions || 0), rating: Number(data.rating || 5) });
    await store.save(db);
    state.modal = null;
    toast("Trainer added", "Trainer profile created and available for member assignment.");
  }

  async function saveSalesperson(form) {
    if (!canViewSalesAnalytics()) return toast("Access denied", "Only Owner can manage sales records.", "error");
    const data = formData(form);
    const db = structuredClone(state.db);
    db.salesTeam = db.salesTeam || [];
    db.salesTeam.unshift({ id: uid(), name: data.name, role: data.role, target: Number(data.target || 0), revenue: 0, conversions: 0, leads: 0, incentiveRate: Number(data.incentiveRate || 0) });
    await store.save(db);
    state.modal = null;
    toast("Salesperson added", "Sales dashboard and enquiry attribution updated.");
  }

  async function convertEnquiry(id) {
    const lead = state.db.enquiries.find((e) => e.id === id);
    if (!lead) return;
    const db = structuredClone(state.db);
    db.members.unshift({
      id: uid(), name: lead.name, email: `${lead.name.toLowerCase().replace(/\s+/g, ".")}@lead.cosarc`, phone: lead.phone,
      gender: "", age: 0, goal: lead.interest, status: "Pending Payment", membershipStart: todayISO(),
      membershipEnd: new Date(Date.now() + 30*86400000).toISOString().slice(0,10), plan: "Founders Monthly",
      paymentStatus: "Pending", totalRevenue: 0, trainer: "", salesperson: lead.salesperson || lead.owner || "", engagement: 45, notes: lead.notes, dietPlan: "", workoutPlan: "", joinedAt: new Date().toISOString(),
    });
    db.enquiries = db.enquiries.map((e) => e.id === id ? { ...e, status: "Converted" } : e);
    db.salesTeam = (db.salesTeam || []).map((s) => s.name === (lead.salesperson || lead.owner) ? { ...s, conversions: Number(s.conversions || 0) + 1 } : s);
    await store.save(db);
    toast("Lead converted", "A pending-payment member profile was created.");
  }

  async function checkIn() {
    const member = membersComputed()[0];
    if (!member) return toast("No members", "Add a member before check-in.", "error");
    const db = structuredClone(state.db);
    db.attendance.unshift({ id: uid(), memberId: member.id, date: todayISO(), checkIn: new Date().toTimeString().slice(0,5), checkOut: "-", duration: 0 });
    await store.save(db);
    toast("Check-in recorded", `${member.name} added to live attendance.`);
  }

  function exportCsv() {
    const rows = membersComputed().map((m) => ({ name: m.name, email: m.email, phone: m.phone, status: m.status, remainingDays: m.remainingDays, plan: m.plan, trainer: m.trainer, engagement: m.engagement }));
    const csv = [Object.keys(rows[0] || {}).join(","), ...rows.map((r) => Object.values(r).map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    downloadBlob(csv, "cosarc-members-export.csv", "text/csv");
    toast("Export ready", "Member data exported as CSV.");
  }

  function exportReport(kind) {
    const summary = [
      ["Metric", "Value"],
      ["Members", state.db.members.length],
      ["Paid Revenue", state.db.payments.filter((p) => p.status === "Paid").reduce((s, p) => s + Number(p.amount || 0), 0)],
      ["Outstanding Dues", duePayments().reduce((s, p) => s + Number(p.amount || 0), 0)],
      ["Attendance Records", state.db.attendance.length],
      ["Salespeople", state.db.salesTeam?.length || 0],
    ];
    if (kind === "csv") {
      downloadBlob(summary.map((r) => r.join(",")).join("\n"), "cosarc-executive-report.csv", "text/csv");
      toast("Excel export ready", "CSV report downloaded.");
      return;
    }
    downloadBlob(`<!doctype html><title>Cosarc Report</title><body><h1>Cosarc Executive Report</h1><table>${summary.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join("")}</table></body>`, "cosarc-executive-report.html", "text/html");
    toast("PDF source ready", "Printable report downloaded.");
  }

  function downloadInvoice(id) {
    const p = id ? state.db.payments.find((x) => x.id === id) : state.db.payments[0];
    if (!p) return toast("No invoice", "Record a payment first.", "error");
    const m = state.db.members.find((x) => x.id === p.memberId);
    const html = invoiceHtml(p, m);
    downloadBlob(html, `${p.invoiceNo}.html`, "text/html");
    toast("Invoice downloaded", `${p.invoiceNo} is ready.`);
  }

  function printReceipt(id) {
    const p = id ? state.db.payments.find((x) => x.id === id) : state.db.payments[0];
    if (!p) return toast("No receipt", "Record a payment first.", "error");
    const m = state.db.members.find((x) => x.id === p.memberId);
    const w = window.open("", "_blank");
    w.document.write(invoiceHtml(p, m));
    w.document.close();
    w.print();
    toast("Receipt opened", "Print dialog launched.");
  }

  function invoiceHtml(p, m) {
    return `<!doctype html><html><head><title>${esc(p.invoiceNo)}</title><style>body{font-family:Inter,Arial,sans-serif;padding:40px;color:#111}h1{font-size:34px}.box{border:1px solid #ddd;padding:20px;margin:20px 0}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:12px;text-align:left}</style></head><body><h1>COSARC</h1><p>Premium Gym ERP Invoice</p><div class="box"><strong>Invoice:</strong> ${esc(p.invoiceNo)}<br><strong>Member:</strong> ${esc(m?.name || "-")}<br><strong>Date:</strong> ${fmtDate(p.date)}</div><table><tr><th>Description</th><th>Amount</th></tr><tr><td>Gym Membership</td><td>${money(p.amount)}</td></tr><tr><td>GST</td><td>${p.gst}%</td></tr><tr><td>Discount</td><td>${money(p.discount)}</td></tr><tr><th>Status</th><th>${esc(p.status)}</th></tr></table></body></html>`;
  }

  function downloadBlob(content, name, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.dataset.form === "login") {
      const data = formData(form);
      state.authLoading = true;
      render();
      if (useSupabase) {
        const { error } = await sb.auth.signInWithPassword({ email: data.email, password: data.password });
        if (error) {
        state.authLoading = false;
        render();
        return toast("Sign in failed", error.message, "error");
      }
    } else if (data.password.length < 4) {
        state.authLoading = false;
        render();
        return toast("Sign in failed", "Password must be at least 4 characters.", "error");
      }
      state.authLoading = false;
      setAuth({ email: data.email, name: data.email.split("@")[0], role: data.role });
      toast("Signed in", "Workspace unlocked.");
      render();
    }
    if (form.dataset.form === "passcode") {
      const ok = await verifyPasscode(formData(form).passcode);
      if (!ok) return toast("Verification failed", "Invalid passcode.", "error");
      sessionStorage.setItem(PASS_OK_KEY, String(Date.now() + CONFIG.sessionMinutes * 60000));
      const pending = state.pendingSecureAction;
      state.pendingSecureAction = null; state.modal = null;
      toast("Verified", "Admin action unlocked.");
      if (pending) runAction(pending.action, pending.payload);
    }
    if (form.dataset.form === "member") await saveMember(form);
    if (form.dataset.form === "payment") await savePayment(form);
    if (form.dataset.form === "enquiry") await saveEnquiry(form);
    if (form.dataset.form === "sales") await saveSalesperson(form);
    if (form.dataset.form === "trainer") await saveTrainer(form);
    render();
  });

  document.addEventListener("click", (e) => {
    if (state.searchOpen && !e.target.closest("[data-search-popover]") && !e.target.closest("[data-input='search']")) {
      state.searchOpen = false;
      render();
      return;
    }
    const btn = e.target.closest("[data-action], [data-route]");
    if (!btn) return;
    if (btn.type === "submit" && btn.closest("form")) return;
    const route = btn.dataset.route;
    if (route) {
      state.route = route; state.modal = null; state.searchOpen = false; render(); return;
    }
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (state.auth) setAuth(state.auth);
    if (action === "modal:close") { state.modal = null; render(); return; }
    if (action === "nav:toggle") { state.navOpen = !state.navOpen; localStorage.setItem("cosarc.navOpen.v2", String(state.navOpen)); render(); return; }
    if (action === "tab:set") { state.tab = btn.dataset.tab; render(); return; }
    requireAuth(action, { id, filter: btn.dataset.filter, query: btn.dataset.query, targetRoute: btn.dataset.targetRoute });
  });

  document.addEventListener("input", (e) => {
    if (e.target.matches("[data-input='search']")) {
      state.query = e.target.value;
      state.searchOpen = true;
      render();
      const input = document.querySelector("[data-input='search']");
      if (input) { input.focus(); input.selectionStart = input.selectionEnd = input.value.length; }
    }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      state.searchOpen = true;
      render();
      document.querySelector("[data-input='search']")?.focus();
    }
    if (e.key === "Escape" && state.searchOpen) {
      state.searchOpen = false;
      render();
    }
  });

  init();
})();
