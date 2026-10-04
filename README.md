# ProFit

A training and nutrition log for your gym community. Plan and log workouts and meals, keep
streaks, share programs, and get an AI coach that holds you to your own goals.

Status: rebuild in progress on the `rebuild` branch. The first build is kept on `legacy-v1`.

- Product scope: [docs/SPEC.md](docs/SPEC.md)
- Build plan: [docs/ROADMAP.md](docs/ROADMAP.md)
- Design system: [docs/DESIGN.md](docs/DESIGN.md)
- Decisions: [docs/DECISIONS.md](docs/DECISIONS.md)

## Run it

```bash
docker compose up -d db                       # Postgres
cd backend && npm install && npm run dev      # API on http://localhost:4000
cd mobile && npm install && npx expo start    # app (development build required)
```
