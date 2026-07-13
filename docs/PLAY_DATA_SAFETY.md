# Google Play Data Safety — Answer Sheet

> Reference for filling the Play Console **Data safety** form. Grounded in
> `docs/DATA_INVENTORY.md`. Verify against the live form's wording — Google
> revises categories periodically.
>
> **Key framing decision (read first):** Google's form distinguishes
> **collected** (leaves the device to the developer) from **shared**
> (transferred to a third party). Transfers to a **service provider
> processing on the developer's behalf** are exempt from "sharing" under
> Google's definitions. Anthropic processes AI requests on ProFit's behalf,
> via ProFit's server, under commercial API terms — so the recommended
> answers below mark AI-related data **Collected: yes / Shared: no**, with
> Anthropic disclosed in the privacy policy. If you prefer the conservative
> reading, flip the flagged rows to "Shared" — both are defensible; the
> privacy policy discloses the transfer either way. AI is also **off by
> default**, so at launch posture no Anthropic transfer occurs at all.

## Overview answers

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS/TLS — mandatory deployment requirement) |
| Do you provide a way for users to request that their data is deleted? | **Yes** — in-app export exists; deletion via [PLACEHOLDER: contact email] and [PLACEHOLDER: account-deletion URL — must exist before submission; see DEPLOYMENT_CHECKLIST] |

## Data types

### Personal info

| Data type | Collected | Shared | Ephemeral | Required/Optional | Purpose |
|---|---|---|---|---|---|
| Email address | Yes | No | No | Required (account) | Account management |
| User IDs (account id) | Yes | No | No | Required | Account management |
| Name (display name) | Yes | No | No | Required at signup (user-chosen, needn't be real name) | Account management, personalization |

### Health and fitness

| Data type | Collected | Shared | Ephemeral | Required/Optional | Purpose |
|---|---|---|---|---|---|
| **Fitness info** (workout sessions, exercises, sets/reps/weights, plans, planned-vs-actual deltas, soreness/sleep check-ins) | Yes | No *(service-provider exemption — see framing note; sent to Anthropic only when AI on)* | No | Optional (app works without logging, though it's the point of the app) | App functionality (logging, progress, plan adjustment) |
| **Health info** (bodyweight entries; meal/nutrition logs) | Yes | No *(meals: same exemption; bodyweight is never sent to Anthropic at all)* | No | Optional | App functionality |

### Messages

| Data type | Collected | Shared | Ephemeral | Required/Optional | Purpose |
|---|---|---|---|---|---|
| Other in-app messages (AI coach chat) | Yes | No *(service-provider exemption — chat only functions when AI is on)* | No | Optional | App functionality (AI coach) |

### Categories NOT collected (answer "No" across the form)

Location · Financial info · Photos & videos · Audio · Files & docs (exports
are user-initiated shares of their own data, generated on-device — not
collected by us) · Calendar · Contacts · App activity (no analytics, no
interaction tracking) · Web browsing · App info & performance (no crash
logs, no diagnostics SDK) · Device or other IDs (no advertising ID, no
device fingerprinting).

## Per-answer notes

- **Ephemeral processing:** answer **No** everywhere — logs are stored
  server-side. (AI requests themselves are transient, but the underlying
  data is persisted, which is what the form asks about.)
- **Required vs optional:** account data is required; every health/fitness
  data type is only collected when the user actively logs it.
- **Data deletion:** the schema cascades — deleting the user row removes all
  associated data. The **self-service deletion flow does not exist yet** and
  Play requires one (in-app + web URL) for apps with account creation.
  Blocking item; see `DEPLOYMENT_CHECKLIST.md`.
- **Third-party libraries:** no SDK in the app transmits data on its own (no
  Firebase/analytics/ads). Exercise demo images are fetched from GitHub's
  CDN — an ordinary content fetch (IP address visible to the host), not a
  user-data transfer; no Data-safety entry needed, but it is disclosed in
  the privacy policy.
- **Account creation question:** app requires account creation (email +
  password).
- **Independent security review / MASA:** not done — answer accordingly
  (optional section).

## Health apps declarations

Because ProFit is a Health & Fitness app, Play Console will also require the
**Health apps declaration** (Health Content and Services policy): declare the
app's health features (fitness tracking, nutrition logging), that it is not a
medical device, and link the privacy policy. ProFit does **not** integrate
Health Connect — answer "No" to Health Connect questions.
