# Privacy Policy for Greenbar

**Effective Date:** 2026-06-06
**Last Updated:** 2026-06-06
**Publisher:** Greenbar Systems
**Address:** 5353 N 16th St, Unit 410, Phoenix, AZ 85016, USA
**Contact:** support@greenbarsystems.com

---

## 1. Introduction

Greenbar Systems ("we," "us," or "our") publishes Greenbar (the "App"), an
offline-first personal finance and budgeting application available on the
Apple App Store and Google Play. This Privacy Policy explains how the App
handles information when you use it on your mobile device.

Greenbar is built around a single privacy principle: **your financial data
never leaves your device unless you choose to export it.** We do not operate
servers that receive, store, or process your financial information. We
cannot see your transactions, your balances, your budgets, or your goals.

By installing or using the App, you acknowledge that you have read and
understood this Policy. If you do not agree with it, please do not install
or continue using the App.

---

## 2. Information We Collect

Because Greenbar runs entirely on your device, the categories of information
we, as the publisher, actually receive are very narrow. They are:

### 2.1 Information You Provide Directly to Us
- **Support correspondence.** If you email support@greenbarsystems.com for
  help, we receive the contents of your message, your email address, and
  any attachments you choose to send. We use this only to respond to you.

### 2.2 Information the App Stores Locally on Your Device
The following data is created and held **only on your device's local
storage**. We do not receive it.
- Imported transaction data from CSV or PDF bank statements you select.
- Budgets, categories, goals, and notes you create.
- Detected recurring expenses, anomaly flags, and insights computed locally
  from the above.
- Application preferences (theme, display options, onboarding state).
- A PIN hash (one-way derived; the PIN itself is never stored) and a flag
  indicating whether you have enabled biometric unlock.
- Encrypted backup archives you generate, until you delete them or share
  them yourself.

### 2.3 Information Collected by the Platforms (Apple / Google), Not by Us
When you download a paid app, the App Store or Google Play handle the
transaction. Those platforms may collect your purchase and device
information under **their** privacy policies, not ours. We receive only
aggregate, de-identified sales and crash reports through those platforms'
developer dashboards (for example, "X downloads this week" or "App crashed
on device model Y"). These reports do not identify you to us.

---

## 3. Information We Do Not Collect

For the avoidance of doubt, we do **not**:
- Require you to create an account, register, or sign in.
- Operate cloud servers that store your financial data.
- Transmit your transactions, balances, budgets, or imported documents to
  us or to any third party.
- Sell, rent, lease, or share your personal information for monetary or
  other valuable consideration with any third party.
- Use advertising networks or display third-party ads inside the App.
- Embed third-party analytics SDKs, marketing SDKs, attribution SDKs, or
  behavioral tracking SDKs.
- Build a behavioral profile of you, your spending, or your finances on our
  servers (because we have no servers that touch your financial data).
- Track you across other apps, websites, or services.
- Use cookies or similar tracking technologies inside the App.

---

## 4. How Data Is Processed

All processing happens **locally on your device**:
- **Statement import.** When you select a CSV or PDF file, the App parses
  it in-memory on your device. The file is not uploaded.
- **Categorization, budgeting, anomaly detection, recurring-charge
  detection, and insights.** These computations run entirely on your
  device.
- **Backup and restore.** When you create a backup, the App produces an
  encrypted archive on your device using AES-GCM with a 256-bit key derived
  from a passphrase you supply. You choose where to save it (for example,
  your device's Files app or a cloud drive of your choice). Restoring works
  in reverse and also runs locally.

We have no ability to access, read, or decrypt your data.

---

## 5. Local Device Storage

Greenbar uses your device's standard local storage facilities (such as the
WebView's localStorage and, where supported, encrypted local storage
provided by the operating system) to persist the information described in
Section 2.2.

You control this storage. You can:
- Clear individual records from inside the App.
- Use the App's built-in "reset" / "delete all data" function.
- Uninstall the App, which deletes its locally stored data in accordance
  with the host operating system's rules.

Backups you have exported to other locations (a cloud drive, an email, an
external SD card) are not affected by uninstalling and must be deleted by
you separately.

---

## 6. Third-Party Services

The App is designed to function without contacting third-party services for
its core features. The limited third-party interactions that exist are:
- **Apple App Store / Google Play.** Distribution, purchase, subscription
  management, and platform-level crash reporting are handled by Apple Inc.
  and Google LLC under their respective privacy policies.
- **Your device's operating system.** Biometric verification (Face ID,
  Touch ID, fingerprint, etc.) is performed by the operating system. The
  App receives only a success/failure signal; it never sees your biometric
  data.
- **Destinations you choose for backups.** If you save an encrypted backup
  to a cloud drive (e.g., iCloud Drive, Google Drive) or share it through
  another app, that destination's privacy policy applies to the file once
  it leaves the App.

We do not embed third-party advertising, analytics, marketing, attribution,
or social-media SDKs in the App.

---

## 7. Analytics and Crash Reporting

The App currently does **not** include in-app analytics or in-app crash
reporting. We rely solely on the aggregate, de-identified reports the
Apple and Google developer dashboards provide.

We may, in a future version, add **optional, opt-in, anonymous diagnostic
reporting** to help us identify bugs and improve stability. If we do:
- It will be **off by default**.
- We will request your explicit consent through an in-app prompt before
  enabling it.
- It will collect only non-identifying technical signals (for example,
  anonymized crash stack traces, app version, OS version, device model).
- It will not transmit your financial data, transactions, budgets, goals,
  or any document you import.
- You will be able to disable it at any time in the App's settings.

If and when that feature ships, this Policy will be updated and you will be
notified in-app on first launch of the updated version.

---

## 8. Apple App Store Compliance

The App is distributed through the Apple App Store and complies with
Apple's Developer Program License Agreement and App Store Review
Guidelines, including:
- **App Tracking Transparency (ATT).** The App does not track you across
  apps and websites owned by other companies as "tracking" is defined by
  Apple, and therefore does not request the ATT permission.
- **Privacy Nutrition Labels.** Our App Store privacy disclosures
  ("Data Not Collected") match the practices described in this Policy.
- **Data Minimization.** The App requests only the device permissions
  necessary to function (for example, file access when you import a
  statement, biometric access when you choose to enable biometric
  unlock).
- **Purchases.** All paid features and any subscriptions are processed
  through Apple's In-App Purchase or App Store billing system, subject to
  Apple's terms and privacy policy.

---

## 9. Google Play Compliance

The App complies with Google Play's Developer Program Policies, including
the User Data, Permissions, and Families policies, as well as Play's Data
Safety disclosure requirements:
- **Data Safety form.** Our Play Console disclosures state that the App
  does not collect or share user data, that data is processed on-device,
  and that data is encrypted in transit (where any transmission you
  initiate, such as a backup upload to your own cloud drive, leverages
  standard OS-level transport security).
- **Permissions.** The App requests only the permissions necessary for
  declared functionality.
- **Purchases.** Paid features and subscriptions are processed through
  Google Play Billing, subject to Google's terms and privacy policy.

---

## 10. Your Rights Under the GDPR (and UK GDPR)

If you are located in the European Economic Area, the United Kingdom, or
Switzerland, the General Data Protection Regulation (or the UK GDPR) gives
you certain rights regarding personal data.

Because the data the App handles stays on your device and is not received
by us, you can exercise most of these rights directly inside the App:

| Right | How to exercise it |
|---|---|
| **Access** | Open the App; all your data is visible to you. |
| **Rectification** | Edit any record directly in the App. |
| **Erasure ("right to be forgotten")** | Delete records in-app or use the App's reset function; uninstalling the App removes local data. |
| **Restriction** | Stop using affected features or delete the relevant records. |
| **Portability** | Use the App's encrypted backup/export function to obtain a copy of your data. |
| **Objection** | Stop using the App and uninstall it. |
| **Withdraw consent** | Disable any optional feature you previously enabled (e.g., biometric unlock). |

For data you have actually transmitted to us (for example, the contents of
a support email you sent to support@greenbarsystems.com), you may exercise
these rights by writing to support@greenbarsystems.com. We will respond
within one month, as required by the GDPR.

**Lawful bases.** For the limited personal data we do receive (support
correspondence), we rely on legitimate interests (Art. 6(1)(f) GDPR) in
responding to your inquiries and, where you contact us, your consent
(Art. 6(1)(a) GDPR).

**Supervisory authority.** You have the right to lodge a complaint with a
supervisory authority in the EU/EEA member state of your habitual residence
or place of the alleged infringement.

---

## 11. Your Rights Under the CCPA / CPRA (California Residents)

If you are a California resident, the California Consumer Privacy Act, as
amended by the CPRA, gives you the following rights:

- **Right to Know** what categories of personal information have been
  collected about you.
- **Right to Delete** personal information collected from you.
- **Right to Correct** inaccurate personal information.
- **Right to Opt Out of Sale or Sharing** of personal information.
- **Right to Limit Use of Sensitive Personal Information.**
- **Right to Non-Discrimination** for exercising any of the above rights.

**Sale and Sharing.** **We do not, and have not in the preceding twelve
(12) months, sold or shared your personal information** within the meaning
of the CCPA/CPRA. We do not use or disclose sensitive personal information
for purposes beyond those permitted under CCPA § 1798.121.

Because the App stores your financial data on your device only, you can
exercise the rights to know, delete, and correct directly inside the App
(see the table in Section 10). For data you sent us in support
correspondence, contact support@greenbarsystems.com.

We do not "financially incentivize" you to provide personal information.

---

## 12. Children's Privacy

The App is not directed to children under the age of 13 (or under 16 in
the EEA, or under the equivalent age in your jurisdiction), and we do not
knowingly collect personal information from children. If you are a parent
or guardian and believe a child has provided us with personal information
(for example, by sending us a support email), please contact
support@greenbarsystems.com and we will delete it.

The App is rated according to the applicable Apple and Google age-rating
systems.

---

## 13. Data Retention

- **On-device data.** Data stored on your device is retained until you
  delete it or uninstall the App. We have no role in this retention.
- **Backups you export.** Encrypted backup files you create remain wherever
  you saved them until you delete them.
- **Support correspondence.** We retain support emails for a period
  reasonably necessary to resolve your issue and to maintain records of
  customer service, typically no longer than 24 months, after which we
  delete or anonymize them, unless a longer period is required by law.

---

## 14. Security Measures

We have designed the App to minimize risk by minimizing what leaves your
device. In addition:
- **PIN protection.** You may set a numeric PIN. The PIN is never stored in
  plaintext; only a one-way derivation (PBKDF2-SHA256 with a per-install
  salt) is stored locally.
- **Biometric authentication.** Where your device supports it (Face ID,
  Touch ID, fingerprint), you may enable biometric unlock. The biometric
  match is performed by your device's operating system; the App does not
  receive or store your biometric data.
- **Encrypted backups.** Backup archives you create are encrypted using
  AES-GCM with a 256-bit key derived from a passphrase you provide. Without
  that passphrase, the archive cannot be decrypted by us or by anyone else.
- **No cloud surface.** Because we do not operate servers that receive your
  data, there is no cloud-side breach vector for your financial information.

No security measure is perfect. We encourage you to keep your device's
operating system up to date, use a strong device passcode, and protect any
passphrases you choose for backups.

---

## 15. International Users

The App can be used worldwide, subject to applicable export-control laws.
Because your data stays on your device, no cross-border transfer of your
financial data is performed by us. If you contact us from outside the
country in which Greenbar Systems is established, you understand that your
support correspondence will be received and processed there.

Where required (for example, transfers from the EEA to a third country),
we rely on appropriate safeguards under the GDPR, such as the European
Commission's Standard Contractual Clauses, as applicable.

---

## 16. Contact Information

Questions, requests, and privacy rights inquiries can be sent to:

**Greenbar Systems**
5353 N 16th St, Unit 410, Phoenix, AZ 85016, USA
Email: support@greenbarsystems.com
Website: https://www.greenbarsystems.com

For GDPR / UK GDPR matters, you may address correspondence to our
**Privacy Contact** at the same address. For CCPA / CPRA requests, please
state "California Privacy Request" in the subject line so we can route it
appropriately.

We will respond to verifiable consumer requests within the timeframes
required by applicable law (generally 45 days under CCPA/CPRA and one
month under GDPR, each extendable as the statutes permit).

---

## 17. Changes to This Policy

We may update this Policy from time to time to reflect changes in the App,
in applicable law, or in our practices. When we do:
- We will update the **Effective Date** at the top of this Policy.
- For material changes, we will display an in-app notice on first launch
  of the updated App version and, where required by law, obtain your
  consent before applying the change to data you previously provided.

Your continued use of the App after the Effective Date of an updated
Policy constitutes acceptance of that update, to the extent permitted by
law.

---

*© 2026 Greenbar Systems. All rights reserved.*
