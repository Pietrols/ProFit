# Stable workout structure contract

Step 5.8.5, following D42. Commit this contract and schema fixtures before store migrations or
structural commands. This is a design contract, not a claim that adaptation is implemented.

## Identity and original routine

Keep workout_sessions.snapshot as the original routine. Never splice it to add, remove or
reorder today's work. Existing set ids, performance times, dirty flags and tombstones survive
every migration. Legacy records are adapted on read, including completed history.

Add one synced session_items collection. Each item is one exercise occurrence, so two bench
press entries in the same workout have different item ids. Replacing an exercise creates a new
item linked to the removed item; it does not change the exercise attached to existing results.

| Field | Wire contract |
|---|---|
| id, updatedAt, deletedAt | Existing sync fields and D21 merge policy |
| sessionId | UUID, owned soft parent reference |
| origin | planned, added or replacement |
| originalPosition | Integer 0 to 99 for planned items, null otherwise |
| replacesItemId | Another item UUID for replacement, null otherwise; cannot equal id |
| position | Integer 0 to 10000, display order only |
| state | active, skipped or removed |
| reason | Null or text up to 500 characters |
| exercise | Existing strict SnapshotExercise shape, including remaining-work set count/targets/fields |

Planned item id is uuidv5('item:' + originalPosition, sessionId). Planned items must refer to
the same exercise as that original snapshot occurrence. Added and replacement ids come from
randomId(), never the current list length. Exercise identity is immutable within an item;
replacement is the explicit way to change it. Item tombstones never tombstone performed sets.
Skip/removal retain the item as context for its actual results. Restoring it retains its id.

## Stable slots without a new slot collection

A slot is the pair (itemId, setIndex), with setIndex an immutable integer 0 to 99. Item display
order never changes this index. There is no set-reorder operation in this correction phase.
Therefore a separate synced slot table would duplicate item targets and add merge races without
adding a required operation. Keep slots as deterministic identities and derived read records.

For a planned item, slot id remains setLogId(sessionId, originalPosition, setIndex). This also
applies to additional sets on that planned item. For an added or replacement item, slot id is
uuidv5('set:' + setIndex, itemId). Increasing a set count exposes later indexes; it never shifts
existing ones. Decreasing it removes only unperformed tail work. A late performed result beyond
the current count remains visible and is reported as work outside the current target.

Do not reuse a removed item's id for a different exercise. Two offline phones adding an exercise
use independent random item ids and cannot allocate each other's slot identities. A later set
count increase may expose the same previously unperformed slot again, with the same identity.

## Additive result variants

Keep the set_logs collection and extend it with nullable item_id, side and targets_at_performance
columns. Make exercise_position nullable for added/replacement results. Existing non-null values
and ids remain untouched. set_index keeps its original meaning as a slot within one exercise.

| Variant | Requirements |
|---|---|
| Legacy | itemId, side and targetsAtPerformance absent or null; exercisePosition 0 to 99; existing strict chosen fields/values and id rule |
| Stable | itemId UUID; side bilateral; targetsAtPerformance present; exercisePosition matches the item's originalPosition, including null for added/replacement; id equals that item's deterministic slot id |

For both variants, sessionId, setIndex, loggedAt, logFields, values and sync fields keep their
existing validation limits. Mixed partial metadata is invalid. Stable results belong to the
same owned session as their item. The performed exercise comes from that stable item, never
from a display position. A result's chosen fields remain the fields at performance, even if
future work on the item changes. Do not validate old chosen fields against a later edited item.

targetsAtPerformance is a strict object with sets (1 to 100), targetReps, targetTimeSeconds,
targetDistanceMetres and restSeconds, using the existing target bounds/nullability. It records
the effective, difficulty/easier-adjusted targets when the set is performed, not the last-used
weight prefill. setIndex must be below this captured sets count. It is immutable during a
correction. The original routine and current adjusted item remain separate comparison inputs.

No target-at-performance snapshot is invented for legacy results. Read adaptation can identify
their original exercise and slot, but presents their effective historical target as unknown.
New metadata is captured when actually logging a new result. Editing an existing legacy result
preserves its variant and original performance time. Full revision fingerprints must include
all added fields so conflict checks cannot overlook a changed item or target snapshot.

The initial stable variant accepts bilateral only. Per-side logging and its explicit load/record
conventions belong to 5.8.10. Adding that wire variant requires a negotiated feature and an
appropriate minimum-protocol gate before old clients can consume it. Never reinterpret legacy
entered loads as per-side or infer a second dumbbell/bodyweight contribution.

## Effective reads, history and writes

~~~text
effectiveSession(original, ownedItems, ownedResults):
  generate deterministic planned item/slot views from the original snapshot
  overlay latest valid item records by stable id, including skip/removal/tombstones
  include owned added/replacement items and join results by stable identity
  resolve latest result/tombstone before deciding whether it contributes
  retain actual performed rows even when current work is skipped/removed/reduced
  hide invalid/foreign/orphaned rows until their legitimate parents exist
  sort display order by position then stable id
  return original targets, adjusted targets, captured performance targets and actuals separately

captureTargets(item, difficulty, easierToday):
  scale target numbers with the existing tested sessionTargets rule
  copy the current set count and rest seconds; preserve nulls
  return an independent immutable performance snapshot

slotId(item, setIndex):
  validate bounds and original identity
  use the unchanged legacy namespace for planned slots, the item namespace otherwise
~~~

Keep existing legacy pure entry points as equivalence oracles. Structural readers/commands must
not route null exercisePosition through an array index or fabricate positional set ids. Adapt
the detail read and summary inputs before exposing structural writes. New records use the same
local-first transactions, user scoping, soft references and tombstone patterns as exercises/plans.

Extend the history catalog, dirty triggers and derived projection before enabling item writes.
Item changes invalidate affected sessions. Catalog entries cover original and added/replacement
exercise ids, retaining old tags while invalidations are pending. Historical lookups continue
using indexed, exact relevant-exercise queries; no return to loading every past workout.
Deleting a session hides all children, including children that arrive later. An item arriving
after its result makes that valid result readable without rewriting or duplicating it.

## Compatibility gate and required fixtures

Follow D42: preserve protocol 1 during preparation. Once both readers and stores are complete,
raise the server minimum to 2 before returning new collections, advertise workout_structure_v1,
and require that feature on the new client before any sync work. Legacy wire variants remain
accepted over protocol 2, including unsent edits from an app that has just upgraded. Unsupported
clients receive a whole-request HTTP 426; their dirty rows/cursors remain intact. Deploy server
first, then app, without clearing storage or resetting cursors.

Fixture tests must cover populated legacy migration with active/completed workouts, unsent edits,
tombstoned sets, duplicate exercise ids, both result variants, mixed metadata rejection, invalid
ownership/identity/parents, child-before-item arrival, late sets on removed/reduced items, two
offline added items, concurrent reorder and delete/undo. Verify legacy volume/PR outputs stay
equivalent and new exercises enter/leave the history projection correctly. Do not tick 5.8.5 or
enable adaptation controls until the migration, compatibility and read-equivalence gates pass.
