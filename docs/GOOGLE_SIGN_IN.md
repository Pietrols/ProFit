# Setting up Google sign-in

ProFit signs people in with Google only. The phone gets an ID token from Google and sends it to
the API, which checks it (signature, issuer, audience, expiry, verified email) and issues
ProFit's own tokens. How that works is in `docs/phases/PHASE_1.md`; this file is the one-time
setup in Google Cloud.

Until this is done, use developer sign-in (below).

## 1. Create the Google Cloud project and consent screen

1. In the Google Cloud console, create a project, for example `ProFit`.
2. Set up the OAuth consent screen (in the console's Google Auth Platform section):
   - App name `ProFit`, your support email, and a developer contact email.
   - Audience: **External**.
   - Data access: the default `openid`, `email` and `profile` scopes are all ProFit needs.
3. While the app is in **Testing**, only the Google accounts listed as test users can sign in
   (up to 100). Add yourself and the founding gym members there. Publishing the app later removes
   that limit; Google may ask for verification at that point.

## 2. Create three OAuth clients

Under Credentials, create these OAuth client IDs:

| Client type | Settings | Used by |
|---|---|---|
| **Web application** | Name it `ProFit web`. No origins or redirects needed. | The phone asks Google for ID tokens issued to this client, and the API accepts them. |
| **Android** | Package `com.quanticengineering.profit` and the SHA-1 of the signing certificate (see below). | Lets Credential Manager on Android trust the app. |
| **iOS** | Bundle ID `com.quanticengineering.profit`. | iOS builds only. |

### Which SHA-1 goes on the Android client

Google matches the app by package name and signing certificate, so every certificate the app is
signed with needs its SHA-1 on an Android client (add more clients if there are several):

- **EAS builds** (development and preview): run `npx eas-cli@latest credentials -p android` in
  `mobile/`, pick the build profile, and copy the SHA-1 fingerprint of the keystore.
- **Google Play** releases: Google re-signs the app with its own key. Copy that SHA-1 from
  Play Console, under App integrity, once the app exists there (Phase 11).

A missing or wrong SHA-1 shows up in the app as "Google sign-in is not set up for this build".

## 3. Put the client IDs in the env files

`mobile/.env`:

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<Web client ID>
# iOS only: the iOS client's "iOS URL scheme" (reversed client ID)
EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.<...>
```

`backend/.env` (and the server's environment in production):

```
# The Web client ID, plus the iOS client ID once iOS builds exist
GOOGLE_CLIENT_IDS=<Web client ID>,<iOS client ID>
```

The Android client ID is not entered anywhere: Google finds it from the package name and SHA-1.

## 4. Rebuild or restart

- **Android:** the client ID is read when the JavaScript bundle is built, so restart the dev server
  with `npx expo start --clear`. No new development build is needed.
- **iOS:** the URL scheme is added to the native app by the sign-in library's config plugin
  (`mobile/app.config.ts` adds it once `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` is set), so make a new
  development build.
- **EAS preview and production builds** bundle the JavaScript in the cloud, so the same
  `EXPO_PUBLIC_` values must also be set as EAS environment variables for those profiles.

## Developer sign-in

For emulators, local testing and Claude Code sessions before Google is set up:

1. `backend/.env`: `AUTH_DEV_LOGIN=true` (the API refuses to start with it in production).
2. `mobile/.env`: `EXPO_PUBLIC_DEV_LOGIN=true`. The button only appears in development builds.
3. The sign-in screen shows a "Developer sign-in" card that signs in any email address.

## Troubleshooting

| What you see | Likely cause |
|---|---|
| "Google sign-in is not set up in this build yet" | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is empty, or the dev server was not restarted after setting it. |
| "Google sign-in is not set up for this build (check the SHA-1 ...)" | The Android client's package name or SHA-1 does not match the build's signing key. |
| Account picker works, then "Sign-in failed" with an invalid token message | `GOOGLE_CLIENT_IDS` on the API does not include the Web client ID. |
| Only some Google accounts can sign in | The consent screen is in Testing and the account is not a test user. |
| "Google Play services is missing or out of date" | Update Play services on the phone or emulator (use an emulator image with Google Play). |
