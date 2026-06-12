# Greenbar — Brand assets

The visual source of truth for the app icon. Used by:

- **PWA manifest** (`../manifest.json`) — embeds the SVG inline
- **iOS app bundle** — generates the `AppIcon.appiconset/` PNG set
- **Android app bundle** — generates legacy mipmap + adaptive icon layers
- **Apple App Store + Google Play Store listings** — generates the
  1024 × 1024 and 512 × 512 store icons

---

## Files

| File | Purpose |
|---|---|
| `icon-source.svg` | The editable icon master. Edit here, run the generator. |
| `play-feature-source.svg` | The editable Play Store feature graphic master (1024 × 500). |
| `icons/ios/icon-*.png` | iOS launcher + App Store icons (13 sizes, 1024 has no rounded corners). |
| `icons/android/mipmap-*/ic_launcher{,_round}.png` | Legacy Android launcher per density. |
| `icons/android/ic_launcher_foreground.png` | Adaptive icon foreground at 432×432 (bars in safe zone). |
| `icons/android/ic_launcher_background.png` | Adaptive icon background at 432×432 (solid Greenbar navy). |
| `icons/play/play-listing-512.png` | Google Play store-listing icon. |
| `icons/play/play-feature-1024x500.png` | Google Play store-listing feature graphic (hero image). |
| `icons/pwa/icon-{192,512}.png` | PWA manifest fallback PNGs. |

---

## Brand palette

| Token | Hex | Where it appears in the icon |
|---|---|---|
| Greenbar navy | `#050a14` | Background plate |
| Greenbar green | `#00d68f` | Top + bottom bars |
| Greenbar slate | `#e8ecf2` | Middle bar |

These match the brand variables in `../styles/main.css`.

---

## Geometry

Three-bar company mark, 512 × 512 viewBox.

| Element | x | y | width | height | rx | fill |
|---|---|---|---|---|---|---|
| Outer plate | 0 | 0 | 512 | 512 | 80 | `#050a14` |
| Top bar | 60 | 108 | 392 | 84 | 14 | `#00d68f` |
| Middle bar | 60 | 214 | 392 | 84 | 14 | `#e8ecf2` |
| Bottom bar | 60 | 320 | 392 | 84 | 14 | `#00d68f` |

Bars are equal-height with a 22 px gap between them. The block sits centered
in the plate with 60 px side padding and 108 px top / bottom — the slight
top-heavy crop keeps the mark optically centered when an OS rounds the
plate to a circle (e.g. Pixel adaptive icon mask).

---

## Regenerate the icon set

The generator lives in the Capacitor wrapper project (where Node + sharp
are already installed):

```bash
cd ../../GreenbarApp
npm install        # one-time, includes sharp
npm run icons      # regenerate every size; idempotent
```

Outputs land back in this folder (`Greenbar/assets/icons/`).

The generator handles three things you'd otherwise do by hand:

1. **Strips `rx="80"` from the 1024 export for the Apple App Store**
   (Apple rounds the icon itself; a pre-rounded master + Apple's rounding
   produces a visible double-corner).
2. **Builds the Android adaptive icon foreground + background as two
   separate layers** at 432 × 432, with the bars scaled into the safe zone
   (264 × 264) so the OS can apply any launcher mask without clipping them.
3. **Renders each PNG at native density** so there's no resampling pass
   between SVG → final size — keeps edges crisp at every dimension.

---

## Where each output goes for release

### iOS (Xcode)

Drop `icons/ios/icon-*.png` into
`GreenbarApp/ios/App/App/Assets.xcassets/AppIcon.appiconset/`. Match each
file to the slot Xcode shows (the filename's pixel size is the same as
Xcode's "size × scale" — e.g. `icon-180.png` goes in the 60pt @3x slot).

Submit `icons/ios/icon-1024.png` separately in App Store Connect under
"App Store icon" — Apple ingests this for the store listing.

### Android (Android Studio)

Copy each `mipmap-*/ic_launcher{,_round}.png` into the matching folder
under `GreenbarApp/android/app/src/main/res/`. Drop
`ic_launcher_foreground.png` into `mipmap-anydpi-v26/` along with the
generated `ic_launcher.xml` (the adaptive-icon descriptor — Android
Studio's "Image Asset" wizard can produce the XML once, then never again).

For the Play Console store listing, upload `icons/play/play-listing-512.png`
as the 512 × 512 store icon.

### PWA

The `manifest.json` at the project root already embeds the SVG inline,
which works on every modern browser. The PNGs under `pwa/` are a fallback
for older Android Chrome installs; reference them by extending the
manifest's `icons` array if you ever need that compatibility.

---

## Play Store feature graphic

`play-feature-source.svg` is the hero image that appears at the top of the
Google Play store listing. Spec: **1024 × 500**, opaque PNG (Play rejects
transparency on the feature graphic).

The composition: wordmark + tagline + tertiary line on the left, the
three-bar mark on the right, on a navy plate with a subtle radial accent.

When you edit the SVG, the same `npm run icons` command regenerates the
PNG at `icons/play/play-feature-1024x500.png`.

**Typography note.** The wordmark and tagline are rendered as live SVG
text using a system-font stack. The final PNG inherits whatever bold sans
is available on the box that runs the generator. For a typography-perfect
brand match, open the SVG in Figma / Affinity Designer, swap in your
brand font (Inter, Geist Variable, etc.), and export to PNG manually —
the source SVG is structured to make that a 5-minute pass.

---

## Rebrand checklist

If you redesign the icon:

1. Update `icon-source.svg` (edit it in any vector tool, or hand-edit the
   `<rect>` elements — geometry is documented above).
2. From `../../GreenbarApp`, run `npm run icons`.
3. Commit the regenerated PNGs alongside the source SVG (we ship the
   PNGs into the repo rather than `.gitignore`-ing them so the native
   builds don't depend on running Node).
4. Bump the app version in `../js/version.js` — icon changes are
   user-visible and should ship in a release.
5. For Apple: re-upload `icon-1024.png` to App Store Connect (Apple
   caches the previous icon on the listing).
6. For Google Play: re-upload `play-listing-512.png` to Play Console.
