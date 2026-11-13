/*
 * Laar Guide v0.1 — the talking website guide for laardigital.com
 *
 * One <script type="module"> tag before </body>:
 *   <script type="module" src="/assets/js/laar-guide/laar-guide.js"
 *           data-agent-id="agent_xxx"></script>
 *
 * With no data-agent-id (or data-demo="true") it runs a silent demo, so the
 * look and the tour can be approved before anything connects to ElevenLabs.
 * The ElevenLabs SDK is only downloaded when a visitor taps a choice.
 */

const script = document.currentScript || document.querySelector('script[src*="laar-guide"]');
const data = (script && script.dataset) || {};
const CFG = Object.assign(
  {
    agentId: data.agentId || "",
    demo: data.demo === "true" || !data.agentId,
    bookingUrl: data.bookingUrl || "https://laardigital.plutio.com/p/scheduler/83AQ3ARknm6LKweMD",
    privacyUrl: "/privacy/",
    autoOpenMs: Number(data.autoOpenMs || 4000),
    skipPaths: ["/privacy/", "/terms/"],
    pages: ["/", "/how-it-works/", "/plans/", "/who-we-serve/", "/about/", "/contact/", "/faq/"],
    noNav: data.noNav === "true",       // test sites with only one page
    sdkUrl: data.sdkUrl || "",          // load the ElevenLabs SDK from a CDN instead of /chunks
  },
  window.LAAR_GUIDE || {}
);

/* ---------- where things are on the page ---------- */
// The agent uses these ids. Each is found by id, data-guide, a selector, or its heading.
const SECTIONS = {
  hero: { sel: "section.hero", name: "Strategy into motion" },
  problem: { h: "QUIET ONLINE", name: "Great in person. Quiet online." },
  system: { sel: "#system", name: "Look. Plan. Shoot. Post. Grow." },
  included: { h: "NOT A MENU", name: "One system, not a menu" },
  plans: { sel: "#plans", name: "Plans" },
  founding: { h: "50% OFF", name: "Founding client offer" },
  first_10_days: { h: "FIRST 10 DAYS", name: "Your first 10 days" },
  rules: { h: "NO FAKE PROOF", name: "Rules we keep" },
  next_step: { h: "NEXT MOVE", name: "Next step" },
};

function findSection(id) {
  const def = SECTIONS[id] || {};
  let el =
    document.getElementById(id) ||
    document.querySelector(`[data-guide="${CSS.escape(id)}"]`) ||
    (def.sel && document.querySelector(def.sel));
  if (!el && def.h) {
    const head = [...document.querySelectorAll("h1,h2,h3")].find((x) =>
      x.textContent.toUpperCase().includes(def.h)
    );
    el = head && (head.closest("section") || head);
  }
  return el || null;
}
const sectionsHere = () => Object.keys(SECTIONS).filter((id) => findSection(id)).join(", ") || "none";

/* ---------- small helpers ---------- */
const store = {
  get(k) { try { return JSON.parse(sessionStorage.getItem("laarGuide:" + k)); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem("laarGuide:" + k, JSON.stringify(v)); } catch {} },
  del(k) { try { sessionStorage.removeItem("laarGuide:" + k); } catch {} },
};
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = () => matchMedia("(max-width: 640px)").matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function track(action, detail = {}) {
  const payload = { action, ...detail };
  window.dispatchEvent(new CustomEvent("laar-guide", { detail: payload }));
  if (Array.isArray(window.dataLayer)) window.dataLayer.push({ event: "laar_guide", ...payload });
}

/* ---------- section highlight (lives in the page, outside the widget) ---------- */
const pageStyle = document.createElement("style");
pageStyle.textContent = `
  .lg-focus{position:relative}
  .lg-focus::after{content:"";position:absolute;inset:10px;border-radius:var(--r-lg,28px);
    box-shadow:0 0 0 2px var(--orange,#FF7A2F),0 0 40px rgb(255 122 47 / .25);
    pointer-events:none;animation:lgFocus 6s var(--ease,ease) forwards;z-index:5}
  @keyframes lgFocus{0%{opacity:0}8%{opacity:1}80%{opacity:1}100%{opacity:0}}
  @media (prefers-reduced-motion: reduce){.lg-focus::after{animation:none;opacity:1}}
`;
document.head.appendChild(pageStyle);

function showSection(id) {
  const el = findSection(id);
  if (!el) return false;
  document.querySelectorAll(".lg-focus").forEach((x) => x.classList.remove("lg-focus"));
  const bar = [...document.querySelectorAll("header, nav, .nav, [class*='navbar']")].find((x) => {
    const pos = getComputedStyle(x).position;
    return (pos === "fixed" || pos === "sticky") && x.getBoundingClientRect().top <= 1;
  });
  const offset = (bar ? bar.getBoundingClientRect().height : 0) + 8;
  window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - offset, behavior: reduced ? "auto" : "smooth" });
  void el.offsetWidth;
  el.classList.add("lg-focus");
  setTimeout(() => el.classList.remove("lg-focus"), 6500);
  return true;
}

/* ---------- what the guide says first, per path ---------- */
const OPENINGS = {
  business: "Hi, I'm Laar's AI guide. Let's talk about your business. What do you run, and where?",
  tour: "Hi, I'm Laar's AI guide. Here's the two-minute tour. Stop me anytime with a question.",
  find: "Hi, I'm Laar's AI guide. What are you looking for today?",
  continue: "I'm back. We're on the {page} page now. What would you like to know?",
};

/* ---------- client tools: the agent's hands on the page ---------- */
// Names and parameters must match the tools set up in ElevenLabs exactly.
let conv = null;
const tools = {
  scrollToSection: ({ section_id }) => {
    const ok = showSection(section_id);
    track("section", { section_id, ok });
    return ok
      ? `Showing "${(SECTIONS[section_id] || {}).name || section_id}".`
      : `That section isn't on this page. Sections here: ${sectionsHere()}.`;
  },
  goToPage: ({ path }) => {
    if (CFG.noNav) return "This test site only has the homepage. Answer from the knowledge base instead, and offer to book a call.";
    if (!CFG.pages.includes(path)) return `Unknown page. Pages: ${CFG.pages.join(", ")}.`;
    if (path === location.pathname) return "The visitor is already on that page.";
    store.set("resume", { at: Date.now(), from: location.pathname });
    track("go_to_page", { path });
    setTimeout(() => { location.href = path; }, 2200); // let the agent finish its sentence
    return `Opening ${path}. The conversation pauses while the page loads; the visitor can tap Continue there.`;
  },
  openBooking: () => {
    window.open(CFG.bookingUrl, "_blank", "noopener");
    track("booking_opened");
    return "The booking page is open in a new tab.";
  },
};

/* ---------- the widget ---------- */
const CSS_TEXT = `
:host{all:initial;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --n:var(--navy,#0E1E3A);--nd:var(--navy-deep,#091428);--b:var(--bone,#F4F1EC);--o:var(--orange,#FF7A2F);
  --e:var(--ease,cubic-bezier(.2,.7,.1,1));color:var(--b)}
*{box-sizing:border-box;margin:0;font-family:inherit}
.wrap{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;gap:12px}
.card{width:360px;max-width:calc(100vw - 24px);background:rgb(14 30 58 / .92);
  -webkit-backdrop-filter:blur(24px);backdrop-filter:blur(24px);
  border:1px solid rgb(244 241 236 / .14);border-radius:24px;padding:22px 22px 18px;
  box-shadow:inset 0 1px 0 rgb(244 241 236 / .22),0 24px 60px -20px rgba(0,0,0,.7),0 40px 80px -40px rgb(255 122 47 / .18);
  transform:translateY(16px);opacity:0;transition:transform .42s var(--e),opacity .42s var(--e)}
.card.in{transform:none;opacity:1}
.top{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.orb{width:40px;height:40px;border-radius:50%;flex:none;position:relative;
  background:radial-gradient(circle at 35% 30%,#FFB38A 0%,var(--o) 45%,#B93A0A 100%);
  box-shadow:0 0 0 1px rgb(244 241 236 / .2),0 0 24px rgb(255 122 47 / .35)}
.orb.lg{width:56px;height:56px}
.orb.speaking{animation:pulse 1.1s ease-in-out infinite}
.orb.listening{animation:breathe 2.4s ease-in-out infinite}
.orb.connecting{animation:spin 1.2s linear infinite;background:conic-gradient(var(--o),rgb(255 122 47 / .15),var(--o))}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12);box-shadow:0 0 0 1px rgb(244 241 236 / .2),0 0 40px rgb(255 122 47 / .6)}}
@keyframes breathe{0%,100%{opacity:.85}50%{opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
.x{margin-left:auto;align-self:flex-start;background:none;border:0;color:rgb(244 241 236 / .6);font-size:22px;line-height:1;cursor:pointer;padding:4px 6px;border-radius:8px}
.x:hover{color:var(--b)}
h2{font-size:19px;font-weight:800;letter-spacing:-.01em;line-height:1.2}
.sub{font-size:14.5px;line-height:1.45;color:rgb(244 241 236 / .76);margin:2px 0 16px}
.btn{display:block;width:100%;text-align:left;font-size:15px;font-weight:700;padding:13px 18px;border-radius:999px;cursor:pointer;
  border:1px solid rgb(244 241 236 / .18);background:rgb(244 241 236 / .06);color:var(--b);margin-top:8px;
  transition:background .22s var(--e),transform .14s var(--e)}
.btn:hover{background:rgb(244 241 236 / .12)}
.btn:active{transform:scale(.98)}
.btn.primary{background:var(--b);color:var(--n);border-color:transparent}
.btn.primary:hover{background:#fff}
.btn:focus-visible,.x:focus-visible,.seg button:focus-visible,.pill:focus-visible,.ctl:focus-visible,input:focus-visible{outline:2px solid var(--b);outline-offset:2px}
.seg{display:inline-flex;background:rgb(9 20 40 / .6);border-radius:999px;padding:3px;margin-top:14px}
.seg button{border:0;background:none;color:rgb(244 241 236 / .7);font-size:13px;font-weight:700;padding:7px 14px;border-radius:999px;cursor:pointer}
.seg button[aria-pressed="true"]{background:rgb(244 241 236 / .14);color:var(--b)}
.fine{font-size:12px;line-height:1.45;color:rgb(244 241 236 / .54);margin-top:12px}
.fine a{color:rgb(244 241 236 / .76)}
.live .status{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgb(244 241 236 / .6)}
.caps{min-height:72px;max-height:180px;overflow:auto;margin:6px 0 12px;font-size:15.5px;line-height:1.5}
.caps p{margin-top:8px}
.caps .you{color:rgb(244 241 236 / .6);font-size:14px}
.caps .demo{color:var(--o);font-size:13px}
.row{display:flex;gap:8px;align-items:center}
input{flex:1;min-width:0;font-size:15px;padding:12px 16px;border-radius:999px;border:1px solid rgb(244 241 236 / .18);background:rgb(9 20 40 / .55);color:var(--b)}
input::placeholder{color:rgb(244 241 236 / .45)}
.ctl{flex:none;border:1px solid rgb(244 241 236 / .18);background:rgb(244 241 236 / .06);color:var(--b);height:44px;min-width:44px;padding:0 14px;border-radius:999px;font-size:13px;font-weight:700;cursor:pointer}
.ctl.send{background:rgb(244 241 236 / .14)}
.ctl[aria-pressed="true"]{background:rgb(249 112 102 / .2);border-color:rgb(249 112 102 / .5)}
.book{margin-top:10px}
.pill{display:flex;align-items:center;gap:10px;background:rgb(14 30 58 / .92);-webkit-backdrop-filter:blur(24px);backdrop-filter:blur(24px);
  border:1px solid rgb(244 241 236 / .16);color:var(--b);border-radius:999px;padding:8px 18px 8px 8px;font-size:15px;font-weight:700;cursor:pointer;
  box-shadow:0 18px 40px -18px rgba(0,0,0,.7)}
.pill .orb{width:32px;height:32px}
.pill.nudge .orb{animation:pulse 1.6s ease-in-out 3}
[hidden]{display:none!important}
@media (max-width:640px){
  .wrap{right:12px;left:12px;bottom:12px;align-items:stretch}
  .card{width:auto;max-width:none}
  .pill{align-self:flex-end}
}
@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}
`;

const host = document.createElement("div");
host.id = "laar-guide";
const root = host.attachShadow({ mode: "open" });
root.innerHTML = `<style>${CSS_TEXT}</style>
<div class="wrap">
  <section class="card" id="welcome" role="dialog" aria-label="Laar's guide" hidden>
    <div class="top"><div class="orb" aria-hidden="true"></div>
      <div><h2>Hi, I'm Laar's guide.</h2></div>
      <button class="x" data-act="close" aria-label="Close the guide">×</button></div>
    <p class="sub">Want a quick tour, or should we talk about your business?</p>
    <button class="btn primary" data-path="business">Tell me about my business</button>
    <button class="btn" data-path="tour">Give me the tour</button>
    <button class="btn" data-path="find">Help me find something</button>
    <div class="seg" role="group" aria-label="How do you want to chat?">
      <button data-mode="voice" aria-pressed="true">Talk</button>
      <button data-mode="text" aria-pressed="false">Type instead</button>
    </div>
    <p class="fine">You're chatting with Laar's AI guide. Chats are recorded and transcribed so we can reply. <a href="${CFG.privacyUrl}">Privacy</a></p>
  </section>

  <section class="card live" id="live" role="dialog" aria-label="Conversation with Laar's guide" hidden>
    <div class="top"><div class="orb lg" id="orb" aria-hidden="true"></div>
      <div><h2>Laar's guide</h2><p class="status" id="status">Connecting…</p></div>
      <button class="x" data-act="end" aria-label="End the conversation">×</button></div>
    <div class="caps" id="caps" aria-live="polite"></div>
    <form class="row" id="form">
      <input id="msg" autocomplete="off" placeholder="Type a message" aria-label="Type a message">
      <button class="ctl send" type="submit">Send</button>
      <button class="ctl" type="button" id="mute" aria-pressed="false" aria-label="Mute microphone">Mute</button>
    </form>
    <button class="btn primary book" data-act="book">Book a call</button>
  </section>

  <button class="pill" id="pill" hidden><span class="orb" aria-hidden="true"></span><span id="pillText">Talk to Laar</span></button>
</div>`;
document.body.appendChild(host);

const $ = (id) => root.getElementById(id);
const welcome = $("welcome"), live = $("live"), pill = $("pill"), caps = $("caps"), orb = $("orb"), statusEl = $("status");
let mode = "voice";

function show(el) { el.hidden = false; requestAnimationFrame(() => el.classList.add("in")); }
function hide(el) { el.classList.remove("in"); el.hidden = true; }
function setStatus(text, orbState) { statusEl.textContent = text; orb.className = "orb lg " + (orbState || ""); }
function say(text, who = "agent") {
  const p = document.createElement("p");
  if (who === "user") p.className = "you";
  if (who === "demo") p.className = "demo";
  p.textContent = who === "user" ? `You: ${text}` : text;
  caps.appendChild(p);
  while (caps.children.length > 6) caps.firstChild.remove();
  caps.scrollTop = caps.scrollHeight;
}

root.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.mode) {
    mode = t.dataset.mode;
    root.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b === t)));
  } else if (t.dataset.path) start(t.dataset.path);
  else if (t.dataset.act === "close") { hide(welcome); store.set("dismissed", true); showPill(); track("dismissed"); }
  else if (t.dataset.act === "end") end();
  else if (t.dataset.act === "book") tools.openBooking();
  else if (t.id === "pill") {
    hide(pill);
    if (store.get("resume")) { store.del("resume"); start("continue"); }
    else { show(welcome); if (e.detail === 0) welcome.querySelector(".btn.primary").focus(); }
  } else if (t.id === "mute" && conv && conv.setMicMuted) {
    const m = t.getAttribute("aria-pressed") !== "true";
    conv.setMicMuted(m); t.setAttribute("aria-pressed", String(m)); t.textContent = m ? "Unmute" : "Mute";
  }
});
root.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!live.hidden) end(); else if (!welcome.hidden) { hide(welcome); showPill(); }
});
$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("msg").value.trim();
  if (!v) return;
  $("msg").value = "";
  say(v, "user");
  if (conv) conv.sendUserMessage(v);
  else if (CFG.demo) say("Demo mode: once the ElevenLabs agent is connected, I'll answer here.", "demo");
});

function showPill(text) {
  $("pillText").textContent = text || (store.get("resume") ? "Continue with the guide" : "Talk to Laar");
  show(pill);
}

/* ---------- starting and ending ---------- */
async function start(path) {
  hide(welcome); hide(pill); show(live);
  caps.innerHTML = "";
  $("mute").hidden = mode !== "voice";
  track("start", { path, mode });
  const page = document.title.split("|")[0].trim() || location.pathname;
  const opening = OPENINGS[path].replace("{page}", page);

  if (CFG.demo) return runDemo(path, opening);

  let useMode = mode;
  if (useMode === "voice") {
    setStatus("Allow the microphone to talk", "connecting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      useMode = "text"; $("mute").hidden = true;
      say("No microphone? No problem. Type below and I'll answer here.", "demo");
    }
  }
  setStatus("Connecting…", "connecting");
  try {
    const { Conversation } = CFG.sdkUrl ? await import(CFG.sdkUrl) : await import("@elevenlabs/client");
    conv = await Conversation.startSession({
      agentId: CFG.agentId,
      textOnly: useMode === "text",
      dynamicVariables: {
        path, opening, page_path: location.pathname, page_title: page, sections_here: sectionsHere(),
      },
      clientTools: tools,
      onConnect: () => setStatus(useMode === "text" ? "Connected" : "Listening", "listening"),
      onModeChange: ({ mode: m }) => {
        if (useMode === "text") return;
        setStatus(m === "speaking" ? "Speaking" : "Listening", m);
      },
      onMessage: (p) => {
        const role = p.role || (p.source === "ai" ? "agent" : "user");
        if (role === "user" && useMode === "text") return; // typed text is already shown
        say(p.message, role === "agent" ? "agent" : "user");
      },
      onError: (msg) => { console.warn("[laar-guide]", msg); },
      onDisconnect: () => { conv = null; setStatus("Ended", ""); },
    });
  } catch (err) {
    console.warn("[laar-guide]", err);
    setStatus("Couldn't connect", "");
    say("Sorry, I couldn't connect just now. You can still book a call below.", "demo");
    track("error", { message: String(err && err.message || err) });
  }
}

async function end() {
  demoRun++;
  track("end");
  const c = conv; conv = null;
  if (c) { try { await c.endSession(); } catch {} }
  hide(live); showPill();
}

/* ---------- demo mode: the clickable mock-up ---------- */
const TOUR = [
  ["hero", "Laar Digital turns your marketing strategy into motion. One connected system, every month."],
  ["problem", "Most owners we meet are great in person, but quiet online. That's the gap we close."],
  ["system", "Here's how it works: Look, Plan, Shoot, Post, Grow."],
  ["included", "It's one system, not a menu of add-ons."],
  ["plans", "Three plans, one price each. I can help you pick the one that fits."],
  ["founding", "Right now there's a founding-client offer. Here are the details."],
  ["first_10_days", "This is what your first ten days look like."],
  ["rules", "And these are the rules we keep."],
  ["next_step", "When you're ready, book a call with the team. Want me to open the booking page?"],
];
let demoRun = 0;
async function runDemo(path, opening) {
  const run = ++demoRun;
  setStatus("Demo · Connecting…", "connecting");
  await sleep(700);
  if (run !== demoRun) return;
  setStatus("Demo · Speaking", "speaking");
  say(opening);
  if (path !== "tour") {
    await sleep(1600);
    if (run !== demoRun) return;
    setStatus("Demo · Listening", "listening");
    say("Demo mode: the live guide will listen and answer here once the ElevenLabs agent is connected.", "demo");
    return;
  }
  for (const [id, line] of TOUR) {
    await sleep(reduced ? 1800 : 2600);
    if (run !== demoRun) return;
    if (!findSection(id)) continue;
    tools.scrollToSection({ section_id: id });
    setStatus("Demo · Speaking", "speaking");
    say(line);
  }
  setStatus("Demo · Listening", "listening");
}

/* ---------- when the guide appears ---------- */
function boot() {
  if (CFG.skipPaths.includes(location.pathname)) return;
  if (store.get("resume")) { showPill("Continue with the guide"); pill.classList.add("nudge"); return; }
  if (store.get("dismissed") || isMobile()) {
    // Phones: never pop a card over the page. Show the small pill instead.
    setTimeout(() => { showPill(); pill.classList.add("nudge"); }, CFG.autoOpenMs);
    return;
  }
  setTimeout(() => { if (welcome.hidden && live.hidden) { show(welcome); track("shown"); } }, CFG.autoOpenMs);
}
boot();
