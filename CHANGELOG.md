# Changelog

All notable changes to **Greenbar** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The single source of truth for the current version is [`js/version.js`](./js/version.js).
When bumping a release here, also bump `gbVersion` in that file, the `CACHE_VERSION`
constant in `sw.js`, and the `version` / `version_name` fields in `manifest.json`.

---

## [Unreleased]

### Changed
- **App icon** redesigned to the Greenbar three-bar company mark (top green,
  middle slate, bottom green) on the navy plate — replaces the previous
  six-bar chart silhouette. PWA manifest, iOS launcher, Android adaptive
  icon, and Play Store listing all regenerated from the new master.
- **Service worker** `CACHE_VERSION` bumped to `v86` so installed PWAs pick
  up the new manifest + icon on next launch.

### Added
- **Play Store feature graphic** master + generated 1024 × 500 PNG at
  `assets/icons/play/play-feature-1024x500.png`.

---

## [1.0.0] — 2026-06-06

First public release. This entry rolls up the work shipped on `main` prior to
formal semantic-versioning being introduced; subsequent entries will follow
the change-by-change Keep-a-Changelog convention.

### Added
- **Centralized app version** (`js/version.js`) wired into the Settings footer,
  the in-app tour modal, the PWA manifest, the service-worker cache name, and
  the encrypted-backup payload (so older releases can warn on backups made by
  newer ones).
- **Achievements section** is now always visible on the Summary screen.
- **Transactions tab** now hosts the Trust bar (moved from Summary).
- **Recurring-charge detection** (`js/recurring.js`) and **transfer-rule
  resolver** (`js/transfers.js`) restored after the v0 audit cuts; both
  contribute to gbTrends.
- **Encrypted backups** (AES-GCM-256 with PBKDF2-SHA256 key derivation, plus
  a recovery-key path).
- **PIN protection** with optional biometric unlock (Face ID / Touch ID /
  fingerprint) on supported devices.
- **CSV + PDF statement import**, fully offline, parsed on-device.
- **Anomaly detection**, **insights**, **goals**, **monthly checkup**
  (3-step routine), and **statement reconciliation**.
- **PWA install + Share Target + File Handling** so statements can be opened
  directly from the OS file picker or share sheet.

### Changed
- **Budget nav button** renamed to **Tracker** for clarity.
- **Verification states** are now precise: "Reviewed" is gated on actual
  human action rather than being inferred from passive viewing.
- **Fix-step checklist** end-state polished; Insights demoted below
  Achievements on Summary; Achievements gating refined.
- **Summary review notifications** consolidated to a single surface.
- **Monthly checkup** condensed from 5 → 3 steps.
- **Tour** replaced an animated coachmark engine with a single static-text
  modal — same coverage, ~225 LOC saved.
- **Summary redesign**: period selector, collapsible panels, Insights moved up.

### Removed
- Drag-and-drop import path (file picker + Share Target + File Handling remain).
- `js/plan.js`, `js/scenario.js`, `js/forecast.js`, `js/accounts.js`,
  `js/profiles.js`, `js/recurringCardHTML` and the legacy `modal-recurring`
  dialog — all retired during the v0 overengineering audit.
- 75 orphan CSS rules from `styles/main.css`.

### Fixed
- **`sw.js` precache failure** — `cache.addAll()` was 404-ing on dead module
  URLs, atomically failing the entire offline-shell install for fresh PWA
  users. ASSETS list cleaned and `CACHE_VERSION` bumped.
- Multiple smaller correctness, sanitization, and a11y fixes (see commit
  history for the full list).

### Security
- All financial data stays on-device. No servers, no analytics SDKs, no
  third-party tracking, no advertising networks.
- Biometric matches happen in the OS; the app sees only success/failure.
- PIN is stored only as a one-way PBKDF2-SHA256 derivation with a
  per-install salt.

---

## Version-bump checklist

Whenever you ship a new release:

1. **Pick the bump.** `PATCH` for fixes, `MINOR` for new features (no data
   break), `MAJOR` for incompatible data/UX changes.
2. **Edit `js/version.js`** — change `MAJOR` / `MINOR` / `PATCH` /
   `BUILD_DATE`. The `CODE` field auto-derives from the integers.
3. **Edit `sw.js`** — bump `CACHE_VERSION` (e.g. `greenbar-shell-v85` →
   `greenbar-shell-v86`) so installed PWAs invalidate stale caches.
4. **Edit `manifest.json`** — bump `version` and `version_name` to match
   `gbVersion.SEMVER`.
5. **Add a section to this file** in the format above. Move all
   "Unreleased" notes into the new release section, then reset Unreleased
   to a placeholder.
6. **Write `RELEASE_NOTES.md`** from this CHANGELOG entry (user-facing copy
   for App Store + Play Store + GitHub release).
7. **Tag the commit**: `git tag v1.0.1 && git push --tags`.
8. **For Capacitor wrappers**:
   - iOS: bump `CFBundleShortVersionString` (= SEMVER) and
     `CFBundleVersion` (= `gbVersion.CODE`).
   - Android: bump `versionName` (= SEMVER) and `versionCode` (= `gbVersion.CODE`).

[Unreleased]: https://github.com/GreenbarSystems/Greenbar/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/GreenbarSystems/Greenbar/releases/tag/v1.0.0
