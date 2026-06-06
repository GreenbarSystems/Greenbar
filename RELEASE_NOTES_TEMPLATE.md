# Greenbar {{VERSION}} — Release Notes

**Version:** {{VERSION}}
**Build date:** {{BUILD_DATE}}
**Channel:** {{CHANNEL}}            <!-- Production / Beta / Internal -->
**Bundle / version code:** {{CODE}}

---

## What's new

<!-- Two-to-four sentences of the human story behind this release. What changes
     for the user this version? Avoid jargon. Lead with the verb. -->

### Highlights
- <!-- bullet 1, user-facing, one sentence -->
- <!-- bullet 2 -->
- <!-- bullet 3 -->

### Improvements
- <!-- smaller polish + perf items -->

### Bug fixes
- <!-- one line per fix, user-perspective ("X no longer Y") -->

---

## App Store / Google Play submission copy

**App Store "What's New" (≤ 4000 chars):**

> <!-- Drop a tight 3-5 sentence summary here. Keep it short — Apple truncates
>      this aggressively on the listing. -->

**Play Console "What's new in this release" (≤ 500 chars):**

> <!-- Even tighter. 1-3 sentences max. -->

---

## Known limitations / caveats
- <!-- anything users might hit and you want to pre-empt -->

---

## Upgrade notes
- <!-- e.g. "Restores from earlier backups still work."
       Or: "This version bumps the backup format; older releases cannot read
       backups taken with 1.x." (only on MAJOR bumps) -->

---

## Privacy & data handling
- No change from previous release.
- <!-- OR: describe any change. If new data was added (always opt-in), say so
       and link to the updated Privacy Policy. -->

---

## Engineering / release-prep checklist (delete before publishing)

- [ ] `js/version.js` → MAJOR/MINOR/PATCH/BUILD_DATE bumped
- [ ] `sw.js` → `CACHE_VERSION` bumped
- [ ] `manifest.json` → `version` + `version_name` bumped
- [ ] `CHANGELOG.md` → new section added, Unreleased reset
- [ ] iOS `CFBundleShortVersionString` + `CFBundleVersion` bumped (Capacitor)
- [ ] Android `versionName` + `versionCode` bumped (Capacitor)
- [ ] Git tag pushed: `git tag v{{VERSION}} && git push --tags`
- [ ] GitHub release created with this file as the body
- [ ] App Store Connect "What's New" updated
- [ ] Play Console "What's new in this release" updated
