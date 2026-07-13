# ProFit — Dev Runbook

Everything needed to run the full stack locally. Repo layout: `backend/` +
`mobile/` (no monorepo), Postgres in Docker.

## 0. One-time setup

```bash
# Database
cd ~/Documents/Repos/ProFit
docker compose up -d

# Backend
cd backend
cp .env.example .env        # edit values — see "Backend .env" below
npm install
npx prisma migrate dev      # apply all migrations
npm run db:seed             # seed the 63-exercise library

# Mobile
cd ../mobile
npm install
cp .env.example .env        # set EXPO_PUBLIC_API_URL — see below
```

## 1. Every-time startup (three terminals)

```bash
# T1 — database
cd ~/Documents/Repos/ProFit && docker compose up -d

# T2 — backend (http://localhost:4000)
cd ~/Documents/Repos/ProFit/backend && npm run dev

# T3 — mobile (Metro dev server)
cd ~/Documents/Repos/ProFit/mobile && npx expo start
```

Sanity check: `curl localhost:4000/health` → `{"status":"ok","db":"up"}`.

If port 4000 is busy from a stale dev server: `lsof -ti :4000 | xargs kill`.

## 2. Backend .env

```bash
# ⚠ This machine: use port 5434 — Postgres.app shadows Docker's 5433 on loopback.
DATABASE_URL="postgresql://profit:profit_dev_pass@localhost:5434/profit?sslmode=disable"
JWT_SECRET="<long random string>"
PORT=4000
AI_ENABLED=false            # flip to true for real AI…
ANTHROPIC_API_KEY=          # …and set a key (server-side ONLY, never in mobile)
AI_MODEL=claude-opus-4-8
```

## 3. Connecting a device

| Target | How |
|---|---|
| **Physical phone** | Install Expo Go, same Wi-Fi as the Mac, scan the QR from `npx expo start`. Set `EXPO_PUBLIC_API_URL=http://<mac-lan-ip>:4000` in `mobile/.env` (find the IP: `ipconfig getifaddr en0`). |
| **Android emulator** | `npx expo start` then press `a`. Leave `EXPO_PUBLIC_API_URL` unset — the app defaults to `http://10.0.2.2:4000`. |

Caveat: `expo-notifications` (reminders) is limited inside Expo Go on newer
Android — use a dev build (`npx expo run:android`) to test reminder firing.
Everything else works in Expo Go.

## 4. Tests & tools

```bash
# Backend (43 tests)
cd backend && npm test
npx tsc --noEmit            # typecheck
npm run db:studio           # Prisma Studio DB browser

# Mobile (23 tests)
cd mobile && npm test
npm run typecheck
npx expo export --platform android   # bundle smoke test
```

## 5. Useful DB access

```bash
PGPASSWORD=profit_dev_pass psql -h localhost -p 5434 -U profit -d profit
```
