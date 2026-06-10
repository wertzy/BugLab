import { useState, useEffect, useRef } from "react";

// ── constants ─────────────────────────────────────────────────────────────────

const DIFFICULTIES = [
  { id:"easy",   label:"Easy",   color:"#22d87a", multiplier:1,   blurb:"Syntactic & obvious" },
  { id:"medium", label:"Medium", color:"#38bdf8", multiplier:1.5, blurb:"Logic & control flow" },
  { id:"hard",   label:"Hard",   color:"#f59e0b", multiplier:2,   blurb:"Concurrency & memory" },
  { id:"expert", label:"Expert", color:"#f4485e", multiplier:3,   blurb:"Semantic & system-level" },
];

const BUG_TYPES = [
  { id:"off-by-one",     label:"Off-by-one",          color:"#f59e0b", tier:"easy"   },
  { id:"null-deref",     label:"Null dereference",    color:"#ef4444", tier:"easy"   },
  { id:"logic-invert",   label:"Inverted condition",  color:"#a78bfa", tier:"easy"   },
  { id:"missing-break",  label:"Missing break",       color:"#fb923c", tier:"easy"   },
  { id:"wrong-op",       label:"Wrong operator",      color:"#38bdf8", tier:"easy"   },
  { id:"uninit-var",     label:"Uninitialised var",   color:"#34d399", tier:"easy"   },
  { id:"predicate-weak", label:"Predicate weakening", color:"#a78bfa", tier:"medium" },
  { id:"wrong-cache",    label:"Bad memoization",     color:"#38bdf8", tier:"medium" },
  { id:"dangling-iter",  label:"Dangling iterator",   color:"#fb923c", tier:"medium" },
  { id:"state-corrupt",  label:"State corruption",    color:"#f59e0b", tier:"medium" },
  { id:"toctou",         label:"TOCTOU race",         color:"#f4485e", tier:"hard"   },
  { id:"lock-inversion", label:"Lock-order inversion",color:"#f59e0b", tier:"hard"   },
  { id:"double-free",    label:"Double free",         color:"#ef4444", tier:"hard"   },
  { id:"resource-leak",  label:"Resource leak",       color:"#fb923c", tier:"hard"   },
  { id:"int-truncation", label:"Integer truncation",  color:"#f4485e", tier:"expert" },
  { id:"signed-unsigned",label:"Signed/unsigned",     color:"#ef4444", tier:"expert" },
  { id:"timing-channel", label:"Timing side channel", color:"#a78bfa", tier:"expert" },
  { id:"invariant-break",label:"Invariant violation", color:"#f59e0b", tier:"expert" },
];

const SNIPPETS = [
  { id:"sum",      difficulty:"easy",   language:"Python",     label:"sum_list",
    lines:["def sum_list(items):","    total = 0","    for i in range(len(items)):","        total += items[i]","    return total"],
    bugLine:2, bugType:"off-by-one",
    injectedLine:"    for i in range(len(items) + 1):",
    explanation:"range(len(items) + 1) overshoots by one, causing an IndexError on the last iteration.",
    patch:"    for i in range(len(items)):" },
  { id:"auth",     difficulty:"easy",   language:"JavaScript", label:"isAdmin",
    lines:["function isAdmin(user) {","  if (user.role === 'admin') {","    return true;","  }","  return false;","}"],
    bugLine:1, bugType:"logic-invert",
    injectedLine:"  if (user.role !== 'admin') {",
    explanation:"!== inverts the guard — every non-admin gets admin access.",
    patch:"  if (user.role === 'admin') {" },
  { id:"find",     difficulty:"easy",   language:"Python",     label:"find_max",
    lines:["def find_max(nums):","    max_val = nums[0]","    for n in nums:","        if n > max_val:","            max_val = n","    return max_val"],
    bugLine:3, bugType:"wrong-op",
    injectedLine:"        if n < max_val:",
    explanation:"Flipping > to < tracks the minimum instead of the maximum.",
    patch:"        if n > max_val:" },
  { id:"counter",  difficulty:"easy",   language:"JavaScript", label:"Counter class",
    lines:["class Counter {","  constructor() { this.count = 0; }","  increment() { this.count++; }","  reset() {","    let count = 0;","  }","}"],
    bugLine:4, bugType:"uninit-var",
    injectedLine:"    let count = 0;",
    explanation:"'let count' creates a local variable; this.count is never reset.",
    patch:"    this.count = 0;" },
  { id:"discount", difficulty:"medium", language:"Python",     label:"apply_discount",
    lines:["def apply_discount(price, pct):","    if pct >= 0 and pct <= 100:","        return price * (1 - pct / 100)","    raise ValueError('invalid pct')"],
    bugLine:1, bugType:"predicate-weak",
    injectedLine:"    if pct >= 0 or pct <= 100:",
    explanation:"'or' lets any value satisfy one half — 500% discounts pass right through.",
    patch:"    if pct >= 0 and pct <= 100:" },
  { id:"memo",     difficulty:"medium", language:"JavaScript", label:"memoizedArea",
    lines:["const cache = {};","function area(w, h) {","  const key = `${w}x${h}`;","  if (cache[key]) return cache[key];","  const result = w * h;","  cache[key] = result;","  return result;","}"],
    bugLine:2, bugType:"wrong-cache",
    injectedLine:"  const key = `${w}`;",
    explanation:"Dropping h from the key means area(4,5) and area(4,9) share a cache slot.",
    patch:"  const key = `${w}x${h}`;" },
  { id:"dedup",    difficulty:"medium", language:"Python",     label:"remove_evens",
    lines:["def remove_evens(nums):","    result = list(nums)","    for n in result:","        if n % 2 == 0:","            result.remove(n)","    return result"],
    bugLine:2, bugType:"dangling-iter",
    injectedLine:"    for n in nums:",
    explanation:"Iterating one list while mutating another skips elements as indices shift.",
    patch:"    for n in list(result):" },
  { id:"safe_w",   difficulty:"hard",   language:"Python",     label:"safe_write",
    lines:["def safe_write(path, data):","    if not os.path.exists(path):","        with open(path, 'w') as f:","            f.write(data)","    else:","        raise FileExistsError(path)"],
    bugLine:1, bugType:"toctou",
    injectedLine:"    if not os.path.exists(path):  # not atomic",
    explanation:"A race between exists() and open() lets another process create the file between the check and use.",
    patch:"    try:  # open('x') is atomic" },
  { id:"transfer", difficulty:"hard",   language:"Python",     label:"transfer",
    lines:["def transfer(a, b, amt):","    with a.lock:","        with b.lock:","            a.balance -= amt","            b.balance += amt"],
    bugLine:2, bugType:"lock-inversion",
    injectedLine:"        with b.lock:  # order depends on argument order",
    explanation:"transfer(x,y) and transfer(y,x) acquire locks in opposite orders — deadlock under concurrency.",
    patch:"    first, second = sorted([a,b], key=lambda x: x.id)" },
  { id:"pool",     difficulty:"hard",   language:"JavaScript", label:"queryUser",
    lines:["async function queryUser(pool, id) {","  const conn = await pool.acquire();","  const rows = await conn.query(id);","  pool.release(conn);","  return rows;","}"],
    bugLine:3, bugType:"resource-leak",
    injectedLine:"  return rows;",
    explanation:"If query() throws, pool.release() is skipped — connections leak until the pool exhausts.",
    patch:"  } finally { pool.release(conn); }" },
  { id:"alloc",    difficulty:"expert", language:"C",          label:"alloc_buffer",
    lines:["void *alloc_buffer(int count) {","    int size = count * sizeof(record_t);","    if (size > MAX_ALLOC) return NULL;","    return malloc(size);","}"],
    bugLine:1, bugType:"int-truncation",
    injectedLine:"    int size = count * sizeof(record_t);",
    explanation:"Signed 32-bit int overflows for large counts — passes the MAX_ALLOC check then under-allocates.",
    patch:"    size_t size = (size_t)count * sizeof(record_t);" },
  { id:"bounds",   difficulty:"expert", language:"C",          label:"read_slice",
    lines:["int read_slice(char *buf, int len, int off) {","    if (off > len) return -1;","    return buf[off];","}"],
    bugLine:1, bugType:"signed-unsigned",
    injectedLine:"    if (off > len) return -1;",
    explanation:"Negative off passes the 'off > len' check, then buf[off] reads before the buffer.",
    patch:"    if (off < 0 || off >= len) return -1;" },
  { id:"compare",  difficulty:"expert", language:"JavaScript", label:"checkToken",
    lines:["function checkToken(input, secret) {","  if (input.length !== secret.length) return false;","  for (let i = 0; i < input.length; i++) {","    if (input[i] !== secret[i]) return false;","  }","  return true;","}"],
    bugLine:3, bugType:"timing-channel",
    injectedLine:"    if (input[i] !== secret[i]) return false;",
    explanation:"Early-return leaks secret bytes via timing — attacker narrows correct chars one by one.",
    patch:"    diff |= input.charCodeAt(i) ^ secret.charCodeAt(i);" },
];

const INIT_GS = {
  phase:"lobby", selectedTier:"easy", selectedSnippetId:null, snippetId:null,
  injectorLine:null, injectorBugType:null, injectorSubmitted:false,
  hunterLine:null, hunterBugType:null, hunterSubmitted:false,
  scores:[0,0], round:1,
};

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Syne:wght@400;600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0a0c10;--surface:#0f1218;--surface2:#161b24;--surface3:#1c2332;
  --border:rgba(99,130,180,.18);--border-hi:rgba(99,130,180,.38);
  --text:#c9d4e8;--dim:#5a6a84;--bright:#eef2ff;
  --accent:#4f8ef7;--accent-bg:rgba(79,142,247,.12);--accent-glow:rgba(79,142,247,.3);
  --green:#22d87a;--green-bg:rgba(34,216,122,.12);
  --red:#f4485e;--red-bg:rgba(244,72,94,.12);
  --amber:#f59e0b;
  --mono:'JetBrains Mono',monospace;--sans:'Syne',sans-serif;
  --r:8px;--rl:12px;
}
body{background:var(--bg);color:var(--text);font-family:var(--sans);min-height:100vh}
body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:9999;
  background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.05) 2px,rgba(0,0,0,.05) 4px)}
.app{min-height:100vh;display:flex;flex-direction:column}

/* topbar */
.tb{display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid var(--border);background:var(--surface);flex-wrap:wrap}
.tb-logo{font-weight:800;font-size:19px;color:var(--accent);letter-spacing:-.5px}
.tb-logo span{color:var(--red)}
.pill{font-family:var(--mono);font-size:10px;padding:3px 9px;border-radius:100px;border:1px solid var(--border-hi);background:var(--surface2);color:var(--dim);letter-spacing:.05em}
.pill.on{background:var(--accent-bg);border-color:var(--accent);color:var(--accent)}
.pill.done{background:var(--green-bg);border-color:var(--green);color:var(--green)}
.pchip{display:flex;align-items:center;gap:5px;font-family:var(--mono);font-size:11px;padding:3px 9px;border-radius:100px;border:1px solid var(--border);background:var(--surface2);color:var(--dim)}
.pchip.you{border-color:var(--accent);color:var(--bright)}
.cdot{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 5px var(--green);flex-shrink:0}
.cdot.off{background:var(--dim);box-shadow:none}
.sbadge{font-family:var(--mono);font-size:12px;padding:3px 11px;border-radius:100px;background:var(--surface2);border:1px solid var(--border);color:var(--bright)}
.sbadge span{color:var(--amber);font-weight:700}
.sep{flex:1}

/* center / connection screens */
.cscreen{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;padding:36px 20px}
.blogo{font-size:54px;font-weight:800;color:var(--bright);letter-spacing:-1.5px}
.blogo span{color:var(--red)}
.bsub{font-family:var(--mono);font-size:13px;color:var(--dim);text-align:center}
.ccard{background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:26px 30px;display:flex;flex-direction:column;align-items:center;gap:14px;min-width:300px;max-width:400px;width:100%}
.ctitle{font-size:15px;font-weight:700;color:var(--bright);align-self:flex-start}
.rcode{font-family:var(--mono);font-size:40px;font-weight:700;letter-spacing:.22em;color:var(--accent);padding:14px 20px;background:var(--surface2);border-radius:var(--r);border:1px solid var(--border-hi);text-align:center;width:100%}
.jfield{width:100%;padding:11px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);font-family:var(--mono);font-size:22px;letter-spacing:.16em;color:var(--bright);text-align:center;text-transform:uppercase}
.jfield::placeholder{color:var(--dim);font-size:13px;letter-spacing:normal;text-transform:none}
.jfield:focus{outline:none;border-color:var(--accent)}
.cerr{font-family:var(--mono);font-size:12px;color:var(--red);text-align:center}
.chint{font-family:var(--mono);font-size:11px;color:var(--dim);text-align:center;line-height:1.6}
.brow{display:flex;gap:10px;width:100%}
.waiting-p{display:flex;align-items:center;gap:9px;font-family:var(--mono);font-size:13px;color:var(--dim)}
.pulse{width:8px;height:8px;border-radius:50%;animation:pulse 1.4s ease-in-out infinite}
.pulse.bl{background:var(--accent)}
.pulse.gr{background:var(--green)}
@keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}

/* buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:10px 18px;border-radius:var(--r);font-family:var(--sans);font-size:14px;font-weight:600;cursor:pointer;border:none;transition:all .15s}
.btn-pr{background:var(--accent);color:#fff}
.btn-pr:hover{background:#3a7aee;box-shadow:0 0 16px var(--accent-glow)}
.btn-pr:disabled{opacity:.35;cursor:not-allowed}
.btn-gh{background:var(--surface2);color:var(--text);border:1px solid var(--border)}
.btn-gh:hover{border-color:var(--border-hi)}
.btn-dn{background:var(--red);color:#fff}
.btn-dn:hover{background:#e02035}
.btn-dn:disabled{opacity:.35;cursor:not-allowed}
.btn-fw{width:100%}
.btn-sm{padding:5px 13px;font-size:13px}

/* game panels */
.gpanel{flex:1;display:flex;flex-direction:column;padding:22px;gap:14px;max-width:760px;margin:0 auto;width:100%}
.gpanel-w{flex:1;display:flex;flex-direction:column;padding:22px;gap:14px;max-width:880px;margin:0 auto;width:100%}
.ph{display:flex;align-items:center;gap:10px}
.pi{width:29px;height:29px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px}
.pi-pu{background:rgba(167,139,250,.15)}
.pi-gr{background:rgba(34,216,122,.12)}
.pi-am{background:rgba(245,158,11,.12)}
.ptitle{font-size:15px;font-weight:700;color:var(--bright)}
.prole{font-family:var(--mono);font-size:10px;color:var(--dim);letter-spacing:.08em}
.tag{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:100px;font-family:var(--mono);font-size:11px;border:1px solid}
.sl{font-family:var(--mono);font-size:10px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase}
.hint{font-family:var(--mono);font-size:11px;color:var(--dim);line-height:1.6}

/* code view */
.cview{background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);overflow:hidden;flex:1;display:flex;flex-direction:column}
.cv-hdr{display:flex;align-items:center;gap:7px;padding:9px 13px;border-bottom:1px solid var(--border);background:var(--surface2)}
.cv-dot{width:8px;height:8px;border-radius:50%}
.cv-lang{font-family:var(--mono);font-size:11px;color:var(--dim);margin-left:auto}
.cv-body{padding:14px;overflow-x:auto;flex:1}
.ln{display:flex;align-items:flex-start;gap:11px;padding:2px 5px;border-radius:4px;font-family:var(--mono);font-size:13px;line-height:1.7;transition:background .1s}
.ln.sel{cursor:pointer}
.ln.sel:hover{background:rgba(79,142,247,.07)}
.ln.inj-row{background:rgba(244,72,94,.10)}
.ln.hi-row{background:rgba(245,158,11,.12);outline:1px solid rgba(245,158,11,.4)}
.ln.ok-rev{background:rgba(34,216,122,.10);outline:1px solid rgba(34,216,122,.4)}
.ln.bad-rev{background:rgba(244,72,94,.10);outline:1px solid rgba(244,72,94,.4)}
.lnum{font-size:11px;color:var(--dim);min-width:19px;user-select:none;padding-top:1px}
.lcode{color:var(--text);white-space:pre}
.lcode.rd{color:var(--red)}

/* bug chips */
.bgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.bchip{padding:7px 9px;border-radius:var(--r);border:1px solid var(--border);background:var(--surface);cursor:pointer;text-align:center;font-family:var(--mono);font-size:11px;color:var(--dim);transition:all .15s}
.bchip:hover{border-color:var(--border-hi);color:var(--text)}

/* lobby */
.lobby{flex:1;display:flex;flex-direction:column;align-items:center;gap:24px;padding:24px 18px}
.sgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:11px;width:100%}
.scard{background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:14px;cursor:pointer;transition:border-color .15s,background .15s}
.scard:hover{border-color:var(--accent);background:var(--surface2)}
.scard.on{border-color:var(--accent);background:var(--accent-bg)}
.slang{font-family:var(--mono);font-size:10px;color:var(--dim);letter-spacing:.1em;margin-bottom:5px}
.sname{font-size:13px;font-weight:700;color:var(--bright);margin-bottom:3px}
.smeta{display:flex;align-items:center;justify-content:space-between}
.slines{font-family:var(--mono);font-size:10px;color:var(--dim)}
.tdot{width:7px;height:7px;border-radius:50%}
.tgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;width:100%}
.tcard{background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:13px;cursor:pointer;transition:all .15s}
.tcard:hover{border-color:var(--border-hi)}
.tname{font-size:14px;font-weight:700;margin-bottom:2px}
.tblurb{font-family:var(--mono);font-size:10px;color:var(--dim);line-height:1.4;margin-bottom:7px;min-height:26px}
.tmult{font-family:var(--mono);font-size:11px;font-weight:700}
.ginfo{background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:18px;text-align:center;width:100%;max-width:460px}

/* reveal */
.reveal{flex:1;padding:24px;display:flex;flex-direction:column;gap:18px;max-width:840px;margin:0 auto;width:100%}
.rv-title{font-size:30px;font-weight:800;letter-spacing:-.5px}
.rv-title.win{color:var(--green)}.rv-title.pt{color:var(--amber)}.rv-title.lose{color:var(--red)}
.sgrid3{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}
.sc{background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:14px}
.sc-lbl{font-family:var(--mono);font-size:10px;color:var(--dim);letter-spacing:.07em;text-transform:uppercase;margin-bottom:7px}
.sc-val{font-size:26px;font-weight:700}
.sc-sub{font-family:var(--mono);font-size:11px;color:var(--dim);margin-top:3px}
.diff-b{background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);overflow:hidden}
.diff-h{padding:9px 14px;border-bottom:1px solid var(--border);background:var(--surface2);font-family:var(--mono);font-size:12px;color:var(--dim)}
.dln{display:flex;gap:11px;padding:3px 14px;font-family:var(--mono);font-size:13px;line-height:1.7}
.dln.rm{background:rgba(244,72,94,.10);color:var(--red)}
.dln.add{background:rgba(34,216,122,.10);color:var(--green)}
.dsign{min-width:13px}
.expl{background:var(--surface2);border-left:3px solid var(--accent);border-radius:0 var(--r) var(--r) 0;padding:13px 15px;font-size:14px;color:var(--text);line-height:1.7}
.gwait{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:40px}
.gwait-t{font-size:20px;font-weight:700;color:var(--bright)}
.fade{animation:fi .3s ease}
@keyframes fi{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}

/* polling badge */
.poll-badge{font-family:var(--mono);font-size:10px;color:var(--dim);padding:2px 8px;border-radius:100px;border:1px solid var(--border)}
`;

// Local stub for window.storage (replaces Claude artifact storage)
if (!window.storage) {
  window.storage = {
    _data: {},
    set: async (key, val, shared) => {
      const store = shared ? localStorage : sessionStorage;
      store.setItem(key, val);
      return { key, value: val };
    },
    get: async (key, shared) => {
      const store = shared ? localStorage : sessionStorage;
      const value = store.getItem(key);
      if (value === null) throw new Error("Key not found: " + key);
      return { key, value };
    },
    delete: async (key, shared) => {
      const store = shared ? localStorage : sessionStorage;
      store.removeItem(key);
      return { key, deleted: true };
    },
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function cx(...c) { return c.filter(Boolean).join(" "); }
let _styled = false;
function injectStyles() {
  if (_styled) return; _styled = true;
  const el = document.createElement("style");
  el.textContent = CSS; document.head.appendChild(el);
}
function genCode() { return Math.random().toString(36).slice(2,8).toUpperCase(); }

// ── storage helpers ───────────────────────────────────────────────────────────

async function storeSet(key, val) {
  try { await window.storage.set(key, JSON.stringify(val), true); return true; }
  catch(e) { return false; }
}
async function storeGet(key) {
  try { const r = await window.storage.get(key, true); return r ? JSON.parse(r.value) : null; }
  catch(e) { return null; }
}

// ── CodeView ──────────────────────────────────────────────────────────────────

function CodeView({ snippet, selectedLine, onSelectLine, showInjected, phase }) {
  return (
    <div className="cview">
      <div className="cv-hdr">
        <div className="cv-dot" style={{background:"#f4485e"}}/>
        <div className="cv-dot" style={{background:"#f59e0b"}}/>
        <div className="cv-dot" style={{background:"#22d87a"}}/>
        <span className="cv-lang">{snippet.language} · {snippet.label}</span>
      </div>
      <div className="cv-body">
        {snippet.lines.map((line, i) => {
          const isInj = i === snippet.bugLine;
          const text  = (showInjected && isInj) ? snippet.injectedLine : line;
          let cls = "ln";
          if (onSelectLine) cls += " sel";
          if (phase==="inject" && selectedLine===i) cls += " inj-row";
          if (phase==="review" && selectedLine===i) cls += " hi-row";
          if (phase==="reveal" && isInj) cls += selectedLine===i ? " ok-rev" : " bad-rev";
          return (
            <div key={i} className={cls} onClick={()=>onSelectLine?.(i)}>
              <span className="lnum">{i+1}</span>
              <span className={cx("lcode", phase==="inject"&&selectedLine===i?"rd":"")}>{text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── TopBar ────────────────────────────────────────────────────────────────────

function TopBar({ gs, myRole, roomCode, onLeave, ticks }) {
  const phases = ["inject","review","reveal"];
  const order  = ["lobby","inject","review","reveal"];
  return (
    <div className="tb">
      <div className="tb-logo">Bug<span>Lab</span></div>
      {phases.map(p=>(
        <div key={p} className={cx("pill", gs.phase===p?"on": order.indexOf(gs.phase)>order.indexOf(p)?"done":"")}>
          {p}
        </div>
      ))}
      <div className="sep"/>
      <div className={cx("pchip", myRole==="host"?"you":"")}><div className="cdot"/>🐛 Injector {myRole==="host"?"(you)":""}</div>
      <div className={cx("pchip", myRole==="guest"?"you":"")}><div className="cdot"/>🔍 Hunter {myRole==="guest"?"(you)":""}</div>
      <div className="sbadge">🐛 <span>{gs.scores[0]}</span> · 🔍 <span>{gs.scores[1]}</span></div>
      {roomCode && <div className="pill"># {roomCode}</div>}
      <span className="poll-badge">⟳ live</span>
      <button className="btn btn-gh btn-sm" onClick={onLeave}>Leave</button>
    </div>
  );
}

// ── connection screens ────────────────────────────────────────────────────────

function HomeScreen({ onCreate, onJoin, error }) {
  return (
    <div className="cscreen fade">
      <div style={{textAlign:"center"}}>
        <div className="blogo">Bug<span>Lab</span></div>
        <div className="bsub" style={{marginTop:8}}>real-time multiplayer bug injection</div>
      </div>
      <div style={{display:"flex",gap:12}}>
        <button className="btn btn-pr" style={{minWidth:150,padding:"13px 26px",fontSize:16}} onClick={onCreate}>
          Create room
        </button>
        <button className="btn btn-gh" style={{minWidth:150,padding:"13px 26px",fontSize:16}} onClick={onJoin}>
          Join room
        </button>
      </div>
      {error && <div className="cerr">{error}</div>}
      <div className="chint">One player creates a room and shares the 6-letter code.<br/>No accounts or installs needed — uses shared artifact storage.</div>
    </div>
  );
}

function WaitingScreen({ code, onCancel, onCopy, copied }) {
  return (
    <div className="cscreen fade">
      <div className="ccard">
        <div className="ctitle">Share this code with your opponent</div>
        <div className="rcode">{code}</div>
        <button className="btn btn-gh btn-fw" onClick={onCopy}>{copied?"✓ Copied!":"Copy code"}</button>
        <div className="waiting-p"><div className="pulse gr"/>Waiting for opponent to join…</div>
        <div className="chint">Your opponent opens BugLab → Join room → enters the code.<br/>You are the Injector 🐛</div>
        <button className="btn btn-gh btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function JoinScreen({ value, onChange, onJoin, onBack, error }) {
  return (
    <div className="cscreen fade">
      <div className="ccard">
        <div className="ctitle">Join a room</div>
        <input className="jfield" placeholder="Enter 6-letter code" maxLength={8}
          value={value} onChange={e=>onChange(e.target.value.toUpperCase())}
          onKeyDown={e=>e.key==="Enter"&&onJoin()}/>
        {error && <div className="cerr">{error}</div>}
        <div className="brow">
          <button className="btn btn-gh btn-fw" onClick={onBack}>Back</button>
          <button className="btn btn-pr btn-fw" disabled={!value.trim()} onClick={onJoin}>Connect →</button>
        </div>
        <div className="chint">You will be the Bug Hunter 🔍</div>
      </div>
    </div>
  );
}

function ConnectingScreen({ code }) {
  return (
    <div className="cscreen fade">
      <div className="ccard">
        <div className="waiting-p"><div className="pulse bl"/>Connecting to {code}…</div>
        <div className="chint">Checking shared storage for room…</div>
      </div>
    </div>
  );
}

function DisconnectedScreen({ onHome }) {
  return (
    <div className="cscreen fade">
      <div className="ccard">
        <div style={{fontSize:34}}>⚡</div>
        <div className="ctitle" style={{alignSelf:"center"}}>Room ended</div>
        <div className="chint" style={{textAlign:"center"}}>The host left or the session expired.</div>
        <button className="btn btn-pr btn-fw" onClick={onHome}>Back to home</button>
      </div>
    </div>
  );
}

// ── lobby ─────────────────────────────────────────────────────────────────────

function HostLobby({ gs, updateGs, onStart }) {
  return (
    <div className="lobby fade">
      <div style={{width:"100%",maxWidth:660}}>
        <div className="sl" style={{marginBottom:10}}>difficulty tier</div>
        <div className="tgrid">
          {DIFFICULTIES.map(d=>(
            <div key={d.id} className="tcard"
              style={gs.selectedTier===d.id?{borderColor:d.color,background:d.color+"14"}:{}}
              onClick={()=>updateGs({selectedTier:d.id,selectedSnippetId:null})}>
              <div className="tname" style={{color:gs.selectedTier===d.id?d.color:"var(--bright)"}}>{d.label}</div>
              <div className="tblurb">{d.blurb}</div>
              <div className="tmult" style={{color:d.color}}>{d.multiplier}× pts</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{width:"100%",maxWidth:660}}>
        <div className="sl" style={{marginBottom:10}}>select snippet</div>
        <div className="sgrid">
          {SNIPPETS.filter(s=>s.difficulty===gs.selectedTier).map(s=>{
            const d=DIFFICULTIES.find(x=>x.id===s.difficulty);
            return (
              <div key={s.id} className={cx("scard",gs.selectedSnippetId===s.id?"on":"")}
                onClick={()=>updateGs({selectedSnippetId:s.id})}>
                <div className="slang">{s.language}</div>
                <div className="sname">{s.label}</div>
                <div className="smeta">
                  <span className="slines">{s.lines.length} lines</span>
                  <span className="tdot" style={{background:d.color}}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <button className="btn btn-pr" style={{minWidth:210}} disabled={!gs.selectedSnippetId} onClick={onStart}>
        Start round →
      </button>
      <div className="hint" style={{textAlign:"center"}}>
        You inject · opponent hunts · 60 pts line + 40 pts type · scaled by tier
      </div>
    </div>
  );
}

function GuestLobby({ gs }) {
  const d = DIFFICULTIES.find(x=>x.id===gs.selectedTier)||DIFFICULTIES[0];
  return (
    <div className="cscreen fade">
      <div className="ginfo">
        <div style={{fontSize:30,marginBottom:10}}>🔍</div>
        <div style={{fontSize:17,fontWeight:700,color:"var(--bright)",marginBottom:8}}>You are the Bug Hunter</div>
        <div className="chint" style={{marginBottom:14}}>Injector is choosing a snippet…</div>
        <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
          <span className="tag" style={{borderColor:d.color,color:d.color,background:d.color+"14"}}>
            {d.label} · {d.multiplier}×
          </span>
          {gs.selectedSnippetId && (
            <span className="tag" style={{borderColor:"var(--border-hi)",color:"var(--text)"}}>
              {SNIPPETS.find(s=>s.id===gs.selectedSnippetId)?.label}
            </span>
          )}
        </div>
      </div>
      <div className="waiting-p"><div className="pulse bl"/>Waiting for injector to start…</div>
    </div>
  );
}

// ── inject / review / wait ────────────────────────────────────────────────────

function HostInjectPanel({ gs, snippet, updateGs, onSubmit }) {
  return (
    <div className="gpanel fade">
      <div className="ph">
        <div className="pi pi-pu">🐛</div>
        <div><div className="ptitle">Inject the bug</div><div className="prole">INJECTOR · your turn</div></div>
        {gs.injectorSubmitted && <span className="tag" style={{marginLeft:"auto",borderColor:"var(--green)",color:"var(--green)",background:"var(--green-bg)"}}>✓ injected</span>}
      </div>
      <CodeView snippet={snippet} selectedLine={gs.injectorLine}
        onSelectLine={!gs.injectorSubmitted?(i=>updateGs({injectorLine:i})):null}
        showInjected={false} phase="inject"/>
      {!gs.injectorSubmitted ? (
        <>
          <div>
            <div className="sl" style={{marginBottom:6}}>step 1 — click the line to inject on</div>
            {gs.injectorLine!==null && (
              <div className="hint" style={{marginTop:4}}>
                Line {gs.injectorLine+1} selected. Will inject:&nbsp;
                <span style={{color:"var(--red)",fontFamily:"var(--mono)",fontSize:12}}>{snippet.injectedLine}</span>
              </div>
            )}
          </div>
          <div>
            <div className="sl" style={{marginBottom:8}}>step 2 — declare the bug type</div>
            <div className="bgrid">
              {BUG_TYPES.filter(b=>b.tier===snippet.difficulty).map(b=>(
                <div key={b.id} className="bchip"
                  style={gs.injectorBugType===b.id?{borderColor:b.color,background:b.color+"18",color:b.color}:{}}
                  onClick={()=>updateGs({injectorBugType:b.id})}>{b.label}</div>
              ))}
            </div>
          </div>
          <button className="btn btn-dn btn-fw"
            disabled={gs.injectorLine===null||!gs.injectorBugType} onClick={onSubmit}>
            Inject &amp; lock →
          </button>
        </>
      ) : (
        <div className="waiting-p" style={{marginTop:8}}><div className="pulse bl"/>Transmitting to hunter…</div>
      )}
    </div>
  );
}

function HostWaitPanel({ snippet }) {
  return (
    <div className="gpanel fade">
      <div className="ph">
        <div className="pi pi-am">⏳</div>
        <div><div className="ptitle">Waiting for hunter</div><div className="prole">INJECTOR · round locked</div></div>
      </div>
      <CodeView snippet={snippet} selectedLine={null} onSelectLine={null} showInjected={true} phase="locked"/>
      <div className="waiting-p"><div className="pulse bl"/>Hunter is reviewing the code…</div>
    </div>
  );
}

function GuestWaitPanel() {
  return (
    <div className="gwait fade">
      <div style={{fontSize:38}}>🐛</div>
      <div className="gwait-t">Injector is planting the bug…</div>
      <div className="waiting-p"><div className="pulse bl"/>Stand by</div>
    </div>
  );
}

// GuestReviewPanel uses LOCAL state for selections (no round-trip lag),
// then fires onSubmit once with the final answers.
function GuestReviewPanel({ snippet, difficulty, onSubmit }) {
  const [line, setLine]       = useState(null);
  const [bugType, setBugType] = useState(null);
  const [done, setDone]       = useState(false);

  function submit() {
    if (line===null||!bugType||done) return;
    setDone(true);
    onSubmit(line, bugType);
  }

  return (
    <div className="gpanel fade">
      <div className="ph">
        <div className="pi pi-gr">🔍</div>
        <div><div className="ptitle">Find the bug</div><div className="prole">HUNTER · your turn</div></div>
        {done && <span className="tag" style={{marginLeft:"auto",borderColor:"var(--green)",color:"var(--green)",background:"var(--green-bg)"}}>✓ submitted</span>}
      </div>
      <CodeView snippet={snippet} selectedLine={line}
        onSelectLine={!done?setLine:null}
        showInjected={true} phase="review"/>
      {!done ? (
        <>
          <div>
            <div className="sl" style={{marginBottom:6}}>step 1 — click the buggy line</div>
            {line!==null&&<div className="hint" style={{marginTop:4}}>Line {line+1} flagged.</div>}
          </div>
          <div>
            <div className="sl" style={{marginBottom:8}}>step 2 — identify the bug type</div>
            <div className="bgrid">
              {BUG_TYPES.filter(b=>b.tier===difficulty).map(b=>(
                <div key={b.id} className="bchip"
                  style={bugType===b.id?{borderColor:b.color,background:b.color+"18",color:b.color}:{}}
                  onClick={()=>setBugType(b.id)}>{b.label}</div>
              ))}
            </div>
          </div>
          <button className="btn btn-pr btn-fw" disabled={line===null||!bugType} onClick={submit}>
            Submit analysis →
          </button>
        </>
      ) : (
        <div className="waiting-p" style={{marginTop:8}}><div className="pulse bl"/>Waiting for reveal…</div>
      )}
    </div>
  );
}

// ── reveal ────────────────────────────────────────────────────────────────────

function RevealScreen({ gs, snippet, isHost, onNextRound }) {
  const d        = DIFFICULTIES.find(x=>x.id===snippet.difficulty)||DIFFICULTIES[0];
  const mult     = d.multiplier;
  const lc       = gs.hunterLine    === snippet.bugLine;
  const tc       = gs.hunterBugType === snippet.bugType;
  const base     = (lc?60:0)+(tc?40:0);
  const hunterPts= Math.round(base*mult);
  const maxPts   = Math.round(100*mult);
  const verdict  = base===100?"Perfect catch!":base>=60?"Close!":"Missed it.";
  const vcls     = base===100?"win":base>=60?"pt":"lose";
  return (
    <div className="reveal fade">
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div className={cx("rv-title",vcls)}>{verdict}</div>
        <span className="tag" style={{borderColor:d.color,color:d.color,background:d.color+"14"}}>{d.label} · {mult}×</span>
      </div>
      <div className="sgrid3">
        <div className="sc">
          <div className="sc-lbl">line detection</div>
          <div className="sc-val" style={{color:lc?"var(--green)":"var(--red)"}}>{lc?"+"+Math.round(60*mult):"+0"}</div>
          <div className="sc-sub">{lc?"correct — line "+(snippet.bugLine+1):"missed — was line "+(snippet.bugLine+1)}</div>
        </div>
        <div className="sc">
          <div className="sc-lbl">bug type</div>
          <div className="sc-val" style={{color:tc?"var(--green)":"var(--red)"}}>{tc?"+"+Math.round(40*mult):"+0"}</div>
          <div className="sc-sub">{tc?"correct":"was: "+BUG_TYPES.find(b=>b.id===snippet.bugType)?.label}</div>
        </div>
        <div className="sc">
          <div className="sc-lbl">hunter total</div>
          <div className="sc-val" style={{color:"var(--amber)"}}>{hunterPts}<span style={{fontSize:13,color:"var(--dim)"}}> / {maxPts}</span></div>
          <div className="sc-sub">injector earns {maxPts-hunterPts} pts</div>
        </div>
      </div>
      <div>
        <div className="sl" style={{marginBottom:9}}>diff</div>
        <div className="diff-b">
          <div className="diff-h">{snippet.language} · {snippet.label} · line {snippet.bugLine+1}</div>
          <div className="dln rm"><span className="dsign">−</span>{snippet.injectedLine}</div>
          <div className="dln add"><span className="dsign">+</span>{snippet.patch}</div>
        </div>
      </div>
      <div>
        <div className="sl" style={{marginBottom:9}}>explanation</div>
        <div className="expl">{snippet.explanation}</div>
      </div>
      <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
        {isHost
          ? <button className="btn btn-pr" onClick={onNextRound}>Next round →</button>
          : <div className="waiting-p"><div className="pulse bl"/>Waiting for injector to start next round…</div>}
        <div style={{fontFamily:"var(--mono)",fontSize:13,color:"var(--dim)"}}>
          🐛 <span style={{color:"var(--bright)"}}>{gs.scores[0]}</span>
          &nbsp;·&nbsp;🔍 <span style={{color:"var(--bright)"}}>{gs.scores[1]}</span>
        </div>
      </div>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function BugLab() {
  injectStyles();

  const [connState, setConnState] = useState("home");
  // home | waiting | joining | connecting | connected | disconnected
  const [myRole,    setMyRole]    = useState(null);   // "host" | "guest"
  const [roomCode,  setRoomCode]  = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [connError, setConnError] = useState("");
  const [copied,    setCopied]    = useState(false);
  const [gs,        setGs]        = useState(INIT_GS);
  const [ticks,     setTicks]     = useState(0); // just to show liveness

  // Refs (always fresh in poll callbacks)
  const gsRef        = useRef(INIT_GS);
  const connRef      = useRef("home");
  const roleRef      = useRef(null);
  const codeRef      = useRef("");
  const pollRef      = useRef(null);
  const joinTries    = useRef(0);

  gsRef.current   = gs;
  connRef.current = connState;
  roleRef.current = myRole;

  useEffect(() => () => clearInterval(pollRef.current), []);

  // ── write helpers ──
  async function hostWrite(data) {
    await storeSet("buglab:h:"+codeRef.current, data);
  }
  async function guestWrite(data) {
    await storeSet("buglab:g:"+codeRef.current, data);
  }

  // ── updateGs (host) — merges, persists, and re-renders ──
  function updateGs(updates) {
    setGs(prev => {
      const next = typeof updates==="function" ? updates(prev) : {...prev,...updates};
      gsRef.current = next;
      hostWrite({ gs:next, ts:Date.now() });
      return next;
    });
  }

  // ── host poll tick ──
  async function hostTick() {
    const gdata = await storeGet("buglab:g:"+codeRef.current);
    if (!gdata) return;

    // Guest joined?
    if (connRef.current==="waiting" && gdata.joined) {
      setConnState("connected"); setMyRole("host"); roleRef.current="host";
      hostWrite({ gs:gsRef.current, ts:Date.now() });
      setTicks(t=>t+1); return;
    }

    // Process guest submission during review
    if (connRef.current==="connected" && gsRef.current.phase==="review" &&
        gdata.submitted && !gsRef.current.hunterSubmitted &&
        gdata.round===gsRef.current.round) {
      const sn   = SNIPPETS.find(s=>s.id===gsRef.current.snippetId);
      const mult = DIFFICULTIES.find(d=>d.id===sn.difficulty)?.multiplier||1;
      const lc   = gdata.hunterLine===sn.bugLine;
      const tc   = gdata.hunterBugType===sn.bugType;
      const base = (lc?60:0)+(tc?40:0);
      const hp   = Math.round(base*mult);
      const ip   = Math.round((100-base)*mult);
      updateGs(prev=>({
        ...prev,
        hunterLine:     gdata.hunterLine,
        hunterBugType:  gdata.hunterBugType,
        hunterSubmitted:true,
        phase:          "reveal",
        scores:         [prev.scores[0]+ip, prev.scores[1]+hp],
      }));
    }
    setTicks(t=>t+1);
  }

  // ── guest poll tick ──
  async function guestTick() {
    const hdata = await storeGet("buglab:h:"+codeRef.current);
    if (hdata?.gs) {
      setGs(hdata.gs); gsRef.current = hdata.gs;
      if (connRef.current==="connecting") {
        setConnState("connected"); setMyRole("guest"); roleRef.current="guest";
      }
      setTicks(t=>t+1);
    } else {
      joinTries.current++;
      if (joinTries.current>=8) {
        clearInterval(pollRef.current);
        setConnError("Room not found. Check the code and try again.");
        setConnState("joining");
      }
    }
  }

  // ── start polling ──
  function startPolling(role) {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(()=>{
      role==="host" ? hostTick() : guestTick();
    }, 2000);
  }

  // ── create room ──
  async function createRoom() {
    const code = genCode();
    codeRef.current = code; setRoomCode(code); setConnError("");
    await hostWrite({ gs:INIT_GS, ts:Date.now() });
    setConnState("waiting");
    startPolling("host");
  }

  // ── join room ──
  async function joinRoom() {
    if (!joinInput.trim()) return;
    const code = joinInput.trim().toUpperCase();
    codeRef.current = code; setConnError(""); joinTries.current = 0;
    await guestWrite({ joined:true, ts:Date.now() });
    setConnState("connecting");
    startPolling("guest");
  }

  // ── game actions ──
  function startGame() {
    const sn = SNIPPETS.find(s=>s.id===gs.selectedSnippetId);
    if (!sn) return;
    updateGs({ phase:"inject", snippetId:sn.id,
      injectorLine:null, injectorBugType:null, injectorSubmitted:false,
      hunterLine:null, hunterBugType:null, hunterSubmitted:false });
  }

  function submitInjector() {
    if (gs.injectorLine===null||!gs.injectorBugType) return;
    updateGs({ injectorSubmitted:true });
  }

  // Auto-advance inject → review
  useEffect(()=>{
    if (myRole==="host" && gs.injectorSubmitted && gs.phase==="inject") {
      const t = setTimeout(()=>updateGs({phase:"review"}), 1200);
      return ()=>clearTimeout(t);
    }
  }, [gs.injectorSubmitted, gs.phase, myRole]);

  function nextRound() {
    updateGs({ ...INIT_GS, scores:gs.scores, round:gs.round+1 });
  }

  // Guest submits their answer (called by GuestReviewPanel)
  async function guestSubmit(hunterLine, hunterBugType) {
    await guestWrite({
      joined:true, submitted:true,
      hunterLine, hunterBugType,
      round:gsRef.current.round,
      ts:Date.now(),
    });
  }

  function disconnect() {
    clearInterval(pollRef.current);
    setConnState("home"); setMyRole(null); setGs(INIT_GS);
    setRoomCode(""); setJoinInput(""); setConnError("");
    codeRef.current=""; gsRef.current=INIT_GS; joinTries.current=0;
  }

  function copyCode() {
    navigator.clipboard?.writeText(roomCode).catch(()=>{});
    setCopied(true); setTimeout(()=>setCopied(false),2000);
  }

  const isHost    = myRole==="host";
  const snippet   = gs.snippetId ? SNIPPETS.find(s=>s.id===gs.snippetId) : null;

  return (
    <div className="app">
      {connState==="connected" &&
        <TopBar gs={gs} myRole={myRole} roomCode={roomCode} onLeave={disconnect} ticks={ticks}/>}

      {connState==="home"        && <HomeScreen onCreate={createRoom} onJoin={()=>{setConnError("");setConnState("joining");}} error={connError}/>}
      {connState==="waiting"     && <WaitingScreen code={roomCode} onCancel={disconnect} onCopy={copyCode} copied={copied}/>}
      {connState==="joining"     && <JoinScreen value={joinInput} onChange={setJoinInput} onJoin={joinRoom} onBack={()=>setConnState("home")} error={connError}/>}
      {connState==="connecting"  && <ConnectingScreen code={joinInput}/>}
      {connState==="disconnected"&& <DisconnectedScreen onHome={disconnect}/>}

      {connState==="connected" && <>
        {gs.phase==="lobby"  && (isHost ? <HostLobby gs={gs} updateGs={updateGs} onStart={startGame}/> : <GuestLobby gs={gs}/>)}

        {gs.phase==="inject" && snippet && (
          isHost
            ? <HostInjectPanel gs={gs} snippet={snippet} updateGs={updateGs} onSubmit={submitInjector}/>
            : <GuestWaitPanel/>
        )}

        {gs.phase==="review" && snippet && (
          isHost
            ? <HostWaitPanel snippet={snippet}/>
            : <GuestReviewPanel snippet={snippet} difficulty={snippet.difficulty} onSubmit={guestSubmit}/>
        )}

        {gs.phase==="reveal" && snippet && (
          <RevealScreen gs={gs} snippet={snippet} isHost={isHost} onNextRound={isHost?nextRound:null}/>
        )}
      </>}
    </div>
  );
}
