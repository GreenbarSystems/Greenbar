# Greenbar — App Store / Play Store listing copy

Greenbar supports **four English-speaking markets**: 🇺🇸 United States, 🇬🇧 United
Kingdom, 🇦🇺 Australia and 🇨🇦 Canada. It picks your currency (USD / GBP / AUD / CAD)
and date format automatically from your device, and you can change the region in
Settings. Bank export guides are included for major banks in each country.

State the supported markets on the listing so prospective users know it covers
their country (and so users elsewhere set correct expectations). This file is the
source of truth for listing copy — paste it into App Store Connect / Google Play
Console and keep it updated here in git.

---

## Supported-markets statement (near the TOP of each description)

> 🇺🇸🇬🇧🇦🇺🇨🇦 **Built for the US, UK, Australia and Canada.** Greenbar formats your
> money in your local currency (USD, GBP, AUD or CAD) and reads your bank's date
> format. It auto-detects your country and you can change it in Settings. Other
> countries aren't officially supported yet — try the built-in sample data first.

---

## Apple App Store

**App name** (≤30): `Greenbar`

**Subtitle** (≤30): `On-device budget tracker`

**Promotional text** (≤170):
`For US, UK, Australia & Canada. Import a CSV or PDF bank statement and see your spending — 100% on your device. No account, no cloud, no sign-up.`

**Description** (≤4000):
```
🇺🇸🇬🇧🇦🇺🇨🇦 Built for the US, UK, Australia and Canada. Greenbar formats amounts in
your local currency (USD, GBP, AUD or CAD) and reads your bank's date format —
auto-detected, and changeable in Settings.

Greenbar turns your bank statements into a clear picture of where your money goes
— and it never leaves your phone.

PRIVATE BY DESIGN
• 100% on-device. No account, no sign-up, no servers, no cloud.
• Works fully offline.
• Optional PIN / biometric lock and a privacy mode that blurs amounts.

IMPORT IN SECONDS
• Import transactions from a CSV or PDF bank statement.
• Built-in export guides for major banks in the US, UK, Australia and Canada.
• Greenbar auto-detects columns and categorizes transactions for you.
• A preview shows exactly what was understood before anything is saved.
• Re-import each month — new data merges automatically; duplicates are skipped.

UNDERSTAND YOUR MONEY
• Monthly dashboard: net, income vs. expenses, top categories, savings rate.
• A financial health score and achievement streaks.
• Recurring-charge detection (subscriptions, rent, bills) and a cash-flow forecast.
• Month-over-month variance and plain-English insights — all computed on-device.
• Budgets, savings goals, and per-transaction recategorization with saved rules.

Greenbar supports US, UK, Australian and Canadian accounts. Other countries
aren't officially supported yet.
```

**Keywords** (≤100, comma-separated, no spaces):
`budget,bank,statement,CSV,PDF,spending,expenses,private,offline,finance,tracker,UK,USD,GBP`

**App Store Connect settings:**
- **Primary Language:** English (U.S.); add localized listings for en-GB / en-AU
  / en-CA if you want region-specific wording.
- **Availability:** United States, United Kingdom, Australia, Canada (and other
  English markets if desired).
- **Screenshots:** first caption — “For US, UK, Australia & Canada — your currency, your bank.”

---

## Google Play

**Short description** (≤80):
`Private, on-device budgeting for US, UK, AU & CA bank statements (CSV/PDF).`

**Full description** (≤4000): same body as the App Store description above (lead
with the four-flag statement).

**Play Console settings:**
- **Default language:** English (United States); optionally add en-GB/en-AU/en-CA.
- **Countries/regions:** United States, United Kingdom, Australia, Canada.

---

## Notes / rationale

Greenbar is single-currency-per-profile: `CFG.region` (US/GB/AU/CA) drives currency
formatting (Intl) and the default date order, auto-detected from `navigator.language`
and changeable in Settings → Column Mapping. UK/AU/CA share the US number convention
(`.` decimal, `,` thousands), so only the currency symbol and date order differ.
Adding another market is a data change in `REGIONS` (state.js) plus a bank-guide
entry — keep this listing in sync when markets change.
