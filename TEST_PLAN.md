# Greenbar — Test Plan

**Application:** Greenbar
**Version under test:** 1.0.0
**Architecture:** Capacitor-wrapped PWA (single HTML shell + vanilla JS modules +
service worker; iOS and Android wrappers carry the same web bundle).
**Distribution:** Apple App Store (TestFlight → Production), Google Play
(Internal Testing → Closed Testing → Production), plus the installable PWA
hosted at `https://greenbarsystems.github.io/Greenbar/`.

This plan covers what we test before a public release. It is written for the
Capacitor architecture: every behavior must pass once in **Safari iOS**, once
in **Chrome Android**, once in the **iOS Capacitor wrapper (TestFlight)**, and
once in the **Android Capacitor wrapper (Play Internal Testing)**. Pure-PWA
deployments are validated alongside the wrappers because they share the same
JS bundle.

---

## 1. Test environment matrix

| Platform | OS versions | Devices (min) | Browser / runtime |
|---|---|---|---|
| iOS Capacitor wrapper | iOS 16, iOS 17, iOS 18 | iPhone 13, iPhone 15, iPhone SE (2nd gen) | WKWebView |
| Android Capacitor wrapper | Android 11, Android 13, Android 14 | Pixel 6, Pixel 8, mid-range Samsung | Chromium WebView |
| PWA on Safari | iOS 17, iOS 18 | iPhone 13 + 15 | Safari + Add to Home Screen |
| PWA on Chrome | Android 13, Android 14 | Pixel 7 | Chrome + Install |
| PWA on desktop | macOS Sonoma, Windows 11 | Any | Safari, Chrome, Edge, Firefox |

All four runtimes share `index.html`, `js/*`, `styles/main.css`, and `sw.js`.
A failure on one is almost always a failure on all; matrix coverage exists to
catch the WebView quirks that differ from the system browser (autofill,
biometric API surface, file-picker MIME handling, share-target intents).

---

## 2. Critical user journeys (CUJs)

Each CUJ must pass on every row of the platform matrix before sign-off.

### CUJ-1 — First-run import (cold start, no data)
1. Install fresh (uninstall first if previously installed).
2. Launch. Confirm flash intro plays exactly once.
3. Tap "Get started → Tour", complete the 4-screen tour, land on Summary.
4. Open the file picker, import a known-good CSV.
5. **Pass:** Summary, Tracker, Transactions, Insights all populate within
   2 s on the test devices.

### CUJ-2 — PDF statement import
1. From a fresh install with no data, tap import, choose a PDF statement.
2. **Pass:** PDF parses on-device (verify with airplane mode on), transactions
   appear with correct dates, amounts, and inferred categories.

### CUJ-3 — Reconciliation
1. Import the statement.
2. Open the statement again outside the app to read its true total.
3. In-app: open Transactions → reconcile.
4. **Pass:** "Reconciled" badge appears only after the totals match a
   user-typed expected amount.

### CUJ-4 — PIN unlock
1. Settings → Security → Enable lock → set 6-digit PIN.
2. Background the app → wait past the auto-lock idle timeout → foreground.
3. **Pass:** Lock screen masks all content; correct PIN unlocks; wrong PIN
   3× triggers the back-off message.

### CUJ-5 — Biometric unlock
1. PIN already set. Settings → Security → enable biometric.
2. Foreground after auto-lock.
3. **Pass:** Face ID / Touch ID / fingerprint prompt fires; success unlocks
   without typing the PIN; cancel falls through to the PIN pad.

### CUJ-6 — Encrypted backup → restore
1. Import data (CUJ-1 baseline).
2. Settings → Data → Export encrypted backup with a passphrase.
3. Save the file out (Files / Drive / email to self).
4. Uninstall the app.
5. Reinstall. Settings → Data → Restore encrypted backup. Provide passphrase.
6. **Pass:** All months, budgets, goals, settings restored exactly.

### CUJ-7 — Recovery-key restore
1. Repeat CUJ-6 but at step 5 provide the recovery key instead of the
   passphrase.
2. **Pass:** Restore succeeds without the passphrase.

### CUJ-8 — Privacy mode (blur)
1. Enable Settings → Security → Privacy mode default.
2. Background → foreground.
3. **Pass:** All currency amounts render blurred until the user taps the
   toggle.

### CUJ-9 — Share target import (Android PWA only)
1. Open a bank statement in another app (Gmail, Drive).
2. Share → choose Greenbar.
3. **Pass:** Greenbar imports the file via the manifest share target.

### CUJ-10 — Offline cold start
1. After at least one launch online, kill the app.
2. Switch the device to airplane mode.
3. Cold-start the app.
4. **Pass:** Greenbar opens, all features work, including PDF import.

### CUJ-11 — Anomaly detection + review queue
1. Import statement with at least one outlier transaction.
2. Open Summary → Insights → Anomalies.
3. **Pass:** The outlier is flagged; "Review" marks the row reviewed and
   removes it from the unreviewed queue (gated on human action — not
   inferred from view).

### CUJ-12 — Monthly checkup (3-step routine)
1. Run checkup from the Summary entry point.
2. **Pass:** Three steps complete in order — Import → Review unusual →
   Adjust budget/goals. No regressions of the deprecated 5-step flow.

---

## 3. Functional test scenarios

### 3.1 Statement parsing
| Test | Expected |
|---|---|
| Chase CSV | All txns; categories inferred; date format US |
| Wells Fargo CSV | All txns; positive-credit convention preserved |
| Capital One CSV | All txns; type column collapsed |
| Bank of America PDF | All txns; multi-page handled |
| Empty file | Friendly empty-state, no crash |
| File >5 MB | Spinner shown; no UI freeze |
| Malformed CSV (mixed delimiters) | Error message, no partial corrupt import |
| Garbage PDF (no text layer) | Error message offering "try CSV instead" |
| CSV with UTF-8 BOM | Headers parsed correctly |
| CSV with semicolon delimiter (EU) | Auto-detected via Format & region |

### 3.2 Math + categorization
- Variance hero matches sum of per-category variances.
- Top Category tile matches the largest "spend" category in the period.
- Custom category remap applies to past + future transactions.
- Transfer rules auto-exclude marked-transfer descriptions.

### 3.3 Anomaly + recurring detection
- A 3× standard-deviation spike on a recurring vendor is flagged.
- A net-new vendor that appears once is NOT flagged.
- A genuine subscription appears in the recurring list once active 3 months.

### 3.4 Goals
- Goal "X by date Y" computes monthly contribution needed.
- Editing the target updates the contribution figure in real time.
- Completed goals get the achievement badge.

### 3.5 Reconcile + cleanup
- Undo last import reverts only that import's transactions.
- Delete a month leaves prior months untouched.
- Dedupe removes only exact-key duplicates (date + amount + cleaned desc).

---

## 4. Accessibility testing

| Check | How to verify |
|---|---|
| All interactive elements are `<button>` or `<a>` (no clickable `<div>`) | DOM audit |
| `aria-current` on active bottom-nav tab and active month pill | VoiceOver / TalkBack |
| Live regions announce summary/budget/txs content changes | VoiceOver, "Speak Screen" |
| Color contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text | Stark / axe |
| Tappable areas ≥ 44 × 44 pt (iOS HIG) / 48 × 48 dp (Material) | Device measurement |
| No information conveyed by color alone (e.g., variance signs) | Greyscale mode |
| Reduced-motion respects `prefers-reduced-motion` | OS toggle on |
| Dynamic Type / font scaling does not clip critical UI | iOS Settings: Larger Text |

Run **VoiceOver** end-to-end on CUJ-1 + CUJ-6 + CUJ-12. Run **TalkBack**
end-to-end on the same three.

---

## 5. Offline / network testing

- Cold start in airplane mode (CUJ-10).
- Import a PDF in airplane mode (vendored PDF.js engine must be cached).
- Encrypted backup export in airplane mode.
- Confirm no fetch goes outside the origin (DevTools → Network panel, then
  airplane mode + Charles/mitmproxy on a sanity-check pass).

---

## 6. Security testing

| Test | Pass criteria |
|---|---|
| PIN is never written to storage as plaintext | Storage inspection shows only PBKDF2 hash |
| Biometric data never leaves the OS | App only receives boolean success/failure |
| Encrypted backup cannot be opened without passphrase OR recovery key | Verified by attempting decryption with wrong inputs |
| Wrong PIN x3 triggers back-off | Timer visible; correct PIN after back-off succeeds |
| Auto-lock at configured idle timeout | Timer respected on real-world background/foreground |
| No third-party domain requests at any time | DevTools network log, mitmproxy capture |
| No file with the word "secret" / "token" / "key" sent in any request | Log audit (only ./ same-origin GETs expected) |
| Encrypted backup uses AES-GCM-256 with a 16-byte random salt and 12-byte random IV per export | Backup byte-format inspection |
| PBKDF2 iteration count is ≥ 600,000 | Code review of `_gbDeriveAesKey` |

---

## 7. Import-friction / share-target / file-handling

- File picker accepts `.csv`, `.tsv`, `.txt`, `.pdf`.
- File picker rejects `.xlsx` with a helpful message.
- "Open with Greenbar" works from iOS Files app (file handler).
- "Share with Greenbar" works from Android share sheet (share target).
- PWA can be installed and launched standalone from the home screen.

---

## 8. Exit criteria

A release is **ready** when **all** of the following are true:

1. All 12 CUJs pass on every row of the platform matrix.
2. Zero open P0 (crash, data loss, security) bugs.
3. ≤ 2 open P1 (broken feature) bugs, each with a documented user workaround.
4. Accessibility audit (Section 4) passes on iOS + Android.
5. Offline test (Section 5) passes with no outbound network traffic.
6. Security tests (Section 6) all pass.
7. Privacy Policy and store listing are reviewed and live.
8. Beta-testing exit criteria (see `BETA_TEST_CHECKLIST.md`) are met.

---

## 9. Out of scope

- Web push notifications (Greenbar has none — privacy-first).
- Cloud sync (intentionally absent).
- Server-side analytics (none exist).
