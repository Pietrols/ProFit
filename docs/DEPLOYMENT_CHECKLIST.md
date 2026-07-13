# ProFit — Pre-Launch Deployment Checklist

Ordered: each block roughly depends on the ones before it. Items marked
**[BLOCKING]** will fail Play review or break the app if skipped.

## 1. Backend to production

- [ ] **[BLOCKING] Deploy behind HTTPS on a real domain.** Oracle Always
  Free ARM instance + a reverse proxy that terminates TLS (Caddy is the
  least-effort path: automatic Let's Encrypt). Target:
  `https://[PLACEHOLDER: api domain, e.g. api.yourdomain.com]`.
- [ ] Production `.env` on the server: strong `JWT_SECRET` (rotate the dev
  one — it's in local git history conversations, treat as burned), real
  `DATABASE_URL` (Dockerized Postgres on the instance or a managed DB),
  `PORT`, and the AI posture below. **`ANTHROPIC_API_KEY` lives only in
  this server env — never in the mobile app or repo.**
- [ ] **AI launch posture: `AI_ENABLED=false` at launch** (matches the
  privacy docs' "off by default"). Flip on later as a server-side decision
  once you've smoke-tested with a real key and reviewed Anthropic's current
  data-use terms.
- [ ] Run migrations + seed on the production DB
  (`npx prisma migrate deploy && npm run db:seed`).
- [ ] Hardening before public exposure: tighten CORS (currently
  `app.use(cors())` — wide open; restrict or drop it, native apps don't
  need CORS), add rate limiting on `/auth/*` (no brute-force protection
  today), set up DB backups (`pg_dump` cron at minimum), and a process
  manager (systemd/pm2) + log rotation.
- [ ] Smoke test from a phone on mobile data: `/health`, register, sync.

## 2. Account deletion (Play requirement)

- [ ] **[BLOCKING] Build account deletion.** Google Play requires apps with
  account creation to offer in-app account deletion AND a web URL for
  requesting it. Currently missing. Minimum: `DELETE /me` endpoint (schema
  already cascades to all user data) + a "Delete account" button in
  Profile + a simple hosted request page at [PLACEHOLDER: deletion URL].

## 3. Legal docs hosted

- [ ] Fill every `[PLACEHOLDER]` in `docs/PRIVACY_POLICY.md` and
  `docs/TERMS_OF_SERVICE.md`; get them reviewed.
- [ ] **[BLOCKING] Host the privacy policy at a public URL** (GitHub Pages
  is fine). The Play Console listing requires it, and it should be linked
  from inside the app (add to Profile screen).

## 4. Mobile app production config

- [ ] `mobile/.env` / EAS env: `EXPO_PUBLIC_API_URL=https://[PLACEHOLDER:
  api domain]` — off the LAN IP. (It's baked in at build time; set it as an
  EAS environment variable for production builds.)
- [ ] `app.json`: set `version` (user-facing) and `android.versionCode`
  (increment every upload); confirm package `com.mundala.profit`; check the
  generated adaptive icon matches the brand (currently the Expo template
  icons — replace `assets/` art).
- [ ] Create `eas.json` if absent (`eas build:configure`).
- [ ] Notifications: verify the `expo-notifications` config plugin /
  `POST_NOTIFICATIONS` permission appears in the build (Android 13+
  runtime prompt is handled in-code via `requestPermissionsAsync`).

## 5. Builds

```bash
npm i -g eas-cli && eas login          # once
cd mobile

# Sideload beta (installable APK to hand to testers directly)
eas build -p android --profile preview

# Store build (AAB for Play Console)
eas build -p android --profile production
```

- `preview` profile → APK; `production` → app bundle (AAB). Play accepts
  AAB only. EAS manages the signing keystore by default — let it.
- First production build: download the AAB for the console upload.

## 6. Play Console

- [ ] Pay the **$25 one-time developer registration** (personal account) at
  play.google.com/console; complete identity verification (can take days —
  start early).
- [ ] Create the app (Health & Fitness, free), fill the listing from
  `docs/STORE_LISTING.md`, upload the graphics (icon 512×512, feature
  graphic 1024×500, ≥2 phone screenshots).
- [ ] Data safety form from `docs/PLAY_DATA_SAFETY.md`; content rating
  questionnaire; Health apps declaration; privacy policy URL; account
  deletion URL.
- [ ] **[BLOCKING] Closed testing gate:** personal accounts created after
  Nov 13 2023 must run a closed test with **at least 12 testers opted in
  continuously for 14 days** before applying for production access
  (verified current as of Jul 2026 — re-check in the console, Google
  revised it from 20 in Dec 2024, and it tracks real tester engagement).
  Recruit 15+ so dropouts don't reset you.
- [ ] Internal testing track first (instant): upload the AAB, add yourself,
  verify install/login/sync against production API. Then promote to closed
  testing for the 14-day clock.

## 7. Outstanding physical-device checks (from Phase 9)

- [ ] Reminder notification actually fires on a chosen training day
  (requires a dev/production build — Expo Go limits expo-notifications).
- [ ] Export share sheet delivers JSON/CSV to Drive/email and files open.
- [ ] Airplane-mode end-to-end: full workout offline → reconnect → syncs
  once, no duplicates (logic is test-covered; feel it on-device).
- [ ] First live-model smoke test on a staging copy: `AI_ENABLED=true` +
  real key → adjusted session, meal suggestion, coach swap question.
- [ ] Force-quit → reopen → still logged in (Phase 1's manual check).
- [ ] Light theme pass — every screen was built theme-token-driven; eyeball
  it once on-device.

## 8. Launch order (TL;DR)

1. HTTPS backend live → 2. deletion flow → 3. policy hosted → 4. production
AAB → 5. console setup + internal test → 6. closed test (12×14d) → 7. apply
for production.
