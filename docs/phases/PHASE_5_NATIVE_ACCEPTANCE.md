# Phase 5 current-set acceptance on Android

Status: pending. This is the device record for BUILD_PLAN step 5.8.7, not a passed test or the
final 5.7 notification check. Run it on the corrected native app before starting 5.8.8.
Browser evidence and its limits are in PHASE_5_CORRECTIONS.md. Never infer spoken output,
keyboard behavior, native font scaling or process recovery from a web export.

## Record the environment

| Field | Actual value |
|---|---|
| Tester and date | Pending |
| Code commit | Pending |
| Native build id, profile and install date | Pending |
| Phone model and Android version | Pending |
| Screen size and display-size setting | Pending |
| Default and enlarged font settings tested | Pending |
| Keyboard name, version and input language | Pending |
| TalkBack version | Pending |
| API version and schema/capability deployment | Pending |
| Disposable accounts used | Pending |

Use an installed development build containing the current native dependencies. Expo Go and
the generated Android JavaScript directory cannot run this acceptance. Existing development
and preview APK profiles are in mobile/eas.json. Build/install instructions depend on the
developer's configured Android tools or authenticated EAS account; no APK was produced here.

For an existing compatible development build, point mobile/.env at the test API reachable
from the phone, then run `npx expo start --clear` from mobile/. Sign-in setup is described in
docs/GOOGLE_SIGN_IN.md. Developer sign-in requires both existing opt-in development settings
and a non-production API. Use disposable data and a server with the workout-structure schema
and protocol 2 capability. Do not use the loopback-only browser fixture as a phone backend.

## Prepare a small routine

Create a standard-difficulty plan with a training day containing:

1. Bench press: three sets, eight reps, 60 seconds rest, reps and weight fields.
2. A row with a long name: three sets, ten reps, 60 seconds rest, reps, weight, effort and notes.
3. Another occurrence of Bench press: one set, twelve reps, reps and weight.
4. A custom movement with all eight logging fields selected, one set. Use this for the
   scrolling/field-reachability check, without inventing volume for an unknown external load.

Start this day from Home. Record the initial logged-set count. Repeat scenarios on fresh
sessions when needed so earlier saved work does not hide the slot being tested.

## Execute and record

Record Pass, Fail or Blocked for each row, with the actual observation and screenshot/video
reference. A blank result or an unobserved state stays pending. A failure needs its precise
steps, entered text, expected behavior and actual behavior before a code fix is verified.

| Id | Action | Required observation | Result/evidence |
|---|---|---|---|
| N1 | Open the workout in dark and light themes at default font size | Current exercise, set, relevant timer and Log set precede configuration. Reps/weight and save are reachable without scrolling through settings | Pending |
| N2 | Focus Weight, type 60, tap plus, minus, choose 1.25 kg and tap plus without dismissing the keyboard first | First taps act immediately: 62.5, 60, then 61.25. Log set remains reachable above or by scrolling with the keyboard open | Pending |
| N3 | From 60 kg with a 1.25 kg increment, tap plus four times rapidly, then minus four times; repeat reps plus/minus | Weight reaches 65 and returns to 60; reps change once per tap. No dropped or duplicated adjustment and no decimal drift | Pending |
| N4 | Exercise blank, zero, comma, malformed and out-of-range text as described below | Input is preserved when rejected; validation does not log or advance. Blank/zero behavior is explicit | Pending |
| N5 | Log once, including two rapid save taps; then correct a saved incomplete set with the keyboard open | Exactly one result is created for the slot. Correction saves the same result with its original performance time and does not restart rest | Pending |
| N6 | Enter different drafts for both Bench occurrences and the row; select, defer, reorder, skip and restore the row | Each occurrence retains its own raw input and units. The selected current card returns into view, and skipped work is not shown as completed | Pending |
| N7 | Change easier-today and profile units, then return to existing and fresh drafts | Existing raw text/units stay pinned with the unit explanation; new drafts use the new preference and appropriate increment | Pending |
| N8 | After Draft saved on this phone, enable airplane mode, stop and reopen the app | The same slot/draft recovers offline. Logging advances once; reconnect syncs one result, without losing another occurrence's draft | Pending |
| N9 | Enable large native text and the largest display setting available; repeat N1/N2 on the long-name and all-fields items | Labels wrap, all fields and save remain reachable, controls do not overlap or truncate values. Vertical scrolling is acceptable | Pending |
| N10 | Enable TalkBack and traverse the current set, overview, increments and error states | Input names include units; increment amounts, disabled state and expanded/collapsed actions are understandable. Duplicate exercise occurrences are distinguishable | Pending |
| N11 | With TalkBack, select the long-name item from the overview and return to the current card; trigger a validation error | Reading/focus order reaches the selected work and Log set without getting stranded in the overview. The error is spoken and remains available for review | Pending |

For N4, do not log each temporary input unless that is the scenario:

- Clear weight: minus leaves it blank, plus starts at the chosen increment.
- Enter zero: minus stays zero. Zero is not substituted with a previous load.
- Enter `60,75`: plus 2.5 yields 63.25, then minus returns 60.75.
- Paste `invalid` if the numeric keyboard cannot type letters. Log set reports a validation
  error, preserves the text and does not create a result. Fix the text and retry once.
- Enter 2000 kg and press plus: an error is shown without changing the text. For reps,
  fractional input cannot be stepped as though it were a whole number.
- Empty optional fields stay absent; they must not become invented zero values.

For N5, a disposable incomplete example is a weight-only saved result with reps left blank.
Find it in the logged-set list, open correction, enter reps and save. Check the saved values,
original performance time and result count. Do not call a fast save's busy state observed if
it was too brief to see; record that limitation. Do not force a storage error by deleting the
app's database. Fault-injected disk errors are separately covered by the browser harness.

For N8, state how the app was stopped. Force-stop, process eviction and a browser refresh are
different operations. A shutdown before the saved acknowledgement can only recover the last
durable write. Use a build with embedded JavaScript for offline cold launch, or separately
establish that the tested development client can load its cached bundle offline. Failure to
reach Metro is a blocked launch check, not evidence of lost drafts. This scenario does not
prove background notification delivery after force-stop; the original airplane-mode/background-
alert check belongs to the later 5.7 gate.

For N10/N11, also test the incomplete-result correction form. Pause or dismiss any active
countdown while reviewing spoken feedback, then separately verify that normal timer updates
do not repeatedly interrupt the user. The live-region property is supporting implementation,
not proof that TalkBack actually announced the error on this phone.

## Gate decision

- Native result: pending.
- Outstanding failures or blocked scenarios: pending.
- Corrective commit and repeat-test evidence, if needed: pending.
- BUILD_PLAN 5.8.7 remains unticked until the required checks pass and are recorded.
- History and subsequent correction steps remain queued. This record does not complete
  Phase 5, approve a release or start Phase 6.
