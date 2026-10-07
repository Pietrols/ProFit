# Phase 2: Local store and sync engine

**Done when:** log a body weight offline, reconnect, and it reaches the server once with no
duplicates; a second phone signed in to the same account merges both phones' entries.

Every later feature (exercises, plans, workouts, meals) stores its data the same way, so this
phase builds the engine once and proves it on the smallest real feature: the body-weight log.

## The model

```
Phone (SQLite)                          ProFit API (Postgres)
--------------                          ---------------------
weight_entries                          weight_entries
  id          uuid, made on the phone     id          same uuid
  ...fields                               user_id
  updated_at  when it was last edited     ...fields
  deleted_at  set instead of deleting     updated_at  (from the phone)
  dirty       1 = not on the server yet   deleted_at
                                          version     a number that grows with every write
sync_state
  cursor      the highest version this phone has pulled
```

- **Ids are made on the phone**, so sending the same record twice updates one row instead of
  creating two.
- **Deleting sets `deleted_at`** (a tombstone) instead of removing the row, so the delete itself can
  sync to other phones.
- **Each record merges on its own:** the copy with the later `updated_at` wins. Two phones editing
  different records never overwrite each other.
- **One weigh-in per day.** A body-weight entry's id is derived from the user and the date, so two
  phones that both log 7 October produce the same id and merge into one entry (the later edit wins)
  instead of showing two.

## API

```
POST /sync/push   { changes: { weight_entries: [record, ...] } }      needs sign-in
  for each record (max 500 per request):
    validate it (Zod); invalid -> listed in "rejected", never blocks the rest
    clamp updated_at to at most 5 minutes past server time (a phone with a wrong clock
      must not win every future merge)
    insert, or update only if the stored copy belongs to this user and is older
    every insert or update takes the next version from one Postgres sequence
  -> { applied: [ids], ignored: [ids], rejected: [{ collection, id, reason }] }

GET /sync/pull?since=<version>&limit=500                              needs sign-in
  rows of this user with version > since, oldest first
  -> { changes: { weight_entries: [...] }, cursor: <highest version sent>, hasMore }
```

Pushes for one user run one at a time (a per-user lock), so versions are always committed in
order and a pull can never skip a row that was written slightly earlier.

## Phone

```
write (log, edit, delete a weight):
  in one transaction: upsert the row with updated_at = now, dirty = 1
  then ask the engine to sync (it does nothing when offline)

sync (one run at a time; after writes, at launch, at sign-in, on returning to the app):
  push:
    rows = dirty rows of this user (500 at a time)
    POST /sync/push
    for each row sent: dirty = 0 only if updated_at is unchanged since it was read
      (an edit made during the request stays dirty and goes next time)
    rejected rows: dirty = 0, and the reason is shown
  pull:
    loop GET /sync/pull?since=cursor
      for each record:
        local is dirty and newer  -> keep local (it will be pushed)
        otherwise                 -> write the server's copy, dirty = 0
      save the new cursor in the same transaction
    until hasMore is false

status shown to the user:
  pending count, "Offline: saved on this phone" when the last attempt had no connection,
  and the time of the last successful sync
```

The database layer runs every query through one queue, because expo-sqlite's transactions are not
exclusive and an unrelated query could otherwise land in the middle of one. Tests run the same
SQL on Node's built-in SQLite, so the engine is tested against a real database.

## Screens

- **Progress** gets a Body weight card: log today's weight, the latest entries, edit and delete.
  Charts come in Phase 8.
- Weight is shown in the user's units (kg or lb) and always stored in kg.
- An offline banner on Home and Progress when there are changes waiting and no connection.
- The theme choice is saved on the phone (promised for this phase in D8).

## Not in this phase

- The profile keeps its own path (`PATCH /me` with the queue from Phase 1); it is one record with
  field-level edits, which suits that better. Logged in DECISIONS.
- Charts, trends and goals for body weight: Phase 8.
