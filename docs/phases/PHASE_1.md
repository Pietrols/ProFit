# Phase 1: Accounts

**Done when:** sign in with Google on Android, skip onboarding, close the app, reopen it with no
connection, and still be signed in on Home.

## How sign-in works

```
Phone                                   ProFit API                        Google
-----                                   ----------                        ------
1. "Continue with Google"
   Credential Manager shows accounts -------------------------------------> picks account
   <---------------------------------------------------- ID token (signed by Google)
2. POST /auth/google { idToken } ----->
                                        3. check the token's signature against Google's
                                           public keys, its issuer, audience and expiry
                                        4. find or create the user by Google's account id
                                        5. issue a ProFit access token (15 minutes)
                                           and a refresh token (60 days)
   <----------------------------------- { accessToken, refreshToken, user, profile }
6. keep tokens in SecureStore, keep profile on the phone
```

Every later request sends the access token. When it is about to expire the app trades the
refresh token for a new pair. Each refresh token works once: using it returns a new one and
retires the old. If a retired token is ever presented again, someone copied it, so the whole chain
is cancelled and the user has to sign in again.

**Offline:** the app decides "signed in" from what is stored on the phone, not from the server.
Opening the app with no connection shows Home straight away with the saved profile. Tokens are
refreshed later, when the connection is back.

## Backend pseudocode

```
POST /auth/google { idToken }
  identity = verifyGoogleIdToken(idToken)        // signature, iss, aud, exp; email must be verified
  user = upsert users where google_sub = identity.sub
  ensure a profiles row exists for user (onboarding = pending)
  return issueTokens(user) + user + profile

POST /auth/refresh { refreshToken }
  row = refresh_tokens where hash = sha256(refreshToken)
  if no row or expired            -> 401 SESSION_EXPIRED
  if row already used or revoked  -> revoke every token in row.family; 401 SESSION_EXPIRED
  mark row used; return issueTokens(row.user, same family)

POST /auth/sign-out { refreshToken }   -> revoke the family, 204

GET  /me      (needs access token) -> { user, profile }
PATCH /me     (needs access token) -> validate fields with Zod, update, return { user, profile }

requireAuth: read "Authorization: Bearer <token>", verify the JWT
  missing/invalid -> 401 UNAUTHENTICATED; expired -> 401 TOKEN_EXPIRED (the app refreshes and retries)
```

Tables: `users` (Google account id, email, name, photo), `profiles` (goal, experience, where they
train, units, optional details, onboarding status), `refresh_tokens` (hash only, never the token).

## Mobile pseudocode

```
on launch:
  session = SecureStore.get('profit.session')
  profile = cache.get('profile:<userId>')
  if session -> signed in immediately (works offline), then in the background:
                 refresh tokens if close to expiry, send any profile changes made offline,
                 fetch /me to update the cached profile
  else       -> Sign-in screen

route guard (expo-router Stack.Protected):
  signed out                      -> sign-in
  signed in, onboarding pending   -> onboarding
  otherwise                       -> tabs

onboarding: name -> goal -> experience -> where you train
  every step has Skip; "Skip for now" marks onboarding skipped
  Finish saves the answers and marks it completed
  changes save on the phone first and are sent when online
```

## Not in this phase

- Body weight lives in the Phase 2 weight log, not on the profile.
- Profile changes use a small "pending changes" queue. Phase 2's sync engine replaces it.
- Rate limiting on the auth routes waits for Phase 11 hardening (tokens are not guessable).
