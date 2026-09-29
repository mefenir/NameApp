# NameApp

*(working title)* — save a name in seconds right after you meet someone, then actually remember it.

- **Capture**: tap → name(s) → how was it → a hook → saved. Relation is asked once per event; place and time are saved automatically.
- **People**: cards grouped by event, filter by relation, event/place or ⭐ "want to see again", search names, hooks and notes.
- **Review**: the morning after, a 30-second flashcard review — see the hooks, recall the name, flip. Spaced repetition (1 → 3 → 7 → 14 → 30 → 60 days).
- **PWA**: installable on iPhone and Android, works offline, same app on desktop.

See [PLAN.md](PLAN.md) for the product plan and roadmap.

## Run it

It's plain HTML/CSS/JS — no build step.

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Without Firebase configured the app runs in **local mode** (data stays in this browser). That's enough to try the whole flow.

## Deploy on GitHub Pages

1. Repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save.
2. After a minute it's live at `https://mefenir.github.io/<repo-name>/` (the exact link is shown on the Pages settings page).
3. On your phone, open that link and add it to the home screen (iPhone: Safari → Share → *Add to Home Screen*).

Location and install only work over HTTPS (GitHub Pages is HTTPS) or on `localhost`.

## Connect Firebase (accounts + sync)

1. [Firebase console](https://console.firebase.google.com) → **Add project** (e.g. `nameapp`). Analytics not needed.
2. **Build → Firestore Database → Create database** → choose location **`europe-west3` (Frankfurt)** → start in *production mode*. The location can't be changed later.
3. **Firestore → Rules** → paste the contents of [`firestore.rules`](firestore.rules) → Publish.
4. **Build → Authentication → Get started → Sign-in method** → enable **Anonymous** and **Email/Password**.
5. **Authentication → Settings → Authorized domains** → add `mefenir.github.io`.
6. **Project settings → Your apps → Web (`</>`)** → register an app → copy the `firebaseConfig` object into [`js/firebase-config.js`](js/firebase-config.js) (replace `null`).
7. Commit and push. The app now signs everyone in anonymously on first open; they can create an account in Settings, and everything they saved carries over.

The web config is not a secret — the security rules are what protect the data.

## Structure

```
index.html             app shell
css/app.css            styles (light + dark)
js/app.js              screens: home, capture, people, person, review, settings
js/store.js            data layer (local mode or Firebase)
js/review.js           spaced-repetition logic
js/geo.js              GPS + OpenStreetMap place names
js/firebase-config.js  your Firebase config (null = local mode)
sw.js                  offline cache — bump VERSION when you change files
manifest.webmanifest   install info, icons, shortcuts
firestore.rules        security rules
```

## Data

```
users/{uid}/events/{id}  name, relation, startedAt, lastAt, endedAt?, location
users/{uid}/people/{id}  name, eventId, relation, vibe, seeAgain, hooks[], note, color,
                         location, createdAt, updatedAt, review { box, due, known }
```

Place names © OpenStreetMap contributors (Nominatim).
