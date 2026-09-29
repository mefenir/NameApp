# NameApp — Product & Build Plan

*Working title. Last updated: 29 Sep 2026.*

## 1. The idea in one line

Save someone's name in under 10 seconds right after you meet them — then have the app make sure you actually **remember** it.

Most "remember names" apps are either **storage** (they keep the name but never help it stick) or **training** (they make you do mnemonic work nobody does at a party). NameApp combines the fastest capture with a tiny, automatic review loop.

## 2. Key product decisions

| Decision | Why |
|---|---|
| **Capture right after, not during** the conversation | Nobody pulls out a phone mid-chat. Real use is a minute later — at the bar, in the bathroom, on the way home — often for several people at once. |
| **Hooks instead of colours** | Clothes change and 8 colours aren't distinctive. Names stick when linked to something meaningful ("beard", "parent of Mia", "dog called Bruno"). Hooks are also what you remember when you need the name. |
| **Vibe, not stars** | How the interaction felt is a real memory aid and tells the app who matters. Stars would read as "rating people" (reputational + GDPR risk) and add a decision. Vibe is 😄 Great chat · 🙂 Nice · 😐 Brief, plus a ⭐ "Want to see again" flag. |
| **Events as the backbone** | The first capture starts an event (place + time). Later captures nearby within a few hours join it. Relation is asked once per event, so most captures skip that step. Events are a better filter than raw GPS. |
| **Multi-name capture** | "+ another" right after the name — for groups. |
| **Review loop in the MVP** | The differentiator. Recall-before-reveal flashcards with spaced repetition (1 → 3 → 7 → 14 → 30 days). "See again" people come first. |
| **Anonymous-first login** | Start capturing immediately; create an account later to sync across devices. No signup wall at a party. |
| **PWA (one codebase)** | Installable on iPhone and Android from the browser, works on desktop, works offline. App-store wrapper (Capacitor) later if needed. |

## 3. The capture flow

```
[ + Met someone ]
   │  (location requested in background on tap)
   ├─ New event?  → "What kind of occasion?"  Friends · Work · Neighbours · Other
   ▼
 Name(s)          → type, Enter · "+ another" for groups
 Vibe             → 😄 · 🙂 · 😐   (+ ⭐ see again)       one tap
 Hook             → chips (glasses, beard, tall…) or one line · skippable
 ✓ Saved          → Undo toast, back to home
```

Rules: no Next/Save buttons where a tap can advance; big thumb-zone targets; haptic on save; works offline.

## 4. Screens

1. **Home** — the big button, today's event, "N to review" badge.
2. **Capture** — the flow above.
3. **People (gallery)** — cards grouped by event; filters: relation, event/place, ⭐ see again; search by name, hook or note.
4. **Person** — edit everything; add notes, extra hooks, change relation, delete; mini map link.
5. **Review** — flashcards: hook + event + vibe shown → try to recall → reveal → "Knew it" / "Forgot".
6. **Settings** — account (create/sign in), export data, delete all data, about/privacy.

## 5. Data model (Firestore)

```
users/{uid}/events/{eventId}
  name, relation, startedAt, lastAt, location {lat, lng, place, city} | null

users/{uid}/people/{personId}
  name, eventId, relation, vibe ("great"|"nice"|"brief"|null), seeAgain: bool
  hooks: [string], note: string, color: string | null
  location {lat, lng, place, city} | null
  createdAt, updatedAt
  review { box: 0-5, due: timestamp, known: bool }
```

Security rules: each user reads/writes only `users/{their uid}/**`.

## 6. Tech stack

- Plain HTML/CSS/JS (ES modules) — no build step, trivial GitHub Pages deploy.
- Firebase Auth (anonymous → email/password link) + Firestore with offline persistence.
- **Local mode**: if Firebase isn't configured, data is stored on the device, so the app is testable immediately.
- Reverse geocoding: OpenStreetMap Nominatim (free, 1 request/second, attribution required).
- Service worker for offline + installability.

## 7. Privacy (EU/Germany)

The app stores names and impressions of third parties. Before public launch:
- Firestore region in the EU (`europe-west3`, Frankfurt) — **chosen at database creation, can't be changed later**.
- Privacy policy + Impressum.
- Export and delete-everything built in (done in Phase 1).
- Nothing shared between users, ever. Neutral wording in the UI (no "ratings").
- Optional app lock (Phase 2).
- Get a quick legal check before launch.

## 8. Phases

**Phase 1 — MVP (this build)**
Capture flow with events, multi-name, vibe, hooks · gallery with filters and search · person detail · review mode with spaced repetition · anonymous-first auth + account upgrade · offline PWA · export / delete.

**Phase 2 — Polish & loop**
Morning-after push notification ("You met 4 people at Anna's BBQ — 30-sec review?") via Firebase Cloud Messaging · app lock · link people to each other ("partner of…") · map view · onboarding.

**Phase 3 — Growth**
Pick the beachhead audience (parents at school/clubs **or** new-in-town/networkers) · landing page · Pro one-time purchase (unlimited events, advanced review, export formats) · app-store wrapper.

## 9. Market notes

Crowded but fragmented: NameKeeper (fast capture, GPS address, multi-add), Name Reminder (groups), Namerick / Rememberlee (memory techniques, spaced repetition), plus personal CRMs (Dex, Clay, Monica) aimed at staying in touch. Mostly small, mostly iOS-only. Nobody owns "fast capture **and** it actually sticks". Monetisation in this niche is hard — prefer free + one-time Pro over a subscription.
