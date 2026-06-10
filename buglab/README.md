# BugLab 🐛

A real-time two-player bug injection game. One player injects a bug into a code snippet, the other hunts it down and identifies it. Score points for finding the right line and naming the correct bug type — scaled by difficulty tier.

---

## How to play

**Player 1 — Injector 🐛**
1. Create a room and share the 6-letter code with your opponent
2. Choose a difficulty tier and code snippet
3. Click the line to inject the bug on, then declare the bug type
4. Lock it in and wait for the hunter's verdict

**Player 2 — Hunter 🔍**
1. Join the room using the code from Player 1
2. Read the code carefully once it arrives
3. Click the line you think contains the bug
4. Select the bug type and submit your analysis

**Scoring:** 60 pts for the correct line + 40 pts for the correct bug type, multiplied by the tier (Easy 1×, Medium 1.5×, Hard 2×, Expert 3×). The injector earns whatever the hunter misses.

---

## Running locally

### Prerequisites

- Node.js 18+
- npm 9+

### Quickstart (Vite + React)

**1. Scaffold a new project**

```bash
npm create vite@latest buglab -- --template react
cd buglab
npm install
```

**2. Replace the default component**

Copy the contents of `BugLab.jsx` into `src/App.jsx`, replacing everything that's there.

**3. Add the storage stub**

The multiplayer layer uses `window.storage`, which is native to the Claude artifact sandbox. Add this shim near the top of `src/App.jsx` (before the component definitions) to replace it with `localStorage` for same-browser multiplayer:

```js
// Local stub for window.storage (replaces Claude artifact storage)
if (!window.storage) {
  window.storage = {
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
```

**4. Start the dev server**

```bash
npm run dev
```

Open `http://localhost:5173`. Open a second tab at the same URL to play both roles — both tabs share `localStorage`, so the game works as same-browser multiplayer out of the box.

---

## Cross-device multiplayer (optional)

To play across different devices or browsers, replace the `window.storage` stub with a real database. The easiest drop-in is **Firebase Realtime Database**.

**1. Install Firebase**

```bash
npm install firebase
```

**2. Create a Firebase project**

Go to [console.firebase.google.com](https://console.firebase.google.com), create a project, and enable the Realtime Database. Set the rules to allow public read/write for development:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

**3. Replace the storage stub**

```js
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get } from "firebase/database";

const app = initializeApp({
  databaseURL: "https://YOUR-PROJECT-ID.firebaseio.com",
  // add your other Firebase config values here
});
const db = getDatabase(app);

window.storage = {
  set: async (key, val) => {
    await set(ref(db, key), val);
    return { key, value: val };
  },
  get: async (key) => {
    const snap = await get(ref(db, key));
    if (!snap.exists()) throw new Error("Key not found: " + key);
    return { key, value: snap.val() };
  },
  delete: async (key) => {
    await set(ref(db, key), null);
    return { key, deleted: true };
  },
};
```

Any two players on the internet can now create and join rooms in real time.

---

## Project structure

```
buglab/
├── src/
│   └── App.jsx        ← entire game (single file)
├── index.html
├── package.json
└── vite.config.js
```

Everything — game logic, components, CSS, snippets, and scoring — lives in `App.jsx`. The `window.storage` interface is the only seam between the Claude sandbox and a real deployment.

---

## Difficulty tiers

| Tier | Multiplier | Bug categories |
|------|-----------|---------------|
| Easy | 1× | Off-by-one, null dereference, inverted condition, wrong operator, uninitialised var, missing break |
| Medium | 1.5× | Predicate weakening, bad memoization, dangling iterator, state corruption |
| Hard | 2× | TOCTOU race, lock-order inversion, double free, resource leak |
| Expert | 3× | Integer truncation, signed/unsigned confusion, timing side channel, invariant violation |

---

## Tech stack

- **React 18** — UI and state management
- **Vite** — dev server and bundler
- **window.storage / Firebase** — multiplayer sync (polling every 2 seconds)
- **Google Fonts** — Syne (UI) + JetBrains Mono (code)
- No other runtime dependencies
