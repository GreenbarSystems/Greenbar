# Greenbar — App Store Release Checklist

End-to-end checklist for shipping a Greenbar release to the **Apple App
Store** and **Google Play Store**. Use in tandem with `TEST_PLAN.md`,
`BETA_TEST_CHECKLIST.md`, and the version-bump steps in `CHANGELOG.md`.

---

## 1. Code-level version bump

- [ ] `js/version.js` — MAJOR / MINOR / PATCH / `BUILD_DATE` updated.
- [ ] `sw.js` — `CACHE_VERSION` bumped (e.g. `greenbar-shell-v85` → `v86`).
- [ ] `manifest.json` — `version` + `version_name` match `gbVersion.SEMVER`.
- [ ] iOS native: `CFBundleShortVersionString` = SEMVER,
      `CFBundleVersion` = `gbVersion.CODE`.
- [ ] Android native: `versionName` = SEMVER, `versionCode` = `gbVersion.CODE`.
- [ ] CHANGELOG.md updated with the new version section.
- [ ] RELEASE_NOTES.md written from CHANGELOG entry.

## 2. Quality gates

- [ ] `TEST_PLAN.md` — all 12 CUJs pass on the platform matrix.
- [ ] `BETA_TEST_CHECKLIST.md` Section C exit criteria all green.
- [ ] Zero open P0 (crash, data loss, security) bugs.
- [ ] ≤ 2 open P1 (broken feature) bugs, each with a known user workaround.
- [ ] Accessibility audit (VoiceOver, TalkBack, contrast, Dynamic Type) passes.
- [ ] Offline cold-start audit passes (network panel + airplane mode).

## 3. Legal + compliance

- [ ] Privacy Policy reviewed by counsel and published at https://www.greenbarsystems.com/privacy
      (source files: `PRIVACY_POLICY.md` + `privacy.html` in this repo).
- [ ] Terms of Service (if any) published at https://www.greenbarsystems.com/terms (skip if no
      separate ToS — the Privacy Policy + App Store EULA cover the baseline).
- [ ] Encryption export compliance answered:
  - [ ] iOS — `ITSAppUsesNonExemptEncryption` set in `Info.plist`.
  - [ ] Android — `default-encryption` declaration consistent with build.
- [ ] Age rating completed (recommend 4+ on iOS, "Everyone" on Play).
- [ ] California Privacy Notice link surfaced in store listing (CCPA).
- [ ] EU representative / GDPR contact identified for store metadata
      (if required by your business structure).

## 4. App Store Connect submission

### 4.1 Metadata
- [ ] App name: **Greenbar**
- [ ] Subtitle: **Private money decisions**
- [ ] Primary category: **Finance**
- [ ] Secondary category: **Productivity**
- [ ] Keywords reviewed (no competitor names; no banned terms).
- [ ] Promotional text (≤ 170 chars) updated.
- [ ] Description matches in-app copy (privacy claims especially).

### 4.2 Assets (matched to version's UI)
- [ ] App icon (1024×1024, no alpha, no rounded corners — Apple rounds it).
- [ ] Screenshots — all required sizes:
  - [ ] 6.7" (iPhone 15 Pro Max): 5+ screenshots.
  - [ ] 6.5" (iPhone 11 Pro Max / XS Max): 5+ screenshots.
  - [ ] 5.5" (iPhone 8 Plus): 5+ screenshots (or marked "use 6.5"" fallback).
  - [ ] 12.9" iPad Pro (if iPad target): 5+ screenshots.
- [ ] App Preview videos (optional, recommended).
- [ ] All screenshots show the current version's UI — no stale screens.

### 4.3 Privacy Nutrition Label
- [ ] "Data Not Collected" selected.
- [ ] No data linked to user.
- [ ] No tracking declared.
- [ ] Privacy Policy URL filled.

### 4.4 App Review form
- [ ] Demo account: **NOT REQUIRED**. State: "No account needed. Use
      Settings → Help → Demo data to load sample transactions."
- [ ] Notes: Attach link to a sample CSV the reviewer can import.
- [ ] Sign-in required: NO.

### 4.5 Pricing
- [ ] Confirm paid-app pricing tier matches Play Console price.
- [ ] Confirm in-app purchases / subscriptions (if any) are configured.

### 4.6 Build
- [ ] Latest TestFlight build selected for review.
- [ ] "What's New in This Version" populated from `RELEASE_NOTES.md`.

## 5. Google Play Console submission

### 5.1 Store listing
- [ ] App name: **Greenbar**
- [ ] Short description (≤ 80 chars) populated.
- [ ] Full description matches privacy claims.
- [ ] Category: **Finance**
- [ ] Tags: budgeting, personal finance, privacy.

### 5.2 Assets
- [ ] App icon (512×512 PNG, transparent OK).
- [ ] Feature graphic (1024×500 PNG/JPG, no transparency).
- [ ] Phone screenshots — 4+ required sizes.
- [ ] 7" tablet screenshots if tablet target.
- [ ] 10" tablet screenshots if tablet target.

### 5.3 Data Safety
- [ ] "Does your app collect or share any of the required user data
      types?" → **NO**.
- [ ] Data processed ephemerally → **YES**.
- [ ] Data encrypted in transit → **YES** (for user-initiated backup
      uploads to user-chosen cloud destinations).
- [ ] Data can be deleted by users → **YES** (in-app reset + uninstall).
- [ ] Independent security review claim → **NO** (unless one has been
      completed and the certificate is attached).

### 5.4 Content rating
- [ ] IARC questionnaire completed.
- [ ] Target audience confirmed (13+ or 18+).
- [ ] Family Policy: marked as **Not designed for children**.

### 5.5 App content
- [ ] Privacy Policy URL added.
- [ ] Ads declaration: **No ads**.
- [ ] Government app declaration: **No**.
- [ ] News app declaration: **No**.
- [ ] COVID-19 contact tracing/status app: **No**.

### 5.6 Pre-launch report
- [ ] Latest pre-launch report reviewed.
- [ ] No new crashes, ANRs, or accessibility warnings since the previous
      report.

### 5.7 Release
- [ ] AAB uploaded with new `versionCode`.
- [ ] "What's new in this release" (≤ 500 chars) populated from
      `RELEASE_NOTES.md`.
- [ ] Staged rollout configured (recommend 10% → 50% → 100% over 7 days
      for the first MAJOR release; later releases can ship 100%).

## 6. Git + release artifacts

- [ ] Branch merged to `main`.
- [ ] Tag pushed: `git tag v{X.Y.Z} && git push --tags`.
- [ ] GitHub Release drafted with `RELEASE_NOTES.md` as the body.
- [ ] GitHub Pages PWA deploy verified at the canonical URL.

## 7. Post-release watch (first 72 hours)

- [ ] Apple "Trends" → installs landing as expected (no zero-day error spike).
- [ ] Play Console "Android vitals" → crash-free rate ≥ 99.5%, ANR ≤ 0.47%.
- [ ] Support email inbox monitored (response SLA: 1 business day).
- [ ] App-review feedback inbox monitored for App Review Board responses.
- [ ] PWA service worker rollout — confirm `CACHE_VERSION` activated for
      returning installs by sampling browser DevTools on the canonical URL.

## 8. Rollback plan

If a P0 surfaces in the first 72 hours:

- **iOS**: Use App Store Connect "Expedited Review" to push a patch
  release. Apple does not support binary rollback once approved.
- **Android**: Halt the staged rollout (Play Console → halt). If already
  100%, push a patch release with bumped `versionCode`. Optionally use
  Play Console "Resume rollout" once the patch is published.
- **PWA**: Push a hotfix to `main`, bump `js/version.js` + `CACHE_VERSION`,
  redeploy. Returning users invalidate cache and receive the patched
  bundle within one launch.
- **Backup-format break**: Never. If a release would change the backup
  format incompatibly, the bump must be MAJOR and `RELEASE_NOTES.md`
  must lead with the migration guidance.
