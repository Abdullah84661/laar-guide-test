/*
 * Laar Guide v0.2 — the talking website guide for laardigital.com
 *
 * One <script type="module"> tag before </body>:
 *   <script type="module" src="/assets/js/laar-guide/laar-guide.js"
 *           data-agent-id="agent_xxx"></script>
 *
 * v0.2: in voice mode there is no transcript on screen. A voice-reactive scene
 * (sphere, chess or word puzzle) shows the guide speaking and listening. Captions are off by
 * default (CC button). Text mode shows messages, with audio tags removed.
 *
 * With no data-agent-id (or data-demo="true") it runs a silent demo.
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
    visual: new URLSearchParams(location.search).get("visual") || data.visual || "sphere", // sphere | chess | puzzle
    visualPicker: data.visualPicker === "true", // test sites: show a scene switcher on the stage
  },
  window.LAAR_GUIDE || {}
);

/* ---------- where things are on the page ---------- */
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
const stripTags = (s) => String(s).replace(/\[[a-z][a-z \-]{0,24}\]\s*/gi, "").trim();
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
    setTimeout(() => { location.href = path; }, 2200);
    return `Opening ${path}. The conversation pauses while the page loads; the visitor can tap Continue there.`;
  },
  spellName: ({ text }) => {
    const clean = String(text || "").replace(/[^A-Za-z0-9& ]/g, "").trim().slice(0, 24);
    if (!clean) return "Nothing to spell.";
    puzzle.word = clean; setScene("puzzle"); track("spell_name");
    return `Spelling "${clean}" on screen.`;
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
.stage{position:relative;height:230px;margin:2px -8px 12px;border-radius:18px;overflow:hidden;
  background:radial-gradient(120% 90% at 50% 55%,rgb(23 41 77 / .9) 0%,rgb(9 20 40 / .95) 70%)}
.stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.pick{position:absolute;top:8px;left:8px;right:8px;display:flex;justify-content:center;gap:4px;z-index:2}
.pick button{border:1px solid rgb(244 241 236 / .18);background:rgb(9 20 40 / .6);color:rgb(244 241 236 / .7);font-size:11px;font-weight:700;letter-spacing:.06em;padding:5px 10px;border-radius:999px;cursor:pointer}
.pick button[aria-pressed="true"]{background:rgb(244 241 236 / .9);color:var(--n);border-color:transparent}
.caps{min-height:72px;max-height:180px;overflow:auto;margin:6px 0 12px;font-size:15.5px;line-height:1.5}
.caps p{margin-top:8px}
.caps .you{color:rgb(244 241 236 / .6);font-size:14px}
.caps .demo{color:var(--o);font-size:13px}
.live.voice .top .orb{display:none}
.live.voice .caps{display:none}
.live.voice.cc .caps{display:block;min-height:0;max-height:96px;font-size:14px;margin-top:0}
.live:not(.voice) .stage,.live:not(.voice) #cc,.live:not(.voice) #mute{display:none}
.live.voice #msg,.live.voice .send{display:none}
.row{display:flex;gap:8px;align-items:center}
.live.voice .row{justify-content:center}
input{flex:1;min-width:0;font-size:15px;padding:12px 16px;border-radius:999px;border:1px solid rgb(244 241 236 / .18);background:rgb(9 20 40 / .55);color:var(--b)}
input::placeholder{color:rgb(244 241 236 / .45)}
.ctl{flex:none;border:1px solid rgb(244 241 236 / .18);background:rgb(244 241 236 / .06);color:var(--b);height:44px;min-width:44px;padding:0 16px;border-radius:999px;font-size:13px;font-weight:700;cursor:pointer}
.ctl.send{background:rgb(244 241 236 / .14)}
.ctl[aria-pressed="true"]{background:rgb(244 241 236 / .18);border-color:rgb(244 241 236 / .4)}
#mute[aria-pressed="true"]{background:rgb(249 112 102 / .2);border-color:rgb(249 112 102 / .5)}
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
  .stage{height:200px}
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
    <div class="top"><div class="orb" id="orb" aria-hidden="true"></div>
      <div><h2>Laar's guide</h2><p class="status" id="status" aria-live="polite">Connecting…</p></div>
      <button class="x" data-act="end" aria-label="End the conversation">×</button></div>
    <div class="stage" id="stage"><canvas id="viz" aria-hidden="true"></canvas>
      <div class="pick" id="pick" role="group" aria-label="Choose a scene" hidden>
        <button data-scene="sphere">Sphere</button><button data-scene="chess">Chess</button><button data-scene="puzzle">Puzzle</button>
      </div></div>
    <div class="caps" id="caps" aria-live="polite"></div>
    <form class="row" id="form">
      <input id="msg" autocomplete="off" placeholder="Type a message" aria-label="Type a message">
      <button class="ctl send" type="submit">Send</button>
      <button class="ctl" type="button" id="mute" aria-pressed="false" aria-label="Mute microphone">Mute</button>
      <button class="ctl" type="button" id="cc" aria-pressed="false" aria-label="Show captions">CC</button>
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
function setStatus(text, state) { statusEl.textContent = text; orb.className = "orb " + (state || ""); viz.state = state || "idle"; }
function say(text, who = "agent") {
  const clean = who === "agent" ? stripTags(text) : String(text);
  if (!clean) return;
  const p = document.createElement("p");
  if (who === "user") p.className = "you";
  if (who === "demo") p.className = "demo";
  p.textContent = who === "user" ? `You: ${clean}` : clean;
  caps.appendChild(p);
  while (caps.children.length > 6) caps.firstChild.remove();
  caps.scrollTop = caps.scrollHeight;
}

/* ---------- the voice visual: scenes that move with the voice ---------- */
// sphere: particle sphere · chess: the "Immortal Game" (Anderssen v Kieseritzky, London 1851) replays as the guide speaks
// puzzle: letter tiles that solve themselves into LAAR DIGITAL (or the visitor's business name) as the guide speaks
const viz = { raf: 0, state: "idle", out: 0, inn: 0, t: 0, last: 0, pts: null, scene: CFG.visual };
function buildPoints(n) {
  const pts = [], g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), a = i * g;
    pts.push([Math.cos(a) * r, y, Math.sin(a) * r, Math.random() * Math.PI * 2]);
  }
  return pts;
}
function startViz() {
  if (viz.raf) return;
  viz.last = performance.now();
  const frame = (now) => { drawViz(now); viz.raf = requestAnimationFrame(frame); };
  viz.raf = requestAnimationFrame(frame);
}
function stopViz() { cancelAnimationFrame(viz.raf); viz.raf = 0; }
function setScene(s) {
  viz.scene = ["sphere", "chess", "puzzle"].includes(s) ? s : "sphere";
  chess.board = null; puzzle.tiles = null;
  root.querySelectorAll("[data-scene]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.scene === viz.scene)));
}
function level(fn) { try { return Math.min(1, Math.max(0, fn() || 0)); } catch { return 0; } }
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
function drawViz(now) {
  const c = $("viz"); if (!c || live.hidden) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return;
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const dt = Math.min(0.05, (now - viz.last) / 1000); viz.last = now; viz.t += dt;
  const t = viz.t;

  // voice levels from the real audio, or a simulated voice in the demo
  let out = 0, inn = 0;
  if (conv && conv.getOutputVolume) { out = level(() => conv.getOutputVolume()); inn = level(() => conv.getInputVolume()); }
  else if (viz.state === "speaking") out = 0.25 + 0.45 * Math.abs(Math.sin(t * 7.3)) * Math.abs(Math.sin(t * 2.1 + 1));
  if (viz.state === "speaking") out = Math.max(out, 0.08);
  viz.out += (Math.min(1, out * 1.6) - viz.out) * (out > viz.out ? 0.35 : 0.12);
  viz.inn += (Math.min(1, inn * 1.8) - viz.inn) * 0.2;

  ctx.clearRect(0, 0, w, h);
  const args = [ctx, w, h, viz.out, viz.inn, t, dt];
  if (viz.scene === "chess") drawChess(...args);
  else if (viz.scene === "puzzle") drawPuzzle(...args);
  else drawSphere(...args);
}

function glowAt(ctx, w, h, cx, cy, R, L) {
  const glow = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 2.1);
  glow.addColorStop(0, `rgba(255,122,47,${0.14 + L * 0.4})`);
  glow.addColorStop(0.45, `rgba(255,122,47,${0.04 + L * 0.1})`);
  glow.addColorStop(1, "rgba(255,122,47,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
}

/* sphere */
function drawSphere(ctx, w, h, L, I, t) {
  viz.pts = viz.pts || buildPoints(isMobile() ? 320 : 460);
  const connecting = viz.state === "connecting";
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.3 * (1 + L * 0.22);
  glowAt(ctx, w, h, cx, cy, R, L);
  ctx.lineWidth = 1;
  for (let k = 0; k < 2; k++) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * (k ? -0.18 : 0.12) + k * 1.1);
    ctx.strokeStyle = `rgba(244,241,236,${0.08 + L * 0.12})`;
    ctx.beginPath(); ctx.ellipse(0, 0, R * (1.45 + k * 0.22), R * (0.38 + k * 0.1), 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  const core = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.25, 0, cx, cy, R * 0.9);
  core.addColorStop(0, `rgba(255,179,138,${0.35 + L * 0.5})`);
  core.addColorStop(0.5, `rgba(255,122,47,${0.18 + L * 0.35})`);
  core.addColorStop(1, "rgba(255,122,47,0)");
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, R * 0.9, 0, Math.PI * 2); ctx.fill();
  const spin = reduced ? 0 : t * (connecting ? 1.2 : 0.28 + L * 0.5);
  const tilt = 0.42 + Math.sin(t * 0.3) * 0.12;
  const cy1 = Math.cos(spin), sy1 = Math.sin(spin), cx1 = Math.cos(tilt), sx1 = Math.sin(tilt);
  for (const p of viz.pts) {
    const wave = L * 0.26 * Math.sin(p[0] * 3.2 + t * 4.2) * Math.cos(p[1] * 2.7 - t * 3.1)
      + L * 0.05 * Math.sin(p[3] * 3 + t * 6)
      + I * 0.14 * Math.sin(p[2] * 4 + t * 3)
      + (connecting ? Math.sin(p[3] + t * 6) * 0.05 : 0);
    const d = 1 + wave;
    const x = p[0] * d, y = p[1] * d, z = p[2] * d;
    const x1 = x * cy1 - z * sy1, z1 = x * sy1 + z * cy1;
    const y1 = y * cx1 - z1 * sx1, z2 = y * sx1 + z1 * cx1;
    const persp = 2.6 / (2.6 + z2);
    const px = cx + x1 * R * persp, py = cy + y1 * R * persp;
    const depth = (z2 + 1.4) / 2.8;
    const a = 0.12 + depth * (0.55 + L * 0.3);
    const size = (0.7 + depth * 1.5 + L * 0.9) * persp;
    const warm = Math.min(1, 0.35 + L * 1.2 + (p[3] > 4.6 ? 0.3 : 0));
    const r = Math.round(244 + 11 * warm), gg = Math.round(241 - 119 * warm), b = Math.round(236 - 189 * warm);
    ctx.fillStyle = `rgba(${r},${gg},${b},${a})`;
    ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI * 2); ctx.fill();
  }
}

/* chess: the Immortal Game, one move per beat while the guide speaks */
const IMMORTAL = "e2e4 e7e5 f2f4 e5f4 f1c4 d8h4 e1f1 b7b5 c4b5 g8f6 g1f3 h4h6 d2d3 f6h5 f3h4 h6g5 h4f5 c7c6 g2g4 h5f6 h1g1 c6b5 h2h4 g5g6 h4h5 g6g5 d1f3 f6g8 c1f4 g5f6 b1c3 f8c5 c3d5 f6b2 f4d6 c5g1 e4e5 b2a1 f1e2 b8a6 f5g7 e8d8 f3f6 g8f6 d6e7".split(" ");
const GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const chess = { board: null, i: 0, anim: null, last: null, wait: 0.6, hold: 0 };
function chessReset() {
  const b = {};
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR".split("/").forEach((row, r) => {
    let f = 0;
    for (const ch of row) { if (/\d/.test(ch)) f += +ch; else { b["abcdefgh"[f] + (8 - r)] = ch; f++; } }
  });
  Object.assign(chess, { board: b, i: 0, anim: null, last: null, wait: 0.6, hold: 0 });
}
const sqXZ = (sq) => ["abcdefgh".indexOf(sq[0]) - 3.5, +sq[1] - 4.5];
function drawChess(ctx, w, h, L, I, t, dt) {
  if (!chess.board) chessReset();
  const P = { cx: w / 2, cy: h * 0.57, S: Math.min(w / 12.5, h / 7.4), yaw: reduced ? 0 : Math.sin(t * 0.15) * 0.32, pitch: 0.98, D: 13 };
  const cs = Math.cos(P.yaw), sn = Math.sin(P.yaw), cp = Math.cos(P.pitch), sp = Math.sin(P.pitch);
  const proj = (x, y, z) => {
    const x1 = x * cs - z * sn, z1 = x * sn + z * cs;
    const yy = y * cp + z1 * sp, zc = z1 * cp - y * sp, f = P.D / (P.D + zc);
    return [P.cx + x1 * P.S * f, P.cy - yy * P.S * f, zc, f];
  };
  glowAt(ctx, w, h, P.cx, P.cy, P.S * 3, L * 0.8);

  // moves: one per beat while speaking; the game loops after mate
  if (chess.hold > 0) { chess.hold -= dt; if (chess.hold <= 0) chessReset(); }
  else if (chess.anim) {
    chess.anim.k += dt / 0.6;
    if (chess.anim.k >= 1) {
      const { from, to } = chess.anim;
      chess.board[to] = chess.board[from]; delete chess.board[from];
      chess.last = [from, to]; chess.anim = null; chess.i++;
      chess.wait = 0.9 - L * 0.4;
      if (chess.i >= IMMORTAL.length) chess.hold = 4;
    }
  } else if (viz.state === "speaking") {
    chess.wait -= dt;
    if (chess.wait <= 0) { const m = IMMORTAL[chess.i]; chess.anim = { from: m.slice(0, 2), to: m.slice(2, 4), k: 0 }; }
  }

  // board
  const sqs = [];
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    const x = f - 3.5, z = r - 3.5;
    const pts = [[x - 0.5, z - 0.5], [x + 0.5, z - 0.5], [x + 0.5, z + 0.5], [x - 0.5, z + 0.5]].map(([a, b]) => proj(a, 0, b));
    sqs.push({ f, r, pts, zc: proj(x, 0, z)[2], name: "abcdefgh"[f] + (r + 1) });
  }
  sqs.sort((a, b) => b.zc - a.zc);
  const edge = [[-4, -4], [4, -4], [4, 4], [-4, 4]].map(([a, b]) => proj(a, 0, b));
  ctx.fillStyle = "rgba(244,241,236,.10)";
  ctx.beginPath(); edge.forEach(([x, y], k) => (k ? ctx.lineTo(x, y + 5) : ctx.moveTo(x, y + 5))); ctx.closePath(); ctx.fill();
  const mated = chess.hold > 0;
  for (const s of sqs) {
    const light = (s.f + s.r) % 2 === 1;
    let col = light ? "rgba(74,96,140,.95)" : "rgba(23,41,77,.98)";
    if (chess.last && chess.last.includes(s.name)) col = light ? "rgba(255,146,86,.75)" : "rgba(255,122,47,.6)";
    if (mated && chess.board[s.name] === "k") col = `rgba(255,122,47,${0.6 + 0.3 * Math.sin(t * 6)})`;
    ctx.fillStyle = col;
    ctx.beginPath(); s.pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = "rgba(244,241,236,.25)"; ctx.lineWidth = 1;
  ctx.beginPath(); edge.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();

  // pieces, back to front
  const pieces = [];
  for (const [sq, pc] of Object.entries(chess.board)) {
    if (chess.anim && sq === chess.anim.from) continue;
    const fade = chess.anim && sq === chess.anim.to ? 1 - ease(chess.anim.k) : 1;
    const [x, z] = sqXZ(sq); pieces.push({ pc, x, z, y: 0, a: fade });
  }
  if (chess.anim) {
    const k = ease(chess.anim.k), [x0, z0] = sqXZ(chess.anim.from), [x1, z1] = sqXZ(chess.anim.to);
    pieces.push({ pc: chess.board[chess.anim.from], x: x0 + (x1 - x0) * k, z: z0 + (z1 - z0) * k, y: Math.sin(Math.PI * k) * 0.9, a: 1 });
  }
  pieces.forEach((p) => { p.pr = proj(p.x, p.y, p.z); p.base = proj(p.x, 0, p.z); });
  pieces.sort((a, b) => b.pr[2] - a.pr[2]);
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  for (const p of pieces) {
    if (!p.pc) continue;
    const size = P.S * p.pr[3] * 1.05, white = p.pc === p.pc.toUpperCase();
    ctx.globalAlpha = p.a;
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.beginPath(); ctx.ellipse(p.base[0], p.base[1], size * 0.28, size * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.font = `${Math.round(size)}px "Segoe UI Symbol","Noto Sans Symbols 2","Apple Symbols",serif`;
    ctx.lineWidth = 2; ctx.strokeStyle = "rgba(9,20,40,.9)";
    const g = GLYPH[p.pc.toLowerCase()] + "︎", y = p.pr[1] + size * 0.12;
    ctx.strokeText(g, p.pr[0], y);
    ctx.fillStyle = white ? "#F4F1EC" : "#FF7A2F";
    ctx.fillText(g, p.pr[0], y);
  }
  ctx.globalAlpha = 1;
}

/* puzzle: scrambled tiles that solve into a name while the guide speaks */
const puzzle = { word: "LAAR DIGITAL", p: 0, tiles: null, hold: 0, w: 0 };
function puzzleSetup(w, h) {
  const words = puzzle.word.toUpperCase().split(/\s+/).filter(Boolean).slice(0, 4);
  const lines = []; let cur = "";
  for (const wd of words) { if (cur && (cur + " " + wd).length > 8) { lines.push(cur); cur = wd; } else cur = cur ? cur + " " + wd : wd; }
  if (cur) lines.push(cur);
  const maxLen = Math.max(...lines.map((l) => l.length));
  const gap = 6, T = Math.min(38, (w - 40 - gap * (maxLen - 1)) / maxLen, (h - 70) / lines.length - gap);
  const tiles = [];
  lines.forEach((line, li) => {
    const lw = line.length * T + (line.length - 1) * gap, x0 = (w - lw) / 2;
    const y0 = (h - (lines.length * T + (lines.length - 1) * gap)) / 2 - 8 + li * (T + gap);
    [...line].forEach((ch, k) => {
      if (ch === " ") return;
      tiles.push({ ch, tx: x0 + k * (T + gap), ty: y0, sx: 14 + Math.random() * (w - T - 28), sy: 14 + Math.random() * (h - T - 28),
        rot: (Math.random() - 0.5) * 1.6, ph: Math.random() * 6.28, lockedAt: -1 });
    });
  });
  const order = tiles.map((_, i) => i).sort(() => Math.random() - 0.5);
  order.forEach((ti, k) => (tiles[ti].order = k));
  Object.assign(puzzle, { tiles, T, p: 0, hold: 0, w });
}
function roundRect(ctx, x, y, s, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + s, y, x + s, y + s, r); ctx.arcTo(x + s, y + s, x, y + s, r);
  ctx.arcTo(x, y + s, x, y, r); ctx.arcTo(x, y, x + s, y, r); ctx.closePath();
}
function drawPuzzle(ctx, w, h, L, I, t, dt) {
  if (!puzzle.tiles || puzzle.w !== w) puzzleSetup(w, h);
  const N = puzzle.tiles.length, T = puzzle.T;
  glowAt(ctx, w, h, w / 2, h / 2, T * 2.5, L * 0.7);
  if (puzzle.hold > 0) { puzzle.hold -= dt; if (puzzle.hold <= 0) puzzleSetup(w, h); }
  else {
    puzzle.p += dt * (viz.state === "speaking" ? 0.05 + L * 0.22 : 0.008);
    if (puzzle.p >= 1) { puzzle.p = 1; puzzle.hold = 5; }
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const tl of puzzle.tiles) {
    const k = ease(clamp01((puzzle.p * (N + 2) - tl.order) / 2));
    if (k >= 1 && tl.lockedAt < 0) tl.lockedAt = t;
    const bob = (1 - k) * 6;
    const x = tl.sx + (tl.tx - tl.sx) * k + Math.sin(t * 1.3 + tl.ph) * bob;
    const y = tl.sy + (tl.ty - tl.sy) * k + Math.cos(t * 1.1 + tl.ph) * bob;
    const rot = tl.rot * (1 - k);
    ctx.save(); ctx.translate(x + T / 2, y + T / 2); ctx.rotate(rot);
    const flash = tl.lockedAt >= 0 ? clamp01(1 - (t - tl.lockedAt) / 0.5) : 0;
    if (flash > 0) { ctx.shadowColor = `rgba(255,122,47,${flash})`; ctx.shadowBlur = 22 * flash; }
    roundRect(ctx, -T / 2, -T / 2, T, Math.min(9, T * 0.24));
    if (k >= 1) { ctx.fillStyle = flash > 0 ? "#FF9256" : "#F4F1EC"; ctx.fill(); }
    else { ctx.fillStyle = "rgba(244,241,236,.10)"; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(244,241,236,.45)"; ctx.lineWidth = 1.2; ctx.stroke(); }
    ctx.shadowBlur = 0;
    ctx.fillStyle = k >= 1 ? "#0E1E3A" : "#F4F1EC";
    ctx.font = `800 ${Math.round(T * 0.56)}px Inter,system-ui,sans-serif`;
    ctx.fillText(tl.ch, 0, 1);
    ctx.restore();
  }
  if (puzzle.p >= 1) {
    const a = clamp01((5 - puzzle.hold) / 0.8);
    const last = puzzle.tiles[puzzle.tiles.length - 1];
    ctx.fillStyle = `rgba(244,241,236,${0.75 * a})`;
    ctx.font = "700 11px Inter,system-ui,sans-serif";
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "2px";
    ctx.fillText(puzzle.word.toUpperCase() === "LAAR DIGITAL" ? "STRATEGY INTO MOTION." : "LET'S MAKE IT MOVE.", w / 2, last.ty + T + 22);
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "0px";
  }
}

root.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.scene) { setScene(t.dataset.scene); track("scene", { scene: viz.scene }); return; }
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
  } else if (t.id === "cc") {
    const on = !live.classList.contains("cc");
    live.classList.toggle("cc", on); t.setAttribute("aria-pressed", String(on));
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

$("pick").hidden = !CFG.visualPicker;
setScene(viz.scene);

function setLiveMode(m) {
  live.classList.toggle("voice", m === "voice");
  if (m === "voice") startViz(); else stopViz();
}

/* ---------- starting and ending ---------- */
async function start(path) {
  hide(welcome); hide(pill);
  caps.innerHTML = "";
  show(live);
  setLiveMode(mode);
  track("start", { path, mode });
  const page = document.title.split("|")[0].trim() || location.pathname;
  const opening = OPENINGS[path].replace("{page}", page);

  if (CFG.demo) return runDemo(path, opening);

  let useMode = mode;
  if (useMode === "voice") {
    setStatus("Allow the microphone", "connecting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      useMode = "text"; setLiveMode("text");
      say("No microphone? No problem. Type below and I'll answer here.", "demo");
    }
  }
  setStatus("Connecting…", "connecting");
  try {
    const { Conversation } = CFG.sdkUrl ? await import(CFG.sdkUrl) : await import("@elevenlabs/client");
    conv = await Conversation.startSession({
      agentId: CFG.agentId,
      textOnly: useMode === "text",
      stripAudioTags: true,
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
        if (role === "user" && useMode === "text") return;
        say(p.message, role === "agent" ? "agent" : "user");
      },
      onError: (msg) => { console.warn("[laar-guide]", msg); },
      onDisconnect: () => { conv = null; setStatus("Ended", ""); },
    });
  } catch (err) {
    console.warn("[laar-guide]", err);
    setLiveMode("text");
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
  stopViz();
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
    setTimeout(() => { showPill(); pill.classList.add("nudge"); }, CFG.autoOpenMs);
    return;
  }
  setTimeout(() => { if (welcome.hidden && live.hidden) { show(welcome); track("shown"); } }, CFG.autoOpenMs);
}
boot();
