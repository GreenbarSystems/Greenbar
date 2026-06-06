// ════ Greenbar — gbVersion: single source of truth for the app version ════
//
// Semantic Versioning 2.0.0 (https://semver.org):
//   MAJOR  — incompatible data/UX breaks (e.g. backup format bump that older
//            releases cannot read).
//   MINOR  — backwards-compatible feature additions (new module, new screen,
//            new optional setting). Existing data keeps working untouched.
//   PATCH  — backwards-compatible bug fixes, copy tweaks, perf, refactors.
//
// HOW TO BUMP
//   1.  Edit the three integers below.
//   2.  Bump sw.js CACHE_VERSION (so installed PWAs invalidate stale caches).
//   3.  Add a section to CHANGELOG.md describing the change (Keep-a-Changelog
//       format).
//   4.  Tag the commit:  git tag v<MAJOR>.<MINOR>.<PATCH> && git push --tags
//
// WHERE THE VERSION SHOWS UP
//   • Settings → bottom of the screen ("Greenbar 1.0.0 · build YYYY-MM-DD").
//   • The "About / How Greenbar works" tour modal footer.
//   • The PWA manifest (version_name field).
//   • Encrypted backup payloads (pkg.appVersion) — so a restore can warn the
//     user when a backup was made by a newer release than the one they have
//     installed.
//
// PRIVACY INVARIANT REMINDER — nothing here phones home. There is no remote
// version check, no update ping, no telemetry. The version string is for the
// user's eyes (and for backup compatibility checks), nothing else.
const gbVersion = (() => {
  const MAJOR = 1;
  const MINOR = 0;
  const PATCH = 0;

  // Pre-release channel. '' (empty) for production releases. For betas use
  // '-beta.1', '-rc.1', etc. (semver convention).
  const CHANNEL = '';

  // Build date is stamped at release-prep time (the value below is set by the
  // release-prep commit, NOT by JS at runtime — runtime stamping would break
  // the offline-deterministic-install promise). Update when cutting a release.
  const BUILD_DATE = '2026-06-06';

  // Public, conventional name (matches the git tag minus the leading 'v').
  const SEMVER = MAJOR + '.' + MINOR + '.' + PATCH + CHANNEL;

  // Long-form for display ("Greenbar 1.0.0 · build 2026-06-06").
  const DISPLAY = 'Greenbar ' + SEMVER + ' · build ' + BUILD_DATE;

  // Short-form for compact surfaces ("v1.0.0").
  const SHORT = 'v' + SEMVER;

  // Numeric integer code for Android/Play Console versionCode and iOS
  // CFBundleVersion. Formula: MAJOR*10000 + MINOR*100 + PATCH — keeps the
  // ordering monotonic up to 99 minors / 99 patches per major. 1.0.0 → 10000.
  const CODE = MAJOR * 10000 + MINOR * 100 + PATCH;

  return Object.freeze({
    MAJOR, MINOR, PATCH, CHANNEL,
    SEMVER, SHORT, DISPLAY, BUILD_DATE, CODE
  });
})();
