# ProFit Privacy Policy

> **DRAFT — for review by the owner and ideally a legal professional before
> publishing.**
> **Assumptions made:** (1) the operator is an individual/small developer in
> Zambia, not yet a registered company; (2) the backend will be hosted on
> Oracle Cloud (region to confirm) behind HTTPS; (3) AI features launch
> disabled by default; (4) Anthropic's commercial API terms apply to AI
> processing — verify their current data-use terms before publishing.
> Everything factual below is grounded in `docs/DATA_INVENTORY.md`.

**Effective date:** [PLACEHOLDER: effective date]
**Operator:** [PLACEHOLDER: your legal name or company legal name], operating
from Zambia ("we", "us").
**Contact for privacy requests:** [PLACEHOLDER: contact email]

ProFit is a workout and nutrition tracker. This policy explains what data the
app handles, where it lives, and your choices — in plain English.

## 1. What we collect, and why

**Account data**
- Email address and a display name — to create and identify your account.
- Your password — stored only as a secure hash (bcrypt); we never store or
  see the plaintext.

**Profile**
- Training goal (bulking / cutting / maintaining), training days per week,
  training context (home or gym), and preferred units (kg/lb) — used to
  build your plan and tailor suggestions.
- An ability level (beginner / intermediate / advanced) that the app derives
  from your logged sessions.

**Health and fitness data** (we treat all of this as sensitive)
- Workout logs: sessions, exercises, sets, reps, weights, what you skipped
  or swapped, and session timing — the core of the product.
- Bodyweight entries.
- Recovery check-ins: soreness and sleep quality ratings (1–5).
- Meal data: foods you tell us you usually eat, and daily meal logs (food
  name, portion, meal type).

**Coach chat**
- If you use the AI coach, the messages you type and the replies you receive
  are stored so you can re-read them. Don't type anything you don't want
  stored.

**What we do NOT collect:** location, contacts, photos, advertising
identifiers, analytics or tracking data, or data from other apps. ProFit has
no ads and no analytics SDKs.

## 2. Where your data lives

- **On your device:** everything you log is written to a local database on
  your phone first, so the app works offline. Your login token is kept in
  Android's secure storage. Theme and reminder preferences never leave the
  device. Uninstalling the app removes all local data.
- **On our server:** your account, profile, and logs sync to our server
  (hosted at [PLACEHOLDER: hosting provider + region, e.g. Oracle Cloud,
  <region>]) so your data survives a lost phone. Sync is designed so retries
  never duplicate your data.

## 3. Data in transit

All traffic between the app and our server is encrypted with HTTPS/TLS.
Requests are authenticated with a signed token that expires after 30 days.

## 4. AI features and Anthropic (third-party transfer)

ProFit's AI features (session adjustments, ability detection, meal
suggestions, and the coach chat) are powered by Anthropic's Claude API.
You should know exactly how this works:

- **AI is off by default.** When it is off, the app uses built-in rules and
  no data is sent to Anthropic at all. Chat shows "coach unavailable".
- **Everything is proxied through our server.** The app never talks to
  Anthropic directly, and no Anthropic credentials exist on your device.
- **What is sent when AI is on:** your goal, ability level, training
  context, a summary of your plan (exercise names and equipment), summaries
  of recent sessions (reps, weights, skipped sets), your average weekly
  soreness, today's logged meals and your usual foods, and — in chat — the
  text you type. **What is never sent:** your email, name, password, login
  tokens, or bodyweight entries.
- Anthropic processes this data to generate the response, under its
  commercial API terms ([PLACEHOLDER: link to Anthropic's current
  privacy/data-use terms after verifying them]).

Separately, exercise demonstration images are loaded from a public
image host (GitHub). Like any web request, that host sees your device's IP
address — but none of your ProFit data.

## 5. How we use your data

Only to run ProFit for you: authentication, generating and adjusting your
training plan, showing your progress charts, nutrition suggestions, and the
coach chat. We do not sell your data, use it for advertising, or share it
with anyone except the AI processing described in section 4.

## 6. Retention

Your data is kept while your account exists. If you stop using ProFit,
nothing is auto-deleted — ask us to delete it (section 7) whenever you like.

## 7. Your choices: export and deletion

- **Export:** the app has built-in export (Profile → "Your data") — a full
  JSON of your workouts, bodyweight, and meals, plus a spreadsheet-friendly
  CSV of every set. Your logs are yours.
- **Deletion:** email [PLACEHOLDER: contact email] from your account's email
  address and we will delete your account and all associated server data
  within [PLACEHOLDER: e.g. 30] days. Deleting the app from your phone
  removes all locally stored data. [PLACEHOLDER: replace with the in-app /
  web deletion flow once built — required before Play submission.]
- **Avoiding AI processing:** AI features are off by default; if enabled on
  the server in future, [PLACEHOLDER: describe the user-facing AI opt-out
  toggle if/when one ships — currently the flag is server-wide].

## 8. Children

ProFit is not directed at children under 13, and we do not knowingly collect
data from them. If you believe a child has created an account, contact us
and we will delete it.

## 9. Your rights

Wherever you are, we honor the basics: you can ask what we hold about you,
get a copy (or just use the in-app export), correct it, or have it deleted.
If you are in a jurisdiction with specific data-protection rights (such as
the EU/GDPR or Zambia's Data Protection Act, 2021), we will handle your
request under that law. Contact: [PLACEHOLDER: contact email].

## 10. Changes to this policy

If this policy changes materially, we will update the effective date above
and announce the change in the app and/or by email before it takes effect.
The current version always lives at [PLACEHOLDER: public policy URL].

## 11. Contact

[PLACEHOLDER: your legal name or company legal name]
[PLACEHOLDER: contact email]
[PLACEHOLDER: postal address if required in your jurisdiction — do not
invent one]
