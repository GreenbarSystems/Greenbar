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
| `icon-source.svg` | The editable master. Edit here, run the generator. |
| `icons/ios/icon-*.png` | iOS launcher + App Store icons (13 sizes, 1024 has no rounded corners). |
| `icons/android/mipmap-*/ic_launcher{,_round}.png` | Legacy Android launcher per density. |
| `icons/android/ic_launcher_foreground.png` | Adaptive icon foreground at 432×432 (bars in safe zone). |
| `icons/android/ic_launcher_background.png` | Adaptive icon background at 432×432 (solid Greenbar navy). |
| `icons/play/play-listing-512.png` | Google Play store-listing icon. |
| `icons/pwa/icon-{192,512}.png` | PWA manifest fallback PNGs. |

---

## Brand palette

| Token | Hex | Where it appears in the icon |
|---|---|---|
| Greenbar navy | `#050a14` | Background plate |
| Greenbar green | `#00d68f` | Primary bars (#1, #2, #3, #6) |
| Greenbar mint | `#00c9b1` | Secondary bars (#4, #5) |

These match the brand variables in `../styles/main.css`.

---

## Geometry

512 × 512 viewBox.

| Bar | x | y | height | fill | opacity |
|---|---|---|---|---|---|
| Outer plate | 0 | 0 | 512 | `#050a14` | 1.0 (rx = 80) |
| Bar 1 | 48 | 300 | 140 | `#00d68f` | 0.9 |
| Bar 2 | 122 | 228 | 212 | `#00d68f` | 1.0 |
| Bar 3 | 196 | 155 | 285 | `#00d68f` | 1.0 |
| Bar 4 | 270 | 195 | 245 | `#00c9b1` | 0.85 |
| Bar 5 | 344 | 245 | 195 | `#00c9b1` | 0.8 |
| Bar 6 | 418 | 120 | 320 | `#00d68f` | 1.0 |

Each bar is 58 wide on a 74-stride; corner radius `rx = 12` so they read
crisply at thumbnail sizes.

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
