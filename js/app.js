import * as store from "./store.js";
import { state } from "./store.js";
import { getPosition, reverseGeocode, mapLink, mapEmbedUrl } from "./geo.js";
import * as rv from "./review.js";

/* ============================================================
   Constants
   ============================================================ */

const APP_NAME = "NameApp"; // working title — change here
const EVENT_WINDOW_MS = 4 * 60 * 60 * 1000; // captures within 4h join the current event

const RELATIONS = [
  { id: "friends", label: "Friends", one: "Friend", emoji: "🧡" },
  { id: "work", label: "Work", one: "Work", emoji: "💼" },
  { id: "neighbours", label: "Neighbours", one: "Neighbour", emoji: "🏡" },
  { id: "other", label: "Other", one: "Other", emoji: "✨" },
];
const VIBES = [
  { id: "great", label: "Great chat", emoji: "😄" },
  { id: "nice", label: "Nice", emoji: "🙂" },
  { id: "brief", label: "Brief", emoji: "😐" },
];
const HOOK_CHIPS = [
  "glasses", "beard", "tall", "short", "curly hair", "long hair", "bald", "tattoo",
  "accent", "big smile", "the host", "a parent", "colleague", "friend of a friend",
];
const COLORS = [
  { id: "red", v: "#e5484d" }, { id: "orange", v: "#f08c3a" }, { id: "yellow", v: "#f2c230" },
  { id: "green", v: "#46a758" }, { id: "blue", v: "#3e7be0" }, { id: "purple", v: "#8e4ec6" },
  { id: "pink", v: "#e2659b" }, { id: "grey", v: "#8b8d98" },
];

const rel = (id) => RELATIONS.find((r) => r.id === id) || RELATIONS[3];
const vibe = (id) => VIBES.find((v) => v.id === id);
const colorOf = (id) => COLORS.find((c) => c.id === id)?.v;

/* ============================================================
   Tiny DOM helper
   ============================================================ */

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k === "value" || k === "disabled" || k === "checked") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const ICON = {
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
};
function icon(name) {
  const s = h("span", { style: "display:contents" });
  s.innerHTML = ICON[name];
  return s;
}
function iconBtn(name, label, onclick) {
  return h("button", { class: "icon-btn", "aria-label": label, onclick }, icon(name));
}

/* ============================================================
   Formatting helpers
   ============================================================ */

const fmtDay = (ms) => new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const fmtDate = (ms) => {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
};
const fmtTime = (ms) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
function fmtIn(ms) {
  const d = Math.round((ms - Date.now()) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "tomorrow";
  return `in ${d} days`;
}
function partOfDay(ms) {
  const hr = new Date(ms).getHours();
  return hr < 5 ? "night" : hr < 12 ? "morning" : hr < 17 ? "afternoon" : hr < 22 ? "evening" : "night";
}
function initials(name) {
  const parts = (name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
function placeLine(loc) {
  if (!loc) return "";
  return [loc.place, loc.city].filter((x, i, a) => x && a.indexOf(x) === i).join(", ");
}
function avatar(p, lg) {
  const tint = colorOf(p.color);
  const bg = tint ? `color-mix(in srgb, ${tint} 30%, var(--surface))` : `var(--rel-${p.relation || "other"})`;
  return h("div", { class: "avatar" + (lg ? " lg" : ""), style: `--av:${bg}` }, initials(p.name));
}
const haptic = (ms = 12) => navigator.vibrate?.(ms);

/* ============================================================
   Local preferences (per-device conveniences only)
   ============================================================ */

const prefs = {
  get(k, d) {
    try {
      const v = localStorage.getItem("nameapp:pref:" + k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("nameapp:pref:" + k, JSON.stringify(v));
    } catch {}
  },
};

/* ============================================================
   Toast
   ============================================================ */

let toastTimer;
function toast(text, action) {
  const el = document.getElementById("toast");
  const btn = document.getElementById("toast-action");
  document.getElementById("toast-text").textContent = text;
  btn.hidden = !action;
  btn.onclick = null;
  if (action) {
    btn.textContent = action.label;
    btn.onclick = () => {
      el.classList.remove("show");
      action.run();
    };
  }
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), action ? 6000 : 2600);
}

/* ============================================================
   Events
   ============================================================ */

function activeEvent(now = Date.now()) {
  return state.events
    .filter((e) => !e.endedAt && now - (e.lastAt || e.startedAt) < EVENT_WINDOW_MS)
    .sort((a, b) => b.lastAt - a.lastAt)[0];
}
function peopleIn(eventId) {
  return state.people.filter((p) => p.eventId === eventId);
}

/* ============================================================
   Router
   ============================================================ */

const view = document.getElementById("view");
let currentKey = null;

function parseRoute() {
  const [name, arg] = location.hash.replace(/^#\/?/, "").split("/");
  return { name: name || "home", arg: arg ? decodeURIComponent(arg) : null };
}

function go(path) {
  const target = "#/" + path;
  if (location.hash !== target) location.hash = target;
  navigate();
}

function navigate() {
  const r = parseRoute();
  const key = r.name + "/" + (r.arg || "");
  if (key === currentKey) return;
  currentKey = key;
  if (r.name === "capture") capture = freshCapture();
  if (r.name === "review") session = null;
  render(true);
  window.scrollTo(0, 0);
}

function render(force) {
  const r = parseRoute();
  // Don't clobber a field the user is typing in, and never re-render the capture flow from outside.
  if (!force && view.dataset.ready === "1") {
    if (r.name === "capture") return updateTabs(r);
    const a = document.activeElement;
    if (a && view.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return updateTabs(r);
  }
  document.body.classList.toggle("fullscreen", r.name === "capture");
  const fn = { home: viewHome, capture: viewCapture, people: viewPeople, person: viewPerson, review: viewReview, settings: viewSettings }[r.name] || viewHome;
  if (!state.ready && r.name !== "settings") {
    view.replaceChildren(h("div", { class: "empty" }, h("span", { class: "emoji" }, "⏳"), "Loading…"));
  } else {
    view.replaceChildren(fn(r.arg));
  }
  view.dataset.ready = state.ready ? "1" : "0";
  updateTabs(r);
}

function updateTabs(r) {
  const tab = r.name === "person" ? "people" : r.name;
  document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
  const n = rv.dueQueue(state.people).length;
  const b = document.getElementById("review-badge");
  b.hidden = !n;
  b.textContent = n > 99 ? "99+" : n;
}

/* ============================================================
   Home
   ============================================================ */

let installPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  render();
});
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function installBanner() {
  if (isStandalone() || prefs.get("installDismissed", false)) return null;
  const dismiss = () => {
    prefs.set("installDismissed", true);
    render(true);
  };
  if (installPrompt) {
    return h("div", { class: "banner" },
      h("span", { class: "grow" }, `Install ${APP_NAME} for one-tap access.`),
      h("button", { class: "link-btn", onclick: async () => { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; render(true); } }, "Install"),
      h("button", { class: "link-btn", style: "color:var(--muted)", onclick: dismiss }, "Later"));
  }
  if (isIOS()) {
    return h("div", { class: "banner" },
      h("span", { class: "grow" }, "Add to your home screen: tap ", h("b", {}, "Share"), " then ", h("b", {}, "Add to Home Screen"), "."),
      h("button", { class: "link-btn", style: "color:var(--muted)", onclick: dismiss }, "OK"));
  }
  return null;
}

function viewHome() {
  const ev = activeEvent();
  const due = rv.dueQueue(state.people).length;
  const recent = [...state.people].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);

  return h("div", { class: "home" },
    h("div", { class: "topbar" },
      h("div", { class: "brand" }, h("span", { class: "dot" }), APP_NAME),
      iconBtn("gear", "Settings", () => go("settings"))),

    state.error && h("div", { class: "banner error" }, state.error),

    ev && h("div", { class: "event-now" },
      h("div", { style: "font-size:26px" }, rel(ev.relation).emoji),
      h("div", { class: "grow" },
        h("div", { class: "label" }, "You're at"),
        h("div", { class: "name" }, ev.name),
        h("div", { class: "meta" }, `${peopleIn(ev.id).length} met · since ${fmtTime(ev.startedAt)}`)),
      h("button", { class: "link-btn", onclick: () => { store.putEvent({ ...ev, endedAt: Date.now() }); toast("Event ended"); } }, "End")),

    h("div", { class: "big-wrap" },
      h("button", { class: "big-btn", id: "big-btn", onclick: () => { haptic(); go("capture"); } },
        h("span", { class: "plus" }, "+"),
        h("span", { class: "txt" }, "Met someone"))),
    h("p", { class: "hint" }, ev ? `Adds to ${ev.name}` : "Tap right after you meet someone"),

    due > 0 && h("button", { class: "review-nudge", onclick: () => go("review") },
      h("span", { class: "emoji" }, "🧠"),
      h("div", {}, h("b", {}, `${due} ${due === 1 ? "name" : "names"} to review`), h("span", {}, `About ${Math.max(1, Math.round(due * 8 / 60))} min`)),
      h("span", { class: "chev" }, "›")),

    recent.length > 0 && h("div", {},
      h("h2", {}, "Recently met"),
      h("div", { class: "recent" }, recent.map((p) => h("button", { class: "chip", onclick: () => go("person/" + p.id) }, p.seeAgain ? "⭐ " : "", p.name)))),

    installBanner(),
    state.mode === "local" && state.people.length === 0 &&
      h("p", { class: "small-print", style: "text-align:center" }, "Local mode: names are saved on this device only."));
}

/* ============================================================
   Capture flow
   ============================================================ */

let capture = null;

function freshCapture() {
  const ev = activeEvent();
  return {
    step: ev ? "names" : "relation",
    eventId: ev?.id || null,
    relation: ev?.relation || null,
    names: [],
    draft: "",
    i: 0,
    items: [], // per person: { name, vibe, seeAgain, hooks: [] }
    pos: getPosition(),
  };
}

function viewCapture() {
  const c = capture || (capture = freshCapture());
  const cancel = () => { capture = null; go(""); };
  const back = (step) => () => { c.step = step; rerenderCapture(); };
  const head = (backFn, progress) =>
    h("div", { class: "step-head" },
      backFn ? iconBtn("back", "Back", backFn) : iconBtn("close", "Cancel", cancel),
      h("span", { class: "progress" }, progress || ""),
      backFn ? iconBtn("close", "Cancel", cancel) : h("span", { style: "width:44px" }));

  /* --- Relation (once per event) --- */
  if (c.step === "relation") {
    return h("div", { class: "capture" },
      head(null),
      h("h1", {}, "What's the occasion?"),
      h("p", { class: "sub" }, "Asked once — everyone you add in the next few hours joins this event."),
      h("div", { class: "grid2" },
        RELATIONS.map((r) =>
          h("button", { class: "tile", onclick: () => { haptic(); c.relation = r.id; c.eventId = null; c.step = "names"; rerenderCapture(); } },
            h("span", { class: "emoji" }, r.emoji), r.label))));
  }

  /* --- Names --- */
  if (c.step === "names") {
    const ev = c.eventId && store.getEvent(c.eventId);
    const input = h("input", {
      class: "name-input", id: "name-input", type: "text", placeholder: "Their name",
      autocomplete: "off", autocorrect: "off", autocapitalize: "words", spellcheck: "false",
      enterkeyhint: "next", "aria-label": "Name", value: c.draft,
      oninput: (e) => { c.draft = e.target.value; nextBtn.disabled = !(c.draft.trim() || c.names.length); },
      onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); next(); } },
    });
    const addAnother = () => {
      const n = c.draft.trim();
      if (n) { c.names.push(n); c.draft = ""; haptic(); }
      rerenderCapture();
    };
    const next = () => {
      const n = c.draft.trim();
      if (n) { c.names.push(n); c.draft = ""; }
      if (!c.names.length) return input.focus();
      c.items = c.names.map((name) => c.items.find((it) => it.name === name) || { name, vibe: null, seeAgain: false, hooks: [] });
      c.i = 0;
      c.step = "vibe";
      rerenderCapture();
    };
    const nextBtn = h("button", { class: "btn primary", onclick: next, disabled: !(c.draft.trim() || c.names.length) }, "Next");

    const el = h("div", { class: "capture" },
      head(null),
      h("h1", {}, c.names.length ? "Anyone else?" : "Name?"),
      h("p", { class: "sub" },
        ev ? [`${rel(ev.relation).emoji} ${ev.name} · `, h("button", { class: "link-btn", onclick: () => { c.step = "relation"; c.eventId = null; rerenderCapture(); } }, "new event")]
           : [`${rel(c.relation).emoji} New ${rel(c.relation).label.toLowerCase()} event · `, h("button", { class: "link-btn", onclick: back("relation") }, "change")]),
      c.names.length > 0 && h("div", { class: "added" },
        c.names.map((n, idx) => h("button", { class: "chip on", "aria-label": `Remove ${n}`, onclick: () => { c.names.splice(idx, 1); rerenderCapture(); } }, n, h("span", { class: "x" }, "✕")))),
      input,
      h("div", { class: "actions" },
        h("button", { class: "btn secondary", onclick: addAnother }, "+ another"),
        nextBtn));
    queueMicrotask(() => input.focus());
    return el;
  }

  const item = c.items[c.i];
  const progress = c.items.length > 1 ? `${c.i + 1} of ${c.items.length}` : "";

  /* --- Vibe --- */
  if (c.step === "vibe") {
    const star = h("button", {
      class: "star-toggle" + (item.seeAgain ? " on" : ""), "aria-pressed": String(item.seeAgain),
      onclick: () => { item.seeAgain = !item.seeAgain; star.classList.toggle("on", item.seeAgain); star.setAttribute("aria-pressed", String(item.seeAgain)); haptic(8); },
    }, h("span", { class: "s" }, "⭐"), "Want to see again");
    const pick = (v) => () => { haptic(); item.vibe = v; c.step = "hook"; rerenderCapture(); };
    return h("div", { class: "capture" },
      head(c.i === 0 ? back("names") : () => { c.i--; c.step = "hook"; rerenderCapture(); }, progress),
      h("h1", {}, `How was it with ${item.name}?`),
      star,
      h("div", { class: "vibes" },
        VIBES.map((v) => h("button", { class: "vibe", onclick: pick(v.id) }, h("span", { class: "emoji" }, v.emoji), v.label))),
      h("div", { class: "actions bottom" }, h("button", { class: "btn secondary", onclick: pick(null) }, "Skip")));
  }

  /* --- Hook --- */
  if (c.step === "hook") {
    const isLast = c.i === c.items.length - 1;
    const custom = recentCustomHooks().filter((x) => !HOOK_CHIPS.includes(x));
    const all = [...new Set([...item.hooks.filter((x) => !HOOK_CHIPS.includes(x) && !custom.includes(x)), ...custom, ...HOOK_CHIPS])];
    const chips = h("div", { class: "chips hook-chips" },
      all.map((hk) => {
        const b = h("button", {
          class: "chip" + (item.hooks.includes(hk) ? " on" : ""),
          onclick: () => {
            const i = item.hooks.indexOf(hk);
            if (i >= 0) item.hooks.splice(i, 1);
            else item.hooks.push(hk);
            b.classList.toggle("on", i < 0);
            haptic(6);
          },
        }, hk);
        return b;
      }));
    const addText = () => {
      const t = text.value.trim();
      if (t && !item.hooks.includes(t)) item.hooks.unshift(t);
      text.value = "";
    };
    const text = h("input", {
      class: "text-input", type: "text", placeholder: "Something memorable…",
      autocomplete: "off", enterkeyhint: "done", "aria-label": "Something memorable",
      onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); addText(); rerenderCapture(); } },
    });
    const finish = () => {
      addText();
      if (isLast) saveCapture();
      else { c.i++; c.step = "vibe"; rerenderCapture(); }
    };
    return h("div", { class: "capture" },
      head(back("vibe"), progress),
      h("h1", {}, `What will help you remember ${item.name}?`),
      h("p", { class: "sub" }, "Tap anything that fits, or write one line. Optional."),
      text,
      chips,
      h("div", { class: "actions bottom" },
        h("button", { class: "btn primary", onclick: finish }, isLast ? "Save" : "Next person")));
  }
  return h("div");
}

function rerenderCapture() {
  if (parseRoute().name !== "capture") return;
  view.replaceChildren(viewCapture());
  window.scrollTo(0, 0);
}

function recentCustomHooks() {
  const count = new Map();
  for (const p of state.people) for (const hk of p.hooks || []) if (!HOOK_CHIPS.includes(hk) && hk.length <= 24) count.set(hk, (count.get(hk) || 0) + 1);
  return [...count.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
}

async function attachLocation(personIds, eventId, pos) {
  const attach = (extra) => {
    for (const id of personIds) {
      const p = store.getPerson(id);
      if (p) store.putPerson({ ...p, location: { ...(p.location || {}), ...extra } });
    }
    // The event keeps the first place it was given; an auto-generated name becomes the place name.
    const e = eventId && store.getEvent(eventId);
    if (e && (!e.location || !e.location.place)) {
      const loc = { ...(e.location || {}), ...extra };
      const upd = { ...e, location: loc };
      if (e.nameAuto && loc.place) { upd.name = loc.place; upd.nameAuto = false; }
      store.putEvent(upd);
    }
  };
  const base = { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy ?? null };
  attach(base);
  const geo = await reverseGeocode(pos.lat, pos.lng);
  if (geo) attach({ ...base, ...geo });
}

let locationWarned = false;
function locationProblem(error) {
  if (locationWarned) return;
  locationWarned = true;
  setTimeout(() => {
    if (error === "denied") {
      toast(isIOS() ? "Location is off — allow it in Settings › Privacy › Location Services" : "Location is blocked — allow it in your browser's site settings");
    } else if (error === "unavailable") {
      toast("Couldn't get your location this time");
    }
  }, 3000); // after the "Saved" toast
}

function saveCapture() {
  const c = capture;
  const now = Date.now();
  let ev = c.eventId && store.getEvent(c.eventId);
  let createdEvent = false;
  if (!ev) {
    ev = {
      id: store.newId(),
      name: `${rel(c.relation).label} ${partOfDay(now)}`,
      nameAuto: true,
      relation: c.relation || "other",
      startedAt: now,
      lastAt: now,
      location: null,
    };
    createdEvent = true;
  } else {
    ev = { ...ev, lastAt: now };
  }
  store.putEvent(ev);

  const ids = c.items.map((it, k) => {
    const person = {
      id: store.newId(),
      name: it.name,
      eventId: ev.id,
      relation: ev.relation,
      vibe: it.vibe,
      seeAgain: it.seeAgain,
      hooks: it.hooks,
      note: "",
      color: null,
      location: null,
      createdAt: now + k,
      review: rv.newReview(now),
    };
    store.putPerson(person);
    return person.id;
  });

  // Location arrives in the background; attach it when it does.
  const eventId = ev.id;
  c.pos.then((pos) => {
    if (pos.error) return locationProblem(pos.error);
    attachLocation(ids, eventId, pos);
  });

  haptic(25);
  const names = c.items.map((it) => it.name);
  capture = null;
  go("");
  toast(names.length === 1 ? `Saved ${names[0]} ✓` : `Saved ${names.length} people ✓`, {
    label: "Undo",
    run: () => {
      ids.forEach((id) => store.deletePerson(id));
      if (createdEvent && peopleIn(eventId).length === 0) store.deleteEvent(eventId);
      toast("Undone");
    },
  });
}

/* ============================================================
   People (gallery)
   ============================================================ */

const filter = { q: "", relation: "all", eventId: "all" };

function matches(p) {
  if (filter.relation === "star" && !p.seeAgain) return false;
  if (!["all", "star"].includes(filter.relation) && p.relation !== filter.relation) return false;
  if (filter.eventId !== "all" && p.eventId !== filter.eventId) return false;
  const q = filter.q.trim().toLowerCase();
  if (q) {
    const ev = store.getEvent(p.eventId);
    const hay = [p.name, ...(p.hooks || []), p.note, ev?.name, p.location?.place, p.location?.city].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function viewPeople() {
  const wrap = h("div");
  const results = h("div");

  const drawResults = () => {
    const list = state.people.filter(matches);
    if (!state.people.length) {
      return results.replaceChildren(h("div", { class: "empty" }, h("span", { class: "emoji" }, "👋"),
        "No one yet. After you meet someone, tap ", h("b", {}, "+ Met someone"), "."));
    }
    if (!list.length) return results.replaceChildren(h("div", { class: "empty" }, h("span", { class: "emoji" }, "🔍"), "Nobody matches."));

    const groups = new Map();
    for (const p of list) {
      const k = p.eventId || "none";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }
    const ordered = [...groups.entries()].sort((a, b) => {
      const ea = store.getEvent(a[0]); const eb = store.getEvent(b[0]);
      return (eb?.startedAt || 0) - (ea?.startedAt || 0);
    });
    results.replaceChildren(...ordered.map(([k, ps]) => {
      const ev = store.getEvent(k);
      ps.sort((a, b) => b.createdAt - a.createdAt);
      return h("section", {},
        h("div", { class: "group-head" },
          h("div", { style: "min-width:0" },
            h("div", { class: "t" }, ev ? `${rel(ev.relation).emoji} ${ev.name}` : "Other"),
            ev && h("div", { class: "m" }, [fmtDate(ev.startedAt), placeLine(ev.location)].filter(Boolean).join(" · "))),
          ev && h("button", { class: "rename", onclick: () => renameEvent(ev) }, "Rename")),
        h("div", { class: "cards" }, ps.map(card)));
    }));
  };

  const search = h("input", {
    class: "text-input", type: "search", placeholder: "Search names, hooks, notes…", value: filter.q, "aria-label": "Search",
    oninput: (e) => { filter.q = e.target.value; drawResults(); },
  });

  const relChips = h("div", { class: "chips scroll" },
    [{ id: "all", label: "All" }, ...RELATIONS.map((r) => ({ id: r.id, label: `${r.emoji} ${r.label}` })), { id: "star", label: "⭐ See again" }]
      .map((o) => h("button", { class: "chip" + (filter.relation === o.id ? " on" : ""), onclick: () => { filter.relation = o.id; render(true); } }, o.label)));

  const events = [...state.events].sort((a, b) => b.startedAt - a.startedAt);
  if (!events.some((e) => e.id === filter.eventId)) filter.eventId = "all";
  const evSelect = (events.length > 1 || filter.eventId !== "all") && h("select", {
    class: "text-input", "aria-label": "Event",
    onchange: (e) => { filter.eventId = e.target.value; drawResults(); },
  }, h("option", { value: "all" }, "All events & places"),
    events.map((ev) => h("option", { value: ev.id, selected: filter.eventId === ev.id }, `${ev.name} · ${fmtDate(ev.startedAt)}`)));

  wrap.append(
    h("div", { class: "topbar" }, h("h1", { style: "margin:0" }, "People"), h("span", { class: "muted" }, state.people.length ? `${state.people.length}` : "")),
    state.people.length > 0 && h("div", { class: "filters" },
      h("div", { class: "search" }, h("span", { class: "ico" }, icon("search")), search), relChips, evSelect),
    results);
  drawResults();
  return wrap;
}

function card(p) {
  const tint = colorOf(p.color);
  return h("button", { class: "card", style: tint ? `--card-tint:${tint}` : "", onclick: () => go("person/" + p.id) },
    h("div", { class: "top" }, avatar(p), h("span", { class: "badges" }, (vibe(p.vibe)?.emoji || ""), p.seeAgain ? " ⭐" : "")),
    h("div", { class: "nm" }, p.name),
    (p.hooks?.length || p.note) && h("div", { class: "hk" }, (p.hooks || []).join(" · ") || p.note));
}

function renameEvent(ev) {
  const name = prompt("Event name", ev.name);
  if (name && name.trim() && name.trim() !== ev.name) {
    store.putEvent({ ...ev, name: name.trim(), nameAuto: false });
  }
}

/* ============================================================
   Person detail
   ============================================================ */

function viewPerson(id) {
  const p = store.getPerson(id);
  if (!p) {
    return h("div", {}, h("div", { class: "topbar" }, iconBtn("back", "Back", () => go("people"))),
      h("div", { class: "empty" }, h("span", { class: "emoji" }, "🤷"), "This card doesn't exist anymore."));
  }
  const ev = store.getEvent(p.eventId);
  const save = (patch) => store.putPerson({ ...store.getPerson(id), ...patch });
  let t;
  const saveSoon = (patch) => { clearTimeout(t); t = setTimeout(() => save(patch), 350); };

  const seg = (options, current, onpick) => h("div", { class: "seg" },
    options.map((o) => h("button", { class: current === o.id ? "on" : "", "aria-pressed": String(current === o.id), onclick: () => { onpick(current === o.id && o.toggle ? null : o.id); render(true); } },
      h("span", { class: "e" }, o.emoji), o.label)));

  const hookInput = h("input", {
    class: "text-input", type: "text", placeholder: "Add a hook…", enterkeyhint: "done", "aria-label": "Add a hook",
    onkeydown: (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const v = e.target.value.trim();
      const cur = store.getPerson(id);
      if (v && !cur.hooks?.includes(v)) save({ hooks: [...(cur.hooks || []), v] });
      e.target.value = "";
      e.target.blur();
      render(true);
    },
  });

  const r = p.review || rv.newReview(p.createdAt);
  const memoryLine = r.known ? "You know this name ✓" : `Next review ${fmtIn(r.due)}`;

  return h("div", {},
    h("div", { class: "topbar" }, iconBtn("back", "Back", () => history.length > 1 ? history.back() : go("people"))),
    h("div", { class: "person-head" }, avatar(p, true),
      h("input", { value: p.name, "aria-label": "Name", autocapitalize: "words", autocomplete: "off",
        oninput: (e) => e.target.value.trim() && saveSoon({ name: e.target.value.trim() }),
        onblur: () => render(true) })),

    h("div", { class: "section met" },
      h("div", { class: "lbl" }, "Met"),
      ev ? h("button", { style: "text-align:left", onclick: () => { filter.eventId = ev.id; filter.relation = "all"; filter.q = ""; go("people"); } },
        h("b", {}, ev.name), " ", h("span", { class: "link-btn", style: "padding:0" }, "›")) : h("b", {}, "—"),
      h("span", {}, `${fmtDay(p.createdAt)}, ${fmtTime(p.createdAt)}`),
      p.location?.lat != null
        ? [
            placeLine(p.location) && h("span", {}, placeLine(p.location)),
            h("div", { class: "map" },
              h("iframe", { src: mapEmbedUrl(p.location), title: `Map of where you met ${p.name}`, loading: "lazy", referrerpolicy: "no-referrer-when-downgrade" })),
            h("div", { class: "row map-links" },
              h("a", { href: mapLink(p.location), target: "_blank", rel: "noopener" }, "Open in Maps"),
              h("span", { class: "small-print" }, "© OpenStreetMap")),
          ]
        : h("div", { class: "row", style: "margin-top:6px" },
            h("span", { class: "muted" }, "No location saved"),
            h("button", { class: "link-btn", onclick: async (e) => {
              e.target.disabled = true;
              e.target.textContent = "Locating…";
              const pos = await getPosition();
              if (pos.error) {
                locationWarned = false;
                locationProblem(pos.error);
                render(true);
                return;
              }
              await attachLocation([id], null, pos);
              toast("Location added");
              render(true);
            } }, "Add current location"))),

    h("div", { class: "section" },
      h("div", { class: "lbl" }, "How was it?"),
      seg(VIBES.map((v) => ({ ...v, toggle: true })), p.vibe, (v) => save({ vibe: v })),
      h("div", { class: "row", style: "margin-top:12px" },
        h("span", {}, "⭐ Want to see again"),
        h("button", { class: "toggle" + (p.seeAgain ? " on" : ""), role: "switch", "aria-checked": String(!!p.seeAgain), "aria-label": "Want to see again",
          onclick: () => { save({ seeAgain: !p.seeAgain }); render(true); } }))),

    h("div", { class: "section" },
      h("div", { class: "lbl" }, "Hooks"),
      (p.hooks || []).length > 0 && h("div", { class: "chips", style: "margin-bottom:10px" },
        p.hooks.map((hk) => h("button", { class: "chip on", "aria-label": `Remove ${hk}`, onclick: () => { save({ hooks: p.hooks.filter((x) => x !== hk) }); render(true); } }, hk, h("span", { class: "x" }, "✕")))),
      hookInput),

    h("div", { class: "section" },
      h("div", { class: "lbl" }, "Notes"),
      h("textarea", { class: "text-input", placeholder: "Anything else — family, job, what you talked about…", "aria-label": "Notes",
        oninput: (e) => saveSoon({ note: e.target.value }) }, p.note || "")),

    h("div", { class: "section" },
      h("div", { class: "lbl" }, "Relation"),
      seg(RELATIONS.map((x) => ({ ...x, label: x.one })), p.relation, (v) => v && save({ relation: v }))),

    h("div", { class: "section" },
      h("div", { class: "lbl" }, "Card colour"),
      h("div", { class: "swatches" },
        h("button", { class: "swatch none" + (!p.color ? " on" : ""), "aria-label": "No colour", onclick: () => { save({ color: null }); render(true); } }),
        COLORS.map((c) => h("button", { class: "swatch" + (p.color === c.id ? " on" : ""), style: `background:${c.v}`, "aria-label": c.id, onclick: () => { save({ color: c.id }); render(true); } })))),

    h("div", { class: "section row" },
      h("div", {}, h("div", { class: "lbl", style: "margin-bottom:2px" }, "Memory"), h("span", { class: "muted" }, memoryLine)),
      h("button", { class: "link-btn", onclick: () => { save({ review: { box: 0, due: Date.now(), known: false } }); toast("Added to today's review"); render(true); } }, "Review today")),

    h("div", { class: "actions", style: "margin-top:24px" },
      h("button", { class: "btn danger", onclick: () => {
        if (!confirm(`Delete ${p.name}? This can't be undone.`)) return;
        store.deletePerson(id);
        if (ev && peopleIn(ev.id).length === 0) store.deleteEvent(ev.id);
        go("people");
        toast("Deleted");
      } }, "Delete")));
}

/* ============================================================
   Review
   ============================================================ */

let session = null; // { ids, i, revealed, hint, knew, practice }

function startSession(practice) {
  const q = practice ? rv.practiceQueue(state.people) : rv.dueQueue(state.people);
  session = { ids: q.slice(0, 20).map((p) => p.id), i: 0, revealed: false, hint: false, knew: 0, practice };
  render(true);
}

function viewReview() {
  if (!session) {
    const due = rv.dueQueue(state.people);
    const practice = rv.practiceQueue(state.people);
    if (due.length) {
      return h("div", {},
        h("h1", {}, "Review"),
        h("div", { class: "done" },
          h("div", { class: "emoji" }, "🧠"),
          h("h1", {}, `${due.length} ${due.length === 1 ? "name" : "names"} to review`),
          h("p", { class: "muted" }, "You'll see what you noted about each person. Try to recall the name, then flip."),
          h("div", { class: "actions" }, h("button", { class: "btn primary", onclick: () => startSession(false) }, "Start"))));
    }
    return h("div", {},
      h("h1", {}, "Review"),
      h("div", { class: "done" },
        h("div", { class: "emoji" }, state.people.length ? "🎉" : "🌱"),
        h("h1", {}, state.people.length ? "All caught up" : "Nothing to review yet"),
        h("p", { class: "muted" }, state.people.length
          ? "New names come up the morning after you meet someone, then again after 3 days, a week, and so on."
          : "Names you save show up here the morning after, so they stick."),
        practice.length > 0 && h("div", { class: "actions" }, h("button", { class: "btn secondary", onclick: () => startSession(true) }, "Practise recent names"))));
  }

  const s = session;
  const ids = s.ids.filter((id) => store.getPerson(id));
  if (s.i >= ids.length) {
    const total = ids.length;
    return h("div", { class: "done" },
      h("div", { class: "emoji" }, total && s.knew === total ? "🏆" : "✅"),
      h("h1", {}, "Done"),
      h("p", { class: "muted" }, total ? `You knew ${s.knew} of ${total}.` : "Nothing left to review."),
      h("div", { class: "actions" }, h("button", { class: "btn primary", onclick: () => { session = null; go(""); } }, "Finish")));
  }

  const p = store.getPerson(ids[s.i]);
  const ev = store.getEvent(p.eventId);
  const v = vibe(p.vibe);
  const tint = colorOf(p.color);
  const answer = (knew) => {
    haptic(knew ? 15 : 30);
    if (knew) s.knew++;
    if (!s.practice) store.putPerson({ ...p, review: rv.answer(p.review, knew) });
    s.i++; s.revealed = false; s.hint = false;
    render(true);
  };

  return h("div", {},
    h("div", { class: "topbar" },
      iconBtn("close", "End review", () => { session = null; render(true); }),
      h("span", { class: "progress muted" }, `${s.i + 1} / ${ids.length}${s.practice ? " · practice" : ""}`),
      h("span", { style: "width:44px" })),
    h("div", { class: "rv-progress" }, h("i", { style: `width:${(s.i / ids.length) * 100}%` })),
    h("div", { class: "flash", style: tint ? `--card-tint:${tint}` : "" },
      h("div", { class: "ctx" },
        h("b", {}, ev ? `${rel(ev.relation).emoji} ${ev.name}` : rel(p.relation).one), h("br"),
        [fmtDay(p.createdAt), placeLine(p.location)].filter(Boolean).join(" · ")),
      (v || p.seeAgain) && h("div", { class: "vibe-line" }, v ? `${v.emoji} ${v.label}` : "", p.seeAgain ? "  ⭐ Want to see again" : ""),
      (p.hooks || []).length > 0 && h("div", { class: "chips hooks" }, p.hooks.map((hk) => h("span", { class: "chip" }, hk))),
      !(p.hooks || []).length && !v && h("p", { class: "muted" }, "No hooks saved — add one after this to make it easier next time."),
      s.revealed
        ? h("div", { class: "answer" }, p.name)
        : s.hint
          ? h("div", { class: "hint-letter" }, p.name[0].toUpperCase() + " _ _ _")
          : h("div", { class: "q" }, "Who is this?")),
    s.revealed
      ? h("div", { class: "actions" },
          h("button", { class: "btn secondary", onclick: () => answer(false) }, "Forgot"),
          h("button", { class: "btn primary", onclick: () => answer(true) }, "Knew it"))
      : h("div", { class: "actions" },
          !s.hint && h("button", { class: "btn secondary", onclick: () => { s.hint = true; render(true); } }, "Hint"),
          h("button", { class: "btn primary", onclick: () => { s.revealed = true; haptic(); render(true); } }, "Show name")));
}

/* ============================================================
   Settings
   ============================================================ */

let authMode = "create"; // or "signin"

function viewSettings() {
  const account = h("div", { class: "section stack" }, h("div", { class: "lbl" }, "Account"));

  if (state.mode === "local") {
    account.append(
      h("p", { style: "margin:0" }, h("b", {}, "Local mode.")),
      h("p", { class: "muted", style: "margin:0" }, "Names are saved in this browser only. Once Firebase is configured (see README), you can create an account and sync across devices."));
  } else if (!state.user) {
    account.append(h("p", { class: "muted", style: "margin:0" }, state.error || "Connecting…"));
  } else if (state.user.isAnonymous) {
    const err = h("div", { class: "form-err" });
    const email = h("input", { class: "text-input", type: "email", placeholder: "Email", autocomplete: "email", "aria-label": "Email" });
    const pw = h("input", { class: "text-input", type: "password", placeholder: "Password (min. 6 characters)", autocomplete: authMode === "create" ? "new-password" : "current-password", "aria-label": "Password" });
    const submit = async (e) => {
      e.preventDefault();
      err.textContent = "";
      const btn = e.submitter || form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        if (authMode === "create") { await store.createAccount(email.value.trim(), pw.value); toast("Account created ✓"); }
        else { await store.signIn(email.value.trim(), pw.value); toast("Signed in ✓"); }
        render(true);
      } catch (x) {
        err.textContent = x.message;
        btn.disabled = false;
      }
    };
    const form = h("form", { class: "stack", onsubmit: submit },
      email, pw, err,
      h("button", { class: "btn primary", type: "submit" }, authMode === "create" ? "Create account" : "Sign in"));
    account.append(
      h("p", { class: "muted", style: "margin:0" }, authMode === "create"
        ? "You're using NameApp without an account. Create one to keep your names safe and use them on other devices — everything you've saved comes with you."
        : "Sign in to your account. Names saved on this device without an account will be added to it."),
      form,
      h("div", { class: "row" },
        h("button", { class: "link-btn", onclick: () => { authMode = authMode === "create" ? "signin" : "create"; render(true); } },
          authMode === "create" ? "I already have an account" : "Create a new account instead"),
        authMode === "signin" && h("button", { class: "link-btn", onclick: async () => {
          const e = email.value.trim();
          if (!e) { err.textContent = "Enter your email first."; return; }
          try { await store.resetPassword(e); toast("Password reset email sent"); } catch (x) { err.textContent = x.message; }
        } }, "Forgot password?")));
  } else {
    account.append(
      h("p", { style: "margin:0" }, "Signed in as ", h("b", {}, state.user.email)),
      h("button", { class: "btn secondary", onclick: async () => {
        if (!confirm("Sign out? Your names stay in your account; this device will start empty until you sign in again.")) return;
        await store.signOut();
        toast("Signed out");
        go("");
      } }, "Sign out"));
  }

  const data = h("div", { class: "section stack" },
    h("div", { class: "lbl" }, "Your data"),
    h("p", { class: "muted", style: "margin:0" }, `${state.people.length} ${state.people.length === 1 ? "person" : "people"} · ${state.events.length} ${state.events.length === 1 ? "event" : "events"}`),
    h("button", { class: "btn secondary", onclick: exportJson }, "Export as file"),
    h("button", { class: "btn danger", onclick: async () => {
      if (!state.people.length && !state.events.length) return toast("Nothing to delete");
      if (!confirm("Delete ALL people and events? This can't be undone.")) return;
      await store.deleteAllData();
      toast("All data deleted");
      render(true);
    } }, "Delete all data"),
    state.mode === "firebase" && state.user && !state.user.isAnonymous && h("button", { class: "btn danger", onclick: async () => {
      if (!confirm("Delete your account and all data permanently?")) return;
      try { await store.deleteAccount(); toast("Account deleted"); go(""); } catch (x) { alert(x.message); }
    } }, "Delete account"));

  const install = !isStandalone() && (installPrompt || isIOS()) && h("div", { class: "section stack" },
    h("div", { class: "lbl" }, "Install"),
    installPrompt
      ? h("button", { class: "btn primary", onclick: async () => { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; render(true); } }, `Install ${APP_NAME}`)
      : h("p", { class: "muted", style: "margin:0" }, "In Safari, tap Share, then “Add to Home Screen”."));

  return h("div", {},
    h("div", { class: "topbar" }, iconBtn("back", "Back", () => go("")), h("span", {}), h("span", { style: "width:44px" })),
    h("h1", {}, "Settings"),
    account,
    install,
    data,
    h("div", { class: "section stack" },
      h("div", { class: "lbl" }, "About"),
      h("p", { class: "small-print", style: "margin:0" },
        `${APP_NAME} saves names privately for you — nothing is shared with anyone. Place names come from OpenStreetMap (© OpenStreetMap contributors).`)));
}

function exportJson() {
  const blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: `nameapp-export-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ============================================================
   Boot
   ============================================================ */

window.addEventListener("hashchange", navigate);
store.subscribe(() => render(false));
navigate();
store.init();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
