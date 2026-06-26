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
  { id:"lastn",    difficulty:"easy",   language:"Python",     label:"last_n",
    lines:["def last_n(items, n):","    start = len(items) - n","    return items[start:]"],
    bugLine:1, bugType:"off-by-one",
    injectedLine:"    start = len(items) - n + 1",
    explanation:"Adding 1 to the start index shifts the window right by one, returning n-1 items instead of n.",
    patch:"    start = len(items) - n" },
  { id:"owner",    difficulty:"easy",   language:"JavaScript", label:"getOwnerName",
    lines:["function getOwnerName(item) {","  if (item.owner === null) return \"none\";","  return item.owner.name;","}"],
    bugLine:1, bugType:"null-deref",
    injectedLine:"  if (item.owner !== null) return \"none\";",
    explanation:"!== reverses the guard — the function returns early for valid owners and then dereferences a null owner.",
    patch:"  if (item.owner === null) return \"none\";" },
  { id:"status",   difficulty:"easy",   language:"Python",     label:"is_valid_status",
    lines:["def is_valid_status(status):","    valid = [\"active\", \"pending\", \"closed\"]","    if status in valid:","        return True","    return False"],
    bugLine:2, bugType:"logic-invert",
    injectedLine:"    if status not in valid:",
    explanation:"'not in' inverts the check — invalid statuses are accepted and valid ones are rejected.",
    patch:"    if status in valid:" },
  { id:"priority", difficulty:"easy",   language:"JavaScript", label:"priorityLabel",
    lines:["function priorityLabel(level) {","  let label = \"\";","  switch (level) {","    case 1: label = \"Low\"; break;","    case 2: label = \"Medium\"; break;","    case 3: label = \"High\"; break;","  }","  return label;","}"],
    bugLine:4, bugType:"missing-break",
    injectedLine:"    case 2: label = \"Medium\";",
    explanation:"Without break, case 2 falls through into case 3 — any level-2 call returns 'High'.",
    patch:"    case 2: label = \"Medium\"; break;" },
  { id:"mulall",   difficulty:"easy",   language:"Python",     label:"multiply_all",
    lines:["def multiply_all(nums, factor):","    result = []","    for n in nums:","        result.append(n * factor)","    return result"],
    bugLine:3, bugType:"wrong-op",
    injectedLine:"        result.append(n + factor)",
    explanation:"Adding factor to each element instead of multiplying produces the wrong transformation.",
    patch:"        result.append(n * factor)" },
  { id:"timer",    difficulty:"easy",   language:"JavaScript", label:"Timer class",
    lines:["class Timer {","  constructor() { this.elapsed = 0; }","  tick(ms) { this.elapsed += ms; }","  restart() {","    this.elapsed = 0;","  }","}"],
    bugLine:4, bugType:"uninit-var",
    injectedLine:"    elapsed = 0;",
    explanation:"'elapsed = 0' assigns to a global variable, not this.elapsed — the timer is never actually reset.",
    patch:"    this.elapsed = 0;" },
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

const ENCYCLOPEDIA = [
  // ── Easy ─────────────────────────────────────────────────────────────────────
  {
    id:"off-by-one", name:"Off-by-one Error", tier:"easy", color:"#f59e0b", lang:"C",
    description:"A calculation that is off by exactly 1 — in loop bounds, array indices, or length fields. The code looks nearly correct and often passes basic testing, which makes these bugs dangerous in security-critical code.",
    cves:[
      { id:"CVE-2002-0083", product:"OpenSSH ≤ 3.3",
        desc:"Off-by-one in channel array allocation let a remote authenticated user overwrite adjacent memory and gain root privileges on the server." },
      { id:"CVE-2021-28041", product:"OpenSSH 8.5p1 (ssh-agent)",
        desc:"Off-by-one in PKCS#11 library unloading caused a double-free on the one-too-many element, enabling memory corruption in the agent." },
    ],
    vuln:[
      "char buf[8];",
      "/* copies 8 bytes — no room for null terminator */",
      "strncpy(buf, input, 8);",
      "buf[8] = '\\0';  // ← one byte PAST end of buf!",
    ],
    fix:[
      "char buf[8];",
      "strncpy(buf, input, sizeof(buf) - 1);",
      "buf[sizeof(buf) - 1] = '\\0';  // always safe",
    ],
    explanation:"buf[8] has valid indices 0–7. Writing buf[8] is undefined behaviour. Always reserve one slot for '\\0': copy at most sizeof(buf)-1 bytes, then terminate at index sizeof(buf)-1.",
  },
  {
    id:"null-deref", name:"Null Dereference", tier:"easy", color:"#ef4444", lang:"C",
    description:"Reading or writing through a NULL pointer. At best it crashes the process; on older kernels with mmap_min_addr=0 the attacker could map page 0 and turn the crash into code execution.",
    cves:[
      { id:"CVE-2009-3620", product:"Linux kernel (ati128 GPU driver)",
        desc:"Null pointer dereference in ati128_do_wait_for_fifo — exploitable by a local user to escalate privileges by mapping page 0 (mmap_min_addr=0 era)." },
      { id:"CVE-2011-2517", product:"Linux kernel (mac80211 wireless)",
        desc:"Null dereference in the wireless stack when processing malformed management frames from a nearby AP, causing kernel panic." },
    ],
    vuln:[
      "struct user *u = find_user(id);",
      "/* u is NULL when user does not exist */",
      "printf(\"%s\\n\", u->name);  // ← crash or worse",
    ],
    fix:[
      "struct user *u = find_user(id);",
      "if (u == NULL) return -ENOENT;",
      "printf(\"%s\\n\", u->name);  // safe",
    ],
    explanation:"Always check pointer results from lookup functions before dereferencing. Go and Rust enforce this via nil-checks / Option<T>; in C and C++ it must be done manually. AddressSanitizer catches these at test time.",
  },
  {
    id:"logic-invert", name:"Inverted Condition", tier:"easy", color:"#a78bfa", lang:"C",
    description:"A boolean guard that uses the wrong comparator or negation, letting invalid inputs through or blocking valid ones. In authentication code a single wrong operator grants unlimited access.",
    cves:[
      { id:"CVE-2014-1266", product:"Apple iOS / OS X (SecureTransport)",
        desc:"A duplicated 'goto fail' meant the return value of the signature verification step was always 0 (success), silently bypassing TLS certificate validation for all connections." },
      { id:"CVE-2020-0601", product:"Windows CryptoAPI (crypt32.dll)",
        desc:"ECC public-key validation logic error allowed forged certificates to be accepted as trusted, enabling MITM attacks against HTTPS and Authenticode signatures." },
    ],
    vuln:[
      "/* strcmp returns 0 on MATCH, non-zero on mismatch */",
      "if (strcmp(input_pw, stored_pw) != 0) {",
      "    grant_access();  // ← grants on MISMATCH!",
      "}",
    ],
    fix:[
      "if (strcmp(input_pw, stored_pw) == 0) {",
      "    grant_access();",
      "}",
    ],
    explanation:"strcmp returns 0 when strings are equal. Comparing != 0 inverts the guard — every wrong password gets access. Always unit-test the rejection path explicitly; static analysis (clang-tidy) flags suspicious negations in auth contexts.",
  },
  {
    id:"missing-break", name:"Missing break", tier:"easy", color:"#fb923c", lang:"C",
    description:"Omitting a break statement causes switch-case fall-through: execution continues into the next case body, running unintended code that may corrupt state, bypass checks, or trigger heap corruption.",
    cves:[
      { id:"CVE-2019-3846", product:"Linux kernel (mwifiex WiFi driver)",
        desc:"Missing break in mwifiex_process_bss_descriptor_with_ie() caused fall-through to a different case, overflowing a heap buffer. A malicious AP could trigger RCE." },
      { id:"CVE-2020-8835", product:"Linux kernel (eBPF verifier)",
        desc:"Switch fall-through in the eBPF verifier's type-tracking logic caused type confusion, allowing local users to escalate privileges." },
    ],
    vuln:[
      "switch (command) {",
      "    case CMD_READ:",
      "        read_data();",
      "        // missing break — falls through!",
      "    case CMD_WRITE:",
      "        write_data();  // executes after CMD_READ too",
      "        break;",
      "}",
    ],
    fix:[
      "switch (command) {",
      "    case CMD_READ:",
      "        read_data();",
      "        break;  // ← explicit",
      "    case CMD_WRITE:",
      "        write_data();",
      "        break;",
      "}",
    ],
    explanation:"C/C++ fall through by default. Every case needs explicit break unless intentional (annotate with /* fallthrough */). Enable -Wimplicit-fallthrough in GCC/Clang. In Go and Rust, fall-through is opt-in (fallthrough keyword / never), reversing the dangerous default.",
  },
  {
    id:"wrong-op", name:"Wrong Operator", tier:"easy", color:"#38bdf8", lang:"C",
    description:"Using = instead of ==, & instead of &&, > instead of >=, or similar. The code compiles cleanly and looks right at a glance, but the semantics are entirely different — often silently granting access or computing wrong sizes.",
    cves:[
      { id:"CVE-2015-1538", product:"Android Stagefright (MP4 parser)",
        desc:"Wrong arithmetic operator caused integer underflow in the stsc atom parser — the miscalculated value produced a heap buffer overflow exploitable via a crafted MMS message, without user interaction." },
      { id:"CVE-2021-3156", product:"sudo (argument-parsing)",
        desc:"An off-by-one in the backslash-escape handling used the wrong operator on the length calculation, producing a heap overflow that allowed any local user to gain root." },
    ],
    vuln:[
      "/* bitwise & instead of logical && */",
      "if (ptr & ptr->is_valid) {  // true when ptr is non-null",
      "    use(ptr);               // is_valid field never checked!",
      "}",
      "",
      "/* assignment in condition (always true) */",
      "if (rc = do_auth(user, pass)) { grant(); }",
    ],
    fix:[
      "/* logical && short-circuits correctly */",
      "if (ptr && ptr->is_valid) {",
      "    use(ptr);",
      "}",
      "",
      "/* separate assignment from check */",
      "rc = do_auth(user, pass);",
      "if (rc == AUTH_OK) { grant(); }",
    ],
    explanation:"Enable -Wall -Wextra in C/C++ to catch = vs == in conditionals. Use === in JavaScript. Python makes = in conditions a syntax error by design. In C, wrap intentional assignment-in-condition in an extra pair of parentheses: if ((x = f())).",
  },
  {
    id:"uninit-var", name:"Uninitialised Variable", tier:"easy", color:"#34d399", lang:"C",
    description:"Using a variable before assigning it a defined value. In C/C++ the value is whatever garbage was in that stack slot — this leaks kernel data or enables logic errors. In managed languages it throws or silently produces a zero/null.",
    cves:[
      { id:"CVE-2017-1000410", product:"Linux kernel (Bluetooth L2CAP)",
        desc:"Uninitialised stack variable in l2cap_parse_conf_rsp leaked up to 32 bytes of kernel stack memory to unprivileged local users via getsockopt, exposing KASLR addresses." },
      { id:"CVE-2020-14386", product:"Linux kernel (AF_PACKET)",
        desc:"Uninitialised variable in packet_recvmsg led to a heap out-of-bounds write, exploitable for local privilege escalation to root." },
    ],
    vuln:[
      "int result;   // uninitialised",
      "if (condition) {",
      "    result = compute();",
      "}",
      "return result;  // ← garbage value if condition is false",
    ],
    fix:[
      "int result = -1;  // explicit safe default",
      "if (condition) {",
      "    result = compute();",
      "}",
      "return result;",
    ],
    explanation:"Initialise every variable at its declaration. Use -Wuninitialized (GCC/Clang) or run Valgrind/ASan. Rust refuses to compile code that reads possibly-uninitialised variables at the type-system level, eliminating this entire class.",
  },
  // ── Medium ────────────────────────────────────────────────────────────────────
  {
    id:"predicate-weak", name:"Predicate Weakening", tier:"medium", color:"#a78bfa", lang:"Python",
    description:"A validation condition is too permissive — 'or' where 'and' is needed, < where <= is required, or a missing lower-bound check. Values that should be rejected sail through unchanged.",
    cves:[
      { id:"CVE-2020-1472", product:"Microsoft Netlogon (Zerologon)",
        desc:"The authentication loop accepted up to 256 zero-padded guesses. A weak predicate on the session-key check meant an all-zero key was accepted, allowing instantaneous domain controller compromise with no credentials." },
      { id:"CVE-2019-19781", product:"Citrix ADC / NetScaler Gateway",
        desc:"A directory-traversal path check used OR logic that a crafted URL could satisfy with an unintended component, leading to unauthenticated RCE on the appliance." },
    ],
    vuln:[
      "def is_valid_percentage(pct):",
      "    # 'or' — ANY number satisfies one side of this",
      "    if pct >= 0 or pct <= 100:",
      "        return True",
      "    return False",
      "",
      "is_valid_percentage(9999)  # → True  (wrong!)",
      "is_valid_percentage(-50)   # → True  (wrong!)",
    ],
    fix:[
      "def is_valid_percentage(pct):",
      "    if pct >= 0 and pct <= 100:",
      "        return True",
      "    return False",
    ],
    explanation:"With 'or', `pct >= 0 or pct <= 100` holds for every real number — positives satisfy the left side, negatives satisfy the right. Both bounds must hold simultaneously, so 'and' is correct. Fuzz with values like -1, 0, 100, 101, sys.maxsize to catch weak predicates.",
  },
  {
    id:"wrong-cache", name:"Bad Memoization", tier:"medium", color:"#38bdf8", lang:"JavaScript",
    description:"A cache key that doesn't encode all inputs affecting the output creates collisions — two different inputs share a slot and return each other's results, potentially leaking privileged data across user sessions.",
    cves:[
      { id:"CVE-2020-5902", product:"F5 BIG-IP TMUI (management UI)",
        desc:"The TMUI cache key omitted authentication state. A crafted URL caused cached admin pages to be served to unauthenticated users, enabling unauthenticated RCE on the management plane. CVSS 10.0." },
      { id:"CVE-2018-6389", product:"WordPress (load-scripts.php)",
        desc:"Script loader cached responses keyed only on the requested file list, ignoring user context, enabling DoS by requesting all registered scripts in a single unauthenticated request." },
    ],
    vuln:[
      "const cache = new Map();",
      "function getReport(userId, role) {",
      "    // key omits role — admin sees user data and vice-versa",
      "    if (cache.has(userId)) return cache.get(userId);",
      "    const data = fetchReport(userId, role);",
      "    cache.set(userId, data);",
      "    return data;",
      "}",
    ],
    fix:[
      "const cache = new Map();",
      "function getReport(userId, role) {",
      "    const key = userId + ':' + role;  // all inputs in key",
      "    if (cache.has(key)) return cache.get(key);",
      "    const data = fetchReport(userId, role);",
      "    cache.set(key, data);",
      "    return data;",
      "}",
    ],
    explanation:"The cache key must uniquely fingerprint every input that affects the output. Missing an input creates a data-mixing bug. Include user ID, role, locale, version, or any dimension that changes 'the correct answer'. Review cache eviction too — stale entries must expire.",
  },
  {
    id:"dangling-iter", name:"Dangling Iterator", tier:"medium", color:"#fb923c", lang:"Python",
    description:"Modifying a collection while iterating over it causes skipped elements (removal shifts indices), repeated elements (insertion), or crash (C++ iterator invalidation). The resulting behaviour is undefined and input-dependent.",
    cves:[
      { id:"CVE-2011-4862", product:"FreeBSD telnetd",
        desc:"The telrcv() receive loop iterated over a buffer while simultaneously consuming from it via telnet option processing, allowing a remote attacker to corrupt memory through specially crafted option sequences." },
      { id:"CVE-2021-35395", product:"Realtek SDK WiFi driver",
        desc:"Iterator invalidation in vendor SDK list processing during AP scanning caused heap corruption, enabling unauthenticated RCE by broadcasting malicious beacon frames." },
    ],
    vuln:[
      "def remove_expired(sessions):",
      "    for s in sessions:        # iterator over live list",
      "        if s.expired():",
      "            sessions.remove(s)  # ← mutates the list!",
      "    return sessions",
      "",
      "# Elements shift — every other expired entry is skipped",
    ],
    fix:[
      "def remove_expired(sessions):",
      "    # iterate a snapshot, mutate the original",
      "    for s in list(sessions):",
      "        if s.expired():",
      "            sessions.remove(s)",
      "    return sessions",
      "    # or: return [s for s in sessions if not s.expired()]",
    ],
    explanation:"Iterate a snapshot (list(sessions)) while modifying the original, or build a new filtered list with a comprehension. In C++, use the erase-remove idiom or std::erase_if (C++20). In Java, use Iterator.remove() — not Collection.remove() inside a for-each.",
  },
  {
    id:"state-corrupt", name:"State Corruption", tier:"medium", color:"#f59e0b", lang:"Python",
    description:"A partially-completed multi-step operation fails midway, leaving shared or persistent state in an inconsistent half-old/half-new mix. Subsequent operations see contradictory invariants.",
    cves:[
      { id:"CVE-2014-6271", product:"GNU Bash (Shellshock)",
        desc:"Bash imported function definitions from environment variables but kept parsing past the closing brace, corrupting the shell's execution environment with trailing commands that ran immediately — enabling RCE in CGI scripts." },
      { id:"CVE-2021-28952", product:"Linux kernel (Nouveau GPU driver)",
        desc:"Error recovery in GPU command submission partially updated driver state, leaving the hardware context inconsistent between kernel and GPU, exploitable by local users for privilege escalation." },
    ],
    vuln:[
      "def transfer(src, dst, amount):",
      "    src.balance -= amount      # ← applied",
      "    if not dst.is_active():   # ← check after deduction!",
      "        raise ValueError('inactive dst')  # money gone",
      "    dst.balance += amount",
    ],
    fix:[
      "def transfer(src, dst, amount):",
      "    if not dst.is_active():    # validate ALL preconditions first",
      "        raise ValueError('inactive dst')",
      "    src.balance -= amount",
      "    dst.balance += amount",
    ],
    explanation:"Validate all preconditions before making any mutations. For cross-resource operations, use database transactions (ACID atomicity), two-phase commit, or a rollback pattern so any failure leaves the system unchanged from before the call.",
  },
  // ── Hard ─────────────────────────────────────────────────────────────────────
  {
    id:"toctou", name:"TOCTOU Race", tier:"hard", color:"#f4485e", lang:"C",
    description:"Time-of-Check to Time-of-Use: a window between checking a condition and acting on it lets an attacker swap state in the gap. The classic vector is replacing a regular file with a symlink between access() and open().",
    cves:[
      { id:"CVE-2017-7533", product:"Linux kernel (inotify / dcache)",
        desc:"TOCTOU race in inotify_handle_event allowed dentry substitution between notification dispatch and the subsequent lookup, enabling privilege escalation via crafted filesystem events." },
      { id:"CVE-2019-14615", product:"Intel GPU i915 driver",
        desc:"TOCTOU in context descriptor validation: a field checked by the driver could be overwritten by a concurrent GPU submission before it was consumed, bypassing security isolation between VMs." },
    ],
    vuln:[
      "/* attacker swaps /tmp/file → /etc/shadow between",
      "   access() and open() */",
      "if (access(\"/tmp/file\", R_OK) == 0) {",
      "    int fd = open(\"/tmp/file\", O_RDONLY);",
      "    read(fd, buf, sizeof(buf));  // may read /etc/shadow!",
      "}",
    ],
    fix:[
      "/* open() with O_NOFOLLOW is atomic — no symlink race */",
      "int fd = open(\"/tmp/file\", O_RDONLY | O_NOFOLLOW);",
      "if (fd < 0) { perror(\"open\"); return -1; }",
      "/* operate on fd, not path — path can't change under us */",
      "read(fd, buf, sizeof(buf));",
      "close(fd);",
    ],
    explanation:"Eliminate the check-then-use gap by using atomic kernel operations. open(O_CREAT|O_EXCL) atomically creates-and-opens. openat(dirfd, name, O_NOFOLLOW) prevents symlink substitution. Check permissions via fd (fstat/faccessat) rather than the path.",
  },
  {
    id:"lock-inversion", name:"Lock-order Inversion", tier:"hard", color:"#f59e0b", lang:"Python",
    description:"Two threads acquire the same set of locks in different orders. If Thread A holds Lock-1 and waits for Lock-2 while Thread B holds Lock-2 and waits for Lock-1, both block forever — deadlock.",
    cves:[
      { id:"CVE-2019-2182", product:"Android kernel (mm / flock)",
        desc:"Lock order inversion between mm->mmap_sem and file_lock in concurrent madvise() and flock() calls created a deadlock vector exploitable by local apps as a denial-of-service." },
      { id:"CVE-2017-9077", product:"Linux kernel (TCP stack)",
        desc:"Lock order inversion in tcp_sendmsg between sk_lock and a preemption disable caused a kernel hang under specific socket send load, triggering a local DoS." },
    ],
    vuln:[
      "# Thread 1              # Thread 2",
      "lock_A.acquire()        lock_B.acquire()",
      "# ... critical work ... # ... critical work ...",
      "lock_B.acquire()        lock_A.acquire()  # DEADLOCK",
      "lock_B.release()        lock_A.release()",
      "lock_A.release()        lock_B.release()",
    ],
    fix:[
      "def acquire_ordered(*locks):",
      "    # canonical order by object id — same every thread",
      "    for lk in sorted(locks, key=id):",
      "        lk.acquire()",
      "",
      "# Both threads call with same argument order now",
      "acquire_ordered(lock_A, lock_B)",
    ],
    explanation:"Establish a total ordering on locks (by address, ID, or declared order) and enforce it across all threads. Linux's lockdep validator enforces this in kernel code. TSAN (ThreadSanitizer) detects inversions at runtime in C/C++/Go.",
  },
  {
    id:"double-free", name:"Double Free", tier:"hard", color:"#ef4444", lang:"C",
    description:"Calling free() twice on the same pointer corrupts the heap allocator's free-list metadata. An attacker who can trigger this can often redirect a future malloc() to an attacker-chosen address and gain code execution.",
    cves:[
      { id:"CVE-2019-11510", product:"Pulse Secure VPN (SSL VPN)",
        desc:"Double free in the VPN authentication handler was reachable without credentials, allowing remote attackers to read arbitrary files and achieve RCE on the appliance. Widely exploited in the wild." },
      { id:"CVE-2021-3493", product:"Ubuntu kernel (OverlayFS)",
        desc:"Double free in copy_file_range syscall handler exploitable by local users via overlayfs mounts for privilege escalation to root on affected Ubuntu kernels." },
    ],
    vuln:[
      "char *buf = malloc(SIZE);",
      "if (error_condition) {",
      "    free(buf);         // freed on error path",
      "}",
      "process(buf);          // use-after-free if error occurred",
      "free(buf);             // double-free in all cases!",
    ],
    fix:[
      "char *buf = malloc(SIZE);",
      "if (error_condition) {",
      "    free(buf);",
      "    buf = NULL;        // nullify immediately after free",
      "    return ERROR;",
      "}",
      "process(buf);",
      "free(buf);",
      "buf = NULL;",
    ],
    explanation:"Set the pointer to NULL after every free(). free(NULL) is a defined no-op, so subsequent frees are safe. Use AddressSanitizer (-fsanitize=address) to catch double-frees at test time. In C++, prefer std::unique_ptr — its destructor runs exactly once.",
  },
  {
    id:"resource-leak", name:"Resource Leak", tier:"hard", color:"#fb923c", lang:"Python",
    description:"An acquired resource (file descriptor, socket, lock, memory) is not released on every code path — especially exception/error paths. Over time the process exhausts its budget and fails or becomes vulnerable to resource-exhaustion attacks.",
    cves:[
      { id:"CVE-2019-10160", product:"Python CPython (urllib / http.client)",
        desc:"File descriptors leaked when an HTTP connection was interrupted before headers were fully read. Under load, long-running Python servers exhausted their fd table, causing denial of service." },
      { id:"CVE-2018-1000300", product:"libcurl (RTSP handler)",
        desc:"Each RTSP DESCRIBE request leaked one file descriptor in the option-handling path. Long-running libcurl applications eventually crashed when the process fd table was exhausted." },
    ],
    vuln:[
      "def read_config(path):",
      "    f = open(path)",
      "    data = f.read()     # if parse() raises, f is never closed",
      "    result = parse(data)",
      "    f.close()",
      "    return result",
    ],
    fix:[
      "def read_config(path):",
      "    with open(path) as f:   # closed on any exit path",
      "        data = f.read()",
      "    return parse(data)",
    ],
    explanation:"Use 'with' (Python context manager), try/finally, RAII (C++), or defer (Go) to guarantee cleanup on all exit paths — including exceptions, early returns, and panics. Never assume the happy path is the only path.",
  },
  // ── Expert ────────────────────────────────────────────────────────────────────
  {
    id:"int-truncation", name:"Integer Truncation", tier:"expert", color:"#f4485e", lang:"C",
    description:"A large integer (64-bit size_t or attacker-supplied count) is stored in a narrower type (32-bit int), silently discarding high bits. The truncated small value passes safety checks while causing the actual allocation to be too small, resulting in heap overflow.",
    cves:[
      { id:"CVE-2021-3156", product:"sudo (get_args heap overflow)",
        desc:"The argument-array size was computed as an int that overflowed for very long sudo command lines. The truncated small positive value caused malloc() to under-allocate, and the subsequent argv copy overflowed the heap — granting any local user root. CVSS 7.8." },
      { id:"CVE-2002-0639", product:"OpenSSH (keyboard-interactive auth)",
        desc:"Integer overflow in the challenge-response count truncated to a small type, wrapping the count to near-zero. This bypassed authentication or enabled heap corruption depending on the server's handling." },
    ],
    vuln:[
      "/* count comes from the network — attacker-controlled */",
      "int   num   = ntohl(hdr.count);    /* 32-bit signed  */",
      "int   bytes = num * sizeof(item);  /* overflows!     */",
      "void *buf   = malloc(bytes);       /* tiny alloc     */",
      "memcpy(buf, data, num * sizeof(item));  /* overflow! */",
    ],
    fix:[
      "uint32_t num = ntohl(hdr.count);",
      "if (num > MAX_ITEMS) return -EINVAL;",
      "size_t bytes = (size_t)num * sizeof(item); /* 64-bit */",
      "void *buf = malloc(bytes);",
      "if (!buf) return -ENOMEM;",
      "memcpy(buf, data, bytes);",
    ],
    explanation:"Perform size arithmetic in size_t (unsigned 64-bit on modern platforms). Check for multiplication overflow before computing sizes — or use reallocarray(3) which does the checked multiply internally. Never mix signed int with attacker-controlled sizes.",
  },
  {
    id:"signed-unsigned", name:"Signed / Unsigned Confusion", tier:"expert", color:"#ef4444", lang:"C",
    description:"Comparing a signed integer to an unsigned one silently promotes the signed value. A negative signed value becomes a very large unsigned number, bypassing upper-bound checks. This is the root cause of Heartbleed.",
    cves:[
      { id:"CVE-2014-0160", product:"OpenSSL (TLS Heartbeat — Heartbleed)",
        desc:"The heartbeat payload length was read as uint16 from the attacker's packet but there was no check that it was ≤ the actual remaining bytes. A negative or over-large length passed the missing lower-bound check, allowing the attacker to drain up to 64 KB of server memory per request, exposing private keys and session tokens. CVSS 7.5." },
      { id:"CVE-2008-2137", product:"Sun Solaris kernel (ioctl handler)",
        desc:"A signed/unsigned comparison in an ioctl argument handler let a negative user-supplied length pass an upper-bound check. When cast to size_t it became huge, triggering an out-of-bounds kernel memory read." },
    ],
    vuln:[
      "/* len is int16_t — attacker controls its value */",
      "int16_t  len = read_i16(packet);",
      "if (len > MAX_LEN) return ERROR;  /* passes if len < 0! */",
      "/* negative len cast to huge size_t → over-read */",
      "memcpy(response, heap_buf, len);",
    ],
    fix:[
      "uint16_t len = read_u16(packet);   /* unsigned from start */",
      "if (len == 0 || len > MAX_LEN) return ERROR;",
      "if (len > remaining_in_packet) return ERROR; /* Heartbleed fix */",
      "memcpy(response, packet_data, len);",
    ],
    explanation:"Lengths and sizes should always be unsigned types. Compile with -Wsign-compare to catch mixed-sign comparisons. The critical missing check in Heartbleed was not 'len > 0' but 'len ≤ actual payload bytes remaining in the packet'.",
  },
  {
    id:"timing-channel", name:"Timing Side Channel", tier:"expert", color:"#a78bfa", lang:"Python",
    description:"A secret-dependent early exit causes the comparison to take measurably different time depending on the secret value. An attacker who can make many requests and measure latency can recover the secret byte-by-byte without ever seeing it directly.",
    cves:[
      { id:"CVE-2003-0693", product:"OpenSSH (CBC mode padding oracle)",
        desc:"Timing differences in CBC decryption padding validation were measurable via network RTT — a man-in-the-middle could recover SSH plaintext through a padding oracle attack." },
      { id:"CVE-2016-6304", product:"OpenSSL (OCSP stapling response)",
        desc:"Non-constant-time comparison of OCSP nonce values leaked information about the server's expected nonce, enabling an attacker to infer private state through repeated timing measurements." },
    ],
    vuln:[
      "def verify_token(user_input, secret):",
      "    for a, b in zip(user_input, secret):",
      "        if a != b:",
      "            return False  # exits early on first mismatch",
      "    return len(user_input) == len(secret)",
      "",
      "# Attacker measures latency to learn which bytes match",
    ],
    fix:[
      "import hmac",
      "",
      "def verify_token(user_input, secret):",
      "    # constant time regardless of where mismatch occurs",
      "    return hmac.compare_digest(",
      "        user_input.encode(), secret.encode()",
      "    )",
    ],
    explanation:"Use constant-time comparison: Python hmac.compare_digest, C crypto_memcmp / CRYPTO_memcmp, Node.js crypto.timingSafeEqual. These XOR-accumulate differences and branch only once at the end. Never compare secrets with ==, !=, or strcmp.",
  },
  {
    id:"invariant-break", name:"Invariant Violation", tier:"expert", color:"#f59e0b", lang:"Python",
    description:"Code relies on an implicit invariant — a property assumed to always be true — that can be violated by unexpected input or operation order. When the invariant breaks, all code that relied on it produces undefined or exploitable results.",
    cves:[
      { id:"CVE-2014-6271", product:"GNU Bash (Shellshock)",
        desc:"Bash assumed env-var function definitions ended at the closing brace. The invariant 'env vars are inert data' was violated — trailing commands after the brace executed immediately on shell launch, enabling RCE in CGI scripts and DHCP hooks worldwide." },
      { id:"CVE-2021-44228", product:"Apache Log4j 2 (Log4Shell)",
        desc:"Log4j assumed log message strings were inert data. The invariant 'logging does not execute code' was violated by ${jndi:ldap://attacker/x} substitution in any logged string, triggering remote classloading and RCE. CVSS 10.0." },
    ],
    vuln:[
      "class SortedList:",
      "    def __init__(self):",
      "        self._data = []   # invariant: always sorted",
      "",
      "    def add(self, val):",
      "        self._data.append(val)   # ← breaks invariant!",
      "",
      "    def find(self, target):      # assumes sorted input",
      "        return binary_search(self._data, target)",
    ],
    fix:[
      "import bisect",
      "",
      "class SortedList:",
      "    def __init__(self):",
      "        self._data = []",
      "",
      "    def add(self, val):",
      "        bisect.insort(self._data, val)  # maintains order",
      "",
      "    def find(self, target):",
      "        i = bisect.bisect_left(self._data, target)",
      "        if i < len(self._data) and self._data[i] == target:",
      "            return self._data[i]",
      "        return None",
    ],
    explanation:"Document invariants explicitly via type signatures, assertions, or precondition comments. Use assert statements in debug builds to catch violations early. For security-relevant invariants — 'this string is shell-safe', 'this value is already escaped' — validate at every trust boundary.",
  },
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

/* tutorial */
.tut-wrap{flex:1;display:flex;flex-direction:column;overflow:hidden}
.tut-hdr{display:flex;align-items:center;gap:10px;padding:11px 20px;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0}
.tut-title{font-size:15px;font-weight:700;color:var(--bright)}
.tut-banner{display:flex;align-items:flex-start;gap:12px;padding:13px 20px;border-bottom:1px solid var(--border);flex-shrink:0}
.tut-inject-banner{background:rgba(244,72,94,.07);border-bottom:1px solid rgba(244,72,94,.22)}
.tut-hunt-banner{background:rgba(34,216,122,.06);border-bottom:1px solid rgba(34,216,122,.22)}
.tut-bico{font-size:20px;flex-shrink:0;padding-top:2px}
.tut-bttl{font-size:12px;font-weight:700;color:var(--bright);letter-spacing:.03em;margin-bottom:4px}
.tut-bmsg{font-size:13px;color:var(--text);line-height:1.65}
.tut-flow{flex:1;display:flex;flex-direction:column;overflow:hidden}

/* encyclopedia */
.ency{flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0}
.ency-hdr{display:flex;align-items:center;gap:12px;padding:13px 20px;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0}
.ency-title{font-size:18px;font-weight:800;color:var(--bright)}
.ency-body{display:flex;flex:1;overflow:hidden;min-height:0}
.ency-sidebar{width:210px;border-right:1px solid var(--border);overflow-y:auto;flex-shrink:0;background:var(--surface);padding:8px 0}
.ency-tier-lbl{font-family:var(--mono);font-size:10px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase;padding:10px 16px 4px}
.ency-item{padding:8px 14px;font-size:12px;cursor:pointer;color:var(--dim);display:flex;align-items:center;gap:8px;transition:background .1s}
.ency-item:hover{background:var(--surface2);color:var(--text)}
.ency-item.on{background:var(--accent-bg);color:var(--accent)}
.ency-edot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.ency-content{flex:1;overflow-y:auto;padding:24px 28px}
.ency-bug-title{font-size:22px;font-weight:800;color:var(--bright)}
.ency-section{margin-top:20px}
.ency-section-lbl{font-family:var(--mono);font-size:10px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)}
.ency-desc{font-size:13px;color:var(--text);line-height:1.8}
.cve-row{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);align-items:flex-start}
.cve-id{font-family:var(--mono);font-size:11px;color:var(--accent);min-width:135px;flex-shrink:0;padding-top:2px}
.cve-prod{font-size:12px;font-weight:700;color:var(--bright);margin-bottom:3px}
.cve-desc-t{font-size:11px;color:var(--dim);line-height:1.55}
.code-pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cblk{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);overflow:hidden}
.cblk-hdr{display:flex;align-items:center;gap:7px;padding:8px 12px;border-bottom:1px solid var(--border);background:var(--surface2)}
.cblk-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.cblk-lbl{font-family:var(--mono);font-size:11px}
.cblk-lbl.vuln{color:var(--red)}.cblk-lbl.fix{color:var(--green)}
.cblk-body{padding:14px;overflow-x:auto}
.cblk-code{font-family:var(--mono);font-size:12px;line-height:1.7;color:var(--text);white-space:pre;margin:0}
.ency-expl{background:var(--surface2);border-left:3px solid var(--accent);border-radius:0 var(--r) var(--r) 0;padding:12px 15px;font-size:13px;color:var(--text);line-height:1.7}
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

function TopBar({ gs, myRole, roomCode, onLeave, onEncy, ticks }) {
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
      <button className="btn btn-gh btn-sm" onClick={onEncy}>Encyc.</button>
      <button className="btn btn-gh btn-sm" onClick={onLeave}>Leave</button>
    </div>
  );
}

// ── connection screens ────────────────────────────────────────────────────────

function HomeScreen({ onCreate, onJoin, onEncy, onTutorial, error }) {
  return (
    <div className="cscreen fade">
      <div style={{textAlign:"center"}}>
        <div className="blogo">Bug<span>Lab</span></div>
        <div className="bsub" style={{marginTop:8}}>real-time multiplayer bug injection</div>
      </div>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center"}}>
        <button className="btn btn-pr" style={{minWidth:150,padding:"13px 26px",fontSize:16}} onClick={onCreate}>
          Create room
        </button>
        <button className="btn btn-gh" style={{minWidth:150,padding:"13px 26px",fontSize:16}} onClick={onJoin}>
          Join room
        </button>
      </div>
      {error && <div className="cerr">{error}</div>}
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-gh btn-sm" onClick={onTutorial}>Tutorial</button>
        <button className="btn btn-gh btn-sm" onClick={onEncy}>Encyclopedia</button>
      </div>
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

// ── encyclopedia ──────────────────────────────────────────────────────────────

function EncyclopediaDetail({ entry }) {
  const d = DIFFICULTIES.find(x => x.id === entry.tier) || DIFFICULTIES[0];
  return (
    <div className="fade">
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:10}}>
        <div className="ency-bug-title">{entry.name}</div>
        <span className="tag" style={{borderColor:d.color,color:d.color,background:d.color+"18"}}>{d.label}</span>
        <span className="tag" style={{borderColor:"var(--border)",color:"var(--dim)"}}>{entry.lang}</span>
      </div>

      <div className="ency-desc">{entry.description}</div>

      <div className="ency-section">
        <div className="ency-section-lbl">Real CVE Examples</div>
        <div>
          {entry.cves.map(cve => (
            <div key={cve.id} className="cve-row">
              <div className="cve-id">{cve.id}</div>
              <div>
                <div className="cve-prod">{cve.product}</div>
                <div className="cve-desc-t">{cve.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ency-section">
        <div className="ency-section-lbl">Code Samples</div>
        <div className="code-pair">
          <div className="cblk">
            <div className="cblk-hdr">
              <div className="cblk-dot" style={{background:"var(--red)"}}/>
              <span className="cblk-lbl vuln">Vulnerable</span>
            </div>
            <div className="cblk-body">
              <pre className="cblk-code">{entry.vuln.join("\n")}</pre>
            </div>
          </div>
          <div className="cblk">
            <div className="cblk-hdr">
              <div className="cblk-dot" style={{background:"var(--green)"}}/>
              <span className="cblk-lbl fix">Fixed</span>
            </div>
            <div className="cblk-body">
              <pre className="cblk-code">{entry.fix.join("\n")}</pre>
            </div>
          </div>
        </div>
      </div>

      <div className="ency-section" style={{marginBottom:24}}>
        <div className="ency-section-lbl">Why It Happens</div>
        <div className="ency-expl">{entry.explanation}</div>
      </div>
    </div>
  );
}

function EncyclopediaScreen({ onClose }) {
  const [selectedId, setSelectedId] = useState(ENCYCLOPEDIA[0].id);
  const entry = ENCYCLOPEDIA.find(e => e.id === selectedId);
  const tiers = ["easy","medium","hard","expert"];
  const tierLabels = {easy:"Easy",medium:"Medium",hard:"Hard",expert:"Expert"};

  return (
    <div className="ency">
      <div className="ency-hdr">
        <div className="ency-title">Bug Encyclopedia</div>
        <span className="hint" style={{flex:1}}>18 bug classes · real CVEs · code samples</span>
        <button className="btn btn-gh btn-sm" onClick={onClose}>← Back</button>
      </div>
      <div className="ency-body">
        <div className="ency-sidebar">
          {tiers.map(tier => (
            <div key={tier}>
              <div className="ency-tier-lbl">{tierLabels[tier]}</div>
              {ENCYCLOPEDIA.filter(e => e.tier === tier).map(e => (
                <div key={e.id}
                  className={cx("ency-item", selectedId === e.id ? "on" : "")}
                  onClick={() => setSelectedId(e.id)}>
                  <div className="ency-edot" style={{background:e.color}}/>
                  {e.name}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="ency-content">
          {entry && <EncyclopediaDetail key={entry.id} entry={entry} />}
        </div>
      </div>
    </div>
  );
}

// ── tutorial ──────────────────────────────────────────────────────────────────

const TUT_SN = SNIPPETS.find(s => s.id === "sum"); // sum_list · Python · Easy · off-by-one

function TutorialScreen({ onClose }) {
  const [phase,    setPhase]    = useState("intro");
  const [huntLine, setHuntLine] = useState(null);
  const [huntType, setHuntType] = useState(null);

  const sn     = TUT_SN;
  const btMeta = BUG_TYPES.find(b => b.id === sn.bugType);
  const lc     = huntLine === sn.bugLine;
  const tc     = huntType === sn.bugType;
  const pts    = (lc ? 60 : 0) + (tc ? 40 : 0);

  const STEP_LABELS = {
    "inject-watch": "Step 1 of 3 — Injector",
    "hunt-intro":   "Step 2 of 3 — Role switch",
    "hunt-line":    "Step 2 of 3 — Hunter",
    "hunt-type":    "Step 2 of 3 — Hunter",
    "hunt-submit":  "Step 2 of 3 — Hunter",
    "reveal":       "Step 3 of 3 — Reveal",
    "done":         "Complete",
  };

  function pickHuntType(id) {
    if (phase !== "hunt-type") return;
    setHuntType(id);
    setPhase("hunt-submit");
  }

  return (
    <div className="tut-wrap">
      {/* ── shared header ── */}
      <div className="tut-hdr">
        <div className="tut-title">Tutorial</div>
        {STEP_LABELS[phase] && <span className="poll-badge">{STEP_LABELS[phase]}</span>}
        <div className="sep"/>
        <button className="btn btn-gh btn-sm" onClick={onClose}>Skip ×</button>
      </div>

      {/* ── intro ── */}
      {phase === "intro" && (
        <div className="cscreen fade">
          <div style={{textAlign:"center",maxWidth:440}}>
            <div style={{fontSize:46,marginBottom:14}}>🐛</div>
            <div style={{fontSize:22,fontWeight:800,color:"var(--bright)",marginBottom:10}}>Welcome to BugLab</div>
            <div className="chint" style={{fontSize:13,lineHeight:1.9,marginBottom:24}}>
              BugLab is a two-player cat-and-mouse game.<br/>
              <strong style={{color:"var(--text)"}}>Injector 🐛</strong> — plants a bug in a code snippet.<br/>
              <strong style={{color:"var(--text)"}}>Hunter 🔍</strong> — reads the tampered code and finds it.<br/><br/>
              This tutorial walks you through <em>both roles</em> using a short Python snippet. Takes about 2 minutes.
            </div>
            <button className="btn btn-pr" style={{minWidth:200}} onClick={()=>setPhase("inject-watch")}>
              Start tutorial →
            </button>
          </div>
        </div>
      )}

      {/* ── inject-watch: demo the injector role ── */}
      {phase === "inject-watch" && (
        <div className="tut-flow fade">
          <div className="tut-banner tut-inject-banner">
            <div className="tut-bico">🐛</div>
            <div>
              <div className="tut-bttl">You are the Injector</div>
              <div className="tut-bmsg">
                Line {sn.bugLine+1} is pre-selected — the for-loop — and the bug type is already set to{" "}
                <strong style={{color:"var(--red)"}}>Off-by-one</strong>.{" "}
                Click <em>Inject &amp; lock</em> to plant the bug and switch to the Hunter's view.
              </div>
            </div>
          </div>
          <div className="gpanel">
            <CodeView snippet={sn} selectedLine={sn.bugLine}
              onSelectLine={null} showInjected={false} phase="inject"/>
            <div>
              <div className="sl" style={{marginBottom:8}}>bug type (pre-selected)</div>
              <div className="bgrid">
                {BUG_TYPES.filter(b => b.tier === sn.difficulty).map(b => (
                  <div key={b.id} className="bchip"
                    style={b.id===sn.bugType?{borderColor:b.color,background:b.color+"18",color:b.color}:{}}>
                    {b.label}
                  </div>
                ))}
              </div>
            </div>
            <button className="btn btn-dn btn-fw" onClick={()=>setPhase("hunt-intro")}>
              Inject &amp; lock →
            </button>
          </div>
        </div>
      )}

      {/* ── hunt-intro: role-switch explanation ── */}
      {phase === "hunt-intro" && (
        <div className="cscreen fade">
          <div style={{textAlign:"center",maxWidth:440}}>
            <div style={{fontSize:46,marginBottom:14}}>🔍</div>
            <div style={{fontSize:20,fontWeight:800,color:"var(--bright)",marginBottom:10}}>Role Switch — You're the Hunter</div>
            <div className="chint" style={{fontSize:13,lineHeight:1.85,marginBottom:24}}>
              The bug is now planted. In a real match the Hunter sees only the modified code — they have no idea which line was changed or what type of bug was injected.<br/><br/>
              Read the snippet carefully and try to spot what's wrong.
            </div>
            <button className="btn btn-pr" style={{minWidth:200}} onClick={()=>setPhase("hunt-line")}>
              Start hunting →
            </button>
          </div>
        </div>
      )}

      {/* ── hunt phases ── */}
      {(phase==="hunt-line"||phase==="hunt-type"||phase==="hunt-submit") && (
        <div className="tut-flow fade">
          <div className="tut-banner tut-hunt-banner">
            <div className="tut-bico">🔍</div>
            <div>
              <div className="tut-bttl">You are the Hunter</div>
              <div className="tut-bmsg">
                {phase==="hunt-line" && "Click the line you think contains the injected bug."}
                {phase==="hunt-type" && <>Line {(huntLine??0)+1} flagged. <strong>What kind of bug is it?</strong> Select the bug type below.</>}
                {phase==="hunt-submit" && "Analysis complete. Click Submit to reveal the result."}
              </div>
            </div>
          </div>
          <div className="gpanel">
            <CodeView snippet={sn} selectedLine={huntLine}
              onSelectLine={phase==="hunt-line" ? i=>{setHuntLine(i);setPhase("hunt-type");} : null}
              showInjected={true} phase="review"/>
            {(phase==="hunt-type"||phase==="hunt-submit") && (
              <div>
                <div className="sl" style={{marginBottom:8}}>identify the bug type</div>
                <div className="bgrid">
                  {BUG_TYPES.filter(b => b.tier===sn.difficulty).map(b=>(
                    <div key={b.id} className="bchip"
                      style={huntType===b.id?{borderColor:b.color,background:b.color+"18",color:b.color}:{}}
                      onClick={()=>pickHuntType(b.id)}>
                      {b.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {phase==="hunt-submit" && (
              <button className="btn btn-pr btn-fw" onClick={()=>setPhase("reveal")}>
                Submit analysis →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── reveal ── */}
      {phase === "reveal" && (
        <div className="reveal fade">
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div className={cx("rv-title", pts===100?"win":pts>=60?"pt":"lose")}>
              {pts===100?"Perfect catch!":pts>=60?"Good eye!":"Missed it."}
            </div>
            <span className="tag" style={{borderColor:"var(--green)",color:"var(--green)",background:"var(--green-bg)"}}>Tutorial · 1×</span>
          </div>
          <div className="sgrid3">
            <div className="sc">
              <div className="sc-lbl">line detection</div>
              <div className="sc-val" style={{color:lc?"var(--green)":"var(--red)"}}>{lc?"+60":"+0"}</div>
              <div className="sc-sub">{lc?"correct — line "+(sn.bugLine+1):"missed — was line "+(sn.bugLine+1)}</div>
            </div>
            <div className="sc">
              <div className="sc-lbl">bug type</div>
              <div className="sc-val" style={{color:tc?"var(--green)":"var(--red)"}}>{tc?"+40":"+0"}</div>
              <div className="sc-sub">{tc?"correct":"was: "+btMeta?.label}</div>
            </div>
            <div className="sc">
              <div className="sc-lbl">your score</div>
              <div className="sc-val" style={{color:"var(--amber)"}}>{pts}<span style={{fontSize:13,color:"var(--dim)"}}> / 100</span></div>
              <div className="sc-sub">{pts===100?"flawless!":pts>=60?"solid read":"review the diff below"}</div>
            </div>
          </div>
          <div>
            <div className="sl" style={{marginBottom:9}}>diff</div>
            <div className="diff-b">
              <div className="diff-h">{sn.language} · {sn.label} · line {sn.bugLine+1}</div>
              <div className="dln rm"><span className="dsign">−</span>{sn.injectedLine}</div>
              <div className="dln add"><span className="dsign">+</span>{sn.patch}</div>
            </div>
          </div>
          <div>
            <div className="sl" style={{marginBottom:9}}>explanation</div>
            <div className="expl">{sn.explanation}</div>
          </div>
          <button className="btn btn-pr" onClick={()=>setPhase("done")}>
            Complete tutorial →
          </button>
        </div>
      )}

      {/* ── done ── */}
      {phase === "done" && (
        <div className="cscreen fade">
          <div style={{textAlign:"center",maxWidth:480}}>
            <div style={{fontSize:46,marginBottom:14}}>🎉</div>
            <div style={{fontSize:22,fontWeight:800,color:"var(--bright)",marginBottom:10}}>You're ready to play!</div>
            <div className="chint" style={{fontSize:13,lineHeight:1.95,marginBottom:26,maxWidth:400,textAlign:"left"}}>
              <strong style={{color:"var(--text)"}}>Scoring:</strong> 60 pts for the correct line + 40 pts for the correct type, multiplied by tier (up to 3×).<br/>
              <strong style={{color:"var(--text)"}}>Injector tip:</strong> you earn the points the Hunter <em>misses</em> — subtle bugs score more.<br/>
              <strong style={{color:"var(--text)"}}>Hunter tip:</strong> read every operator, loop bound, and condition — one character is all it takes.
            </div>
            <button className="btn btn-pr" style={{minWidth:200}} onClick={onClose}>
              Play now →
            </button>
          </div>
        </div>
      )}
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
  const [encyOpen,  setEncyOpen]  = useState(false);
  const [tutOpen,   setTutOpen]   = useState(false);

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
  const openEncy  = () => { setEncyOpen(true); setTutOpen(false); };
  const closeEncy = () => setEncyOpen(false);
  const openTut   = () => { setTutOpen(true); setEncyOpen(false); };
  const closeTut  = () => setTutOpen(false);

  if (tutOpen) {
    return (
      <div className="app">
        {connState==="connected" &&
          <TopBar gs={gs} myRole={myRole} roomCode={roomCode} onLeave={disconnect} onEncy={openEncy} ticks={ticks}/>}
        <TutorialScreen onClose={closeTut} />
      </div>
    );
  }

  if (encyOpen) {
    return (
      <div className="app">
        {connState==="connected" &&
          <TopBar gs={gs} myRole={myRole} roomCode={roomCode} onLeave={disconnect} onEncy={closeEncy} ticks={ticks}/>}
        <EncyclopediaScreen onClose={closeEncy} />
      </div>
    );
  }

  return (
    <div className="app">
      {connState==="connected" &&
        <TopBar gs={gs} myRole={myRole} roomCode={roomCode} onLeave={disconnect} onEncy={openEncy} ticks={ticks}/>}

      {connState==="home"        && <HomeScreen onCreate={createRoom} onJoin={()=>{setConnError("");setConnState("joining");}} onEncy={openEncy} onTutorial={openTut} error={connError}/>}
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
