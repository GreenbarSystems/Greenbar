# Greenbar — Beta Test Checklist

Use this when promoting a build into **TestFlight** (iOS) or **Google Play
Internal / Closed Testing** (Android). Greenbar is a Capacitor-wrapped PWA;
both store builds carry the same JS bundle, so a single failure on the web
side breaks both wrappers.

Architecture confirmed: **Capacitor + PWA shell** (single `index.html`,
vanilla JS modules under `js/`, service worker `sw.js`, manifest
`manifest.json`). No React/Vite/Next build pipeline.

---

## A. Apple TestFlight Readiness Plan

### A.1 Tester groups

| Group | Purpose | Size | Composition |
|---|---|---|---|
| **Internal Testers** (App Store Connect users) | Smoke + privacy regression | Up to **100 internal testers** (Apple limit) | Engineering + design + an ops/legal reviewer |
| **External — Friends & Family** | Daily-driver feedback on real bank exports | **10–25 testers** | Mixed iPhone models (SE / 13 / 15) + iOS 16/17/18 |
| **External — Privacy enthusiasts** | Adversarial check on data-handling claims | **15–30 testers** | Recruited via privacy-focused communities |
| **External — Accessibility** | VoiceOver / Dynamic Type / contrast | **5–10 testers** | Screen-reader users; low-vision users |

**Minimum total external testers before promotion to production: 50.**
Apple permits up to 10,000 external testers; aim high for a finance app to
expose long-tail bank-format variations.

### A.2 Build cadence
- One TestFlight build per merged PR to `release/*` branches.
- Minimum **7 calendar days** in the latest TestFlight build with zero P0/P1
  before submitting to App Review.

### A.3 Test scenarios (TestFlight)

Every tester must complete these and confirm pass/fail in the in-app
"Send feedback" link or via TestFlight feedback:

- [ ] **CUJ-1 first-run import** (CSV)
- [ ] **CUJ-2 PDF import**
- [ ] **CUJ-3 reconcile**
- [ ] **CUJ-4 PIN unlock**
- [ ] **CUJ-5 biometric unlock (Face ID / Touch ID)**
- [ ] **CUJ-6 encrypted backup → restore**
- [ ] **CUJ-7 recovery-key restore**
- [ ] **CUJ-8 privacy blur**
- [ ] **CUJ-10 offline cold start**
- [ ] **CUJ-11 anomaly review**
- [ ] **CUJ-12 monthly checkup**

(CUJ-9 share target is Android-only — skip on iOS TestFlight.)

### A.4 Critical user journeys to instrument feedback prompts on
- After first successful import.
- After first successful encrypted backup.
- After 7 days of installed use.

(Prompts are local Capacitor UI, not network telemetry.)

### A.5 Accessibility testing
- [ ] VoiceOver pass on CUJ-1, CUJ-6, CUJ-12.
- [ ] Dynamic Type at largest setting — no clipped UI.
- [ ] Contrast verified in light + dark themes.
- [ ] Reduced-motion respected.
- [ ] All tap targets ≥ 44 × 44 pt.

### A.6 Offline testing
- [ ] Airplane-mode cold start works.
- [ ] PDF import works offline (vendored PDF.js engine present in cache).
- [ ] Encrypted backup export works offline.
- [ ] Restore works offline.

### A.7 Import testing (real-world bank coverage)
Solicit testers from at least these banks:
- [ ] Chase
- [ ] Bank of America
- [ ] Wells Fargo
- [ ] Capital One
- [ ] Citi
- [ ] American Express
- [ ] One UK bank (Monzo / Starling / Lloyds)
- [ ] One Canadian bank (RBC / TD)
- [ ] One Australian bank (CBA / ANZ)

If any bank's export fails, add a column-mapping preset before release.

### A.8 Security testing
- [ ] PIN back-off triggers on 3 wrong attempts.
- [ ] Wrong passphrase rejects encrypted backup with no partial data leak.
- [ ] Force-quitting during export does not leave a partial file in the
      app sandbox.
- [ ] Biometric prompt cancel falls through to PIN.

### A.9 App Review readiness (before "Submit for Review")
- [ ] Privacy Nutrition Label set to "Data Not Collected".
- [ ] App Tracking Transparency NOT triggered (we do not track).
- [ ] Demo account credentials field on App Review form filled with: "No
      account required. Use the in-app demo data toggle in Settings → Help
      → Demo data."
- [ ] Review notes mention the bank-statement import use case and link to
      a sample CSV the reviewer can import.
- [ ] Age rating completed (4+ recommended; finance content only).
- [ ] Encryption export compliance answered (uses standard HTTPS + Web
      Crypto AES-GCM only → ITSAppUsesNonExemptEncryption = NO if shipping
      under the exempt-cryptography exception; consult legal).

---

## B. Google Play Beta Testing Plan

Play has **three** pre-production tracks. Greenbar uses all three in order.

### B.1 Internal testing track

| Field | Value |
|---|---|
| **Tester count** | Up to **100** (Play limit) |
| **Recommended** | 5–10 internal team members |
| **Duration** | 24–72 hours per build |
| **Goal** | Smoke test the Capacitor wrapper does not differ from the PWA |

**Success criteria**
- [ ] App installs on all matrix devices.
- [ ] App opens; service worker registers; offline mode works.
- [ ] CUJ-1 through CUJ-12 all pass at least once.
- [ ] No crashes in Play Console "App quality → Android vitals" within 24 h.

**Exit criteria**
- Zero P0 issues.
- Internal sign-off from engineering + design.

### B.2 Closed testing track

| Field | Value |
|---|---|
| **Tester count** | **20 testers minimum for 14 continuous days** (Play production-promotion requirement for new personal accounts; aim for 50+) |
| **Recommended** | 50–200 testers across at least 5 device families |
| **Duration** | Minimum 14 days of opted-in testing |
| **Goal** | Real-world variety: banks, OS versions, device sizes |

**Tester recruitment**
- Closed Google Group with explicit ToS notice.
- Recruit from Reddit r/personalfinance, privacy-focused communities,
  and friends-and-family.

**Success criteria**
- [ ] Crash-free user rate ≥ 99.5% in Play Console.
- [ ] ANR rate ≤ 0.47% (Play "bad behavior" threshold).
- [ ] Real-bank import variety covered (see A.7 list above).
- [ ] At least 5 testers complete the encrypted-backup → restore cycle
      with a successful round-trip.

**Exit criteria**
- Zero open P0/P1 over the last 7 days of the test window.
- 14 continuous days of opted-in tester activity (Play hard requirement
  for new personal-account submissions).

### B.3 Open testing (optional)
Skipped for v1.0.0 — promote Closed → Production directly. Revisit for
v1.x feature releases where wider beta feedback is useful.

### B.4 Play Console Data Safety
- [ ] Data Safety form completed.
- [ ] "Data collected" = none.
- [ ] "Data shared" = none.
- [ ] "Data processed ephemerally on-device" = yes (financial info).
- [ ] "Data encrypted in transit" = yes (backups, when uploaded by the
      user to a chosen cloud destination, ride OS-level TLS).
- [ ] "Users can request data deletion" = yes (in-app reset + uninstall).
- [ ] Independent security review claimed: NO (we have not had one).

### B.5 Pre-launch report
- [ ] Review Play Console "Pre-launch report" crawl results.
- [ ] Resolve every flagged accessibility or performance warning.
- [ ] Screenshots match the in-app screens at the current version.

---

## C. Cross-platform beta exit checklist

Before promoting **any** beta build to production, confirm all of:

- [ ] All TestFlight CUJs pass on iOS 16 + 17 + 18.
- [ ] All Play CUJs pass on Android 11 + 13 + 14.
- [ ] CHANGELOG.md updated with the release entry.
- [ ] RELEASE_NOTES.md authored for the version.
- [ ] `js/version.js`, `sw.js` `CACHE_VERSION`, `manifest.json` all bumped.
- [ ] iOS `CFBundleShortVersionString` + `CFBundleVersion` bumped.
- [ ] Android `versionName` + `versionCode` bumped.
- [ ] Privacy Policy live at https://www.greenbarsystems.com/privacy.
- [ ] Terms of Service live at https://www.greenbarsystems.com/terms (if applicable).
- [ ] Support email reachable.
- [ ] Store listing screenshots refreshed if any UI shifted.
- [ ] Tag pushed: `git tag v{X.Y.Z} && git push --tags`.

---

## D. Going-to-production sign-off

A release is approved for production when **all three** sign-offs are
recorded in the release-tracking issue:

1. **Engineering lead** — confirms test plan passes, no open P0/P1.
2. **Design / product** — confirms UX is in good standing, copy reviewed.
3. **Legal / compliance** — confirms Privacy Policy, store privacy
   labels, and any encryption export compliance answers are aligned.
