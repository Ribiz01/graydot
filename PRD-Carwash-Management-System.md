# PRD — Graydot Carwash & Auto Detailing (Zambia)

**Product:** Graydot Carwash & Auto Detailing — multi-branch car care management PWA
**Platform:** Next.js 15 (App Router) + React 19 + TypeScript · Tailwind CSS + shadcn/ui · Firebase · Genkit (Gemini) · Mobile-first PWA
**Market:** Zambia (currency ZMW / ngwe, Zambian plates, local mobile money & SMS)
**Reference implementation:** [Ribiz01/spillway-car-wash](https://github.com/Ribiz01/spillway-car-wash)
**Status:** Draft for review
**Date:** 28 June 2026

---

## 1. Summary

This document turns the full build spec into a **phased product plan backed by research** into what already exists (open-source projects, libraries, APIs, MCP connectors) so we build only what we must and buy/borrow the rest.

The guiding principle you set: **don't ship the whole spec at once.** Ship a focused first version that nails the daily money-making loop — take a car in, ring up services, take payment, hand over a receipt — then layer on branches, loyalty, reporting and integrations once that core is proven and in real daily use.

**Phase 1 = the "huge win": a single-branch POS + receipt flow that a washer or cashier can run on their phone, end to end.** Everything else in the original spec is sequenced into later phases.

---

## 2. Problem & goals

Carwash operators in Zambia largely run on paper, cash, and memory. Revenue leaks (unrecorded washes, no void trail), no view of daily takings, and no customer record for repeat business.

**Primary goals**

- Record every job and payment reliably, even on a flaky mobile connection.
- Produce a professional receipt the customer can keep or be sent.
- Give the owner a same-day view of revenue and volume.

**Secondary goals (later phases)**

- Multiple branches under one account.
- Customer profiles, vehicles, and loyalty.
- Staff accounts, roles, shifts, and performance.
- Reporting exports and SMS/mobile-money integrations.

**Success metrics for Phase 1**

- A complete sale (lookup → services → pay → receipt) in **under 60 seconds**.
- **100%** of jobs recorded (no paper fallback needed during a normal day).
- Works fully **offline** and syncs when back online.
- Lighthouse mobile: Performance > 90, PWA installable.

---

## 3. Target users

| User | Phase | Needs |
|---|---|---|
| **Cashier / washer** | 1 | Fast POS on a cheap Android phone; works offline; simple receipt |
| **Owner / manager** | 1 | Today's revenue and car count; void control |
| **Multi-branch owner** | 2+ | Per-branch view, staff accountability, reports |
| **Customer** | 2+ | Receipt by SMS, loyalty points |

---

## 4. Research findings — build vs. borrow vs. buy

This is the core of what you asked for: what's already out there for each capability, and the recommendation for our stack (React/TS/Firebase).

### 4.1 Existing carwash / POS projects (reference, not drop-in)

| Project | Stack | Use to us |
|---|---|---|
| [evoPython/carwash-pos](https://github.com/evoPython/carwash-pos) | Python | Domain/feature reference: roles, orders, reports |
| [w3gen/carwash-jo.com](https://github.com/w3gen/carwash-jo.com) | PHP/MySQL, Chart.js | Schema & workflow reference |
| [mk346/Car-Wash-POS](https://github.com/mk346/Car-Wash-POS) | PHP/MySQL | Customer/employee/report feature list |
| [anand-144/Car-Wash-Management-System](https://github.com/anand-144/Car-Wash-Management-System) | PHP/MySQL | Feature reference |
| [andrepurnomo/react-firebase-pos](https://github.com/andrepurnomo/react-firebase-pos) | **React + Firebase** | **Closest tech match** — study cart/checkout & Firestore patterns |
| [ifauzeee/Point-of-Sale](https://github.com/ifauzeee/Point-of-Sale) | React/Node/MySQL | Modern POS UX patterns, inventory, P&L |

**Finding:** there is **no drop-in React + Firebase carwash system** to fork. The carwash-specific projects are PHP/Python; the React/Firebase POS projects are generic retail. **Recommendation:** build our own, but lift the data model and feature checklist from the carwash PHP projects and the cart/checkout/Firestore patterns from `react-firebase-pos`. This validates the spec's decision to build, while saving us design time.

### 4.2 Libraries (npm) — adopt these, don't hand-roll

| Need | Recommended | Notes |
|---|---|---|
| Receipts (PDF) | **jsPDF + html2canvas**, or **[@thermal-print/pdf](https://www.npmjs.com/package/@thermal-print/pdf) + [@thermal-print/react](https://www.npmjs.com/package/@thermal-print/react)** | The thermal-print packages natively support **80mm/58mm** receipt sizes — less custom layout code than raw jsPDF. Recommend trialing them first. |
| QR on receipt | **qrcode** | Data-URL → embed in PDF (as spec) |
| Charts | **Recharts** | As spec; defer to Phase 2/3 |
| Excel export | **SheetJS (xlsx)** | Phase 3 reports |
| PWA / offline | **@ducanh2912/next-pwa** (used in repo) — or vite-plugin-pwa for a Vite stack | Workbox under the hood; pair with Firestore's built-in offline persistence |
| Image compression | **browser-image-compression** | Compress logos < 200KB before Storage upload |
| Date range picker | **react-day-picker** | Phase 3 reports |
| Barcode/plate scan | **html5-qrcode** (works) *or* **@zxing/browser** | ⚠️ `html5-qrcode` and its zxing-js core are **currently unmaintained**. **Defer scanning from Phase 1** — plate is a typed search. Revisit with `@zxing/browser` or a commercial SDK (Scanbot) if camera scan becomes a priority. |

### 4.3 Payments (Zambia mobile money) — defer the live integration

| Option | Coverage | Notes |
|---|---|---|
| **[Flutterwave](https://developer.flutterwave.com/v3.0/docs/zambia-mobile-money)** | Airtel, MTN, Zamtel | **Licensed in Zambia**; single REST API + webhooks; collects in ZMW. Cleanest single integration. |
| **[MoneyUnify](https://github.com/blessedjasonmwanza/MoneyUnify)** | MTN, Airtel, Zamtel | Zambia-focused aggregator with an **npm client**; simple USSD-style collections |
| **MTN MoMo API** + **Airtel Money API** | Per-network | Direct, but two separate integrations, more onboarding |
| Lenco / Broadpay | ZMW | Local alternatives worth a quote |

**Recommendation:** **Phase 1 records the payment method as a simple selector (Cash / Mobile Money / Card) with no live gateway** — the cashier confirms payment was received. This keeps v1 shippable and avoids gateway onboarding (KYC, settlement accounts) blocking launch. **Phase 2** adds a live "request payment" flow via **Flutterwave** (best single-API coverage) or **MoneyUnify**.

### 4.4 SMS — defer from Phase 1

| Option | Notes |
|---|---|
| **Africa's Talking** (spec) | Africa-focused, covers Zambia, lower cost than global providers; good fit for receipt/promo SMS |
| **Twilio** | Global, reliable, but ~$0.30–0.43/msg to Zambia — expensive at volume; a Twilio developer plugin is available in this workspace for build help |
| **Local operator/aggregator** | Cheapest (~ZMW 0.11/msg) for domestic-only, more setup |

**Recommendation:** receipts in Phase 1 use the **Web Share API** (share the receipt image/PDF via WhatsApp, the dominant channel locally) — **zero integration cost.** Add **Africa's Talking** SMS in Phase 2.

### 4.5 MCP connectors (developer/back-office tooling)

The MCP registry has payment connectors (Stripe, PayPal, Razorpay, Paytm, Airwallex) but **none cover Zambian mobile money**, so they aren't used inside the customer app. They (and the available **Twilio** plugin) are useful as **back-office/developer assistants**, not embedded app features. **No MCP dependency for Phase 1.**

### 4.6 Backend

Firebase (Auth, Firestore, Storage, Hosting, Cloud Functions) as specified is the right call: offline persistence, real-time listeners, and managed hosting remove a lot of v1 work. Keep it.

---

## 5. Phasing roadmap

```
Phase 1  THE HUGE WIN — Single-branch POS + Receipts        (ship first)
Phase 2  Customers, Loyalty, SMS receipts, 1 payment gateway
Phase 3  Multi-branch, Locations, Employees, Roles, Reports/Exports
Phase 4  Polish & scale — App Check, Crashlytics-style logging, bulk SMS promos, advanced loyalty
```

Each phase is independently shippable and useful on its own.

---

## 6. Phase 1 — detailed scope (the huge win)

**Theme:** one branch, the money loop, offline-first, on a phone.

### In scope

1. **Auth (lean)**
   - Email/password login (Firebase Auth).
   - PIN quick-login numpad (SHA-256 → match against `employees.pin_hash`).
   - One or two roles only: `admin` and `cashier`. (Full RBAC is Phase 3.)

2. **POS flow** (the heart of v1)
   - **Vehicle lookup:** typed plate search (debounced live Firestore query), auto-uppercased. "Register new vehicle" bottom sheet (plate, make, model, colour). **Walk-in toggle** to skip lookup. *(Camera/barcode scan deferred.)*
   - **Service selection:** category tabs (Basic/Standard/Premium/Detailing), grid of service cards with price and "+".
   - **Cart:** quantity steppers, remove, discount (ZMW or %), bold TOTAL.
   - **Payment selector:** Cash / Mobile Money / Card (record only — no live gateway).
   - **Complete job:** writes `transactions` doc, generates receipt, shows receipt modal.

3. **Receipts**
   - Styled 80mm HTML receipt → image/PDF (jsPDF + html2canvas, or @thermal-print).
   - QR code embedded (qrcode).
   - **Share via Web Share API** (WhatsApp etc.); print via opening PDF in new tab.
   - Upload PDF to Storage; save `receipt_url` on the transaction.
   - **Void** with admin PIN → status `voided`.

4. **Minimal dashboard**
   - KPIs: Today Revenue, Transactions Today, Cars Washed.
   - Live feed: last 10 transactions (real-time `onSnapshot`), tap → receipt.

5. **PWA + offline**
   - Installable (next-pwa), Add-to-Home-Screen banner (+ iOS instructions).
   - Firestore offline persistence on; **writes queue offline and sync on reconnect.**

6. **Money handling**
   - All amounts stored as **integers in ngwe** (100 ngwe = 1 ZMW); format on display.

### Explicitly NOT in Phase 1 (deferred)

Multi-branch / locations management · employees beyond basic login · full role-based access · loyalty points/tiers · customer profile pages & history · reports tabs & PDF/Excel exports · SMS sending · live mobile-money/card gateways · barcode/camera scanning · bulk price tools · "copy from branch" · App Check · error-logging collection.

### Phase 1 data model (subset)

Only four collections needed for v1:

- `services` — name, category, price_ngwe, duration, active
- `vehicles` — plate (uppercase), make, model, colour, (optional customer_id)
- `transactions` — items[], subtotal_ngwe, discount_ngwe, total_ngwe, payment_method, status, receipt_url, created_at (`serverTimestamp()`), cashier_uid, plate/walk-in
- `employees` — uid, name, role (`admin`|`cashier`), pin_hash

`locations`, `customers` (full), loyalty fields, and shift records come in later phases. Design `transactions` with an optional `location_id` from day one so multi-branch (Phase 3) doesn't require a migration.

### Phase 1 acceptance criteria

- [ ] Cashier logs in by PIN in < 3 taps.
- [ ] Full sale completed and receipt shared in < 60s.
- [ ] App works in airplane mode; queued sale syncs on reconnect.
- [ ] Void requires admin PIN and is reflected on the receipt and dashboard.
- [ ] Installable PWA; Lighthouse Performance > 90, PWA installable.
- [ ] All money correct to the ngwe (no float errors).

---

## 7. Later phases (summary)

**Phase 2 — Customers, Loyalty, comms**
Full customer profiles + detail page + history; vehicles linked to customers; loyalty points, tiers, redemption; receipts by **SMS (Africa's Talking)** as a complement to WhatsApp share; **live mobile-money via [MoneyUnify](https://github.com/blessedjasonmwanza/MoneyUnify)** (MTN/Airtel/Zamtel, npm client) with webhook confirmation.

**Phase 3 — Multi-branch & back office**
Locations management (logo upload, manager, per-branch revenue); employees (Cloud Function to create Auth users), PINs, shifts, clock in/out; full **role-based access** (client + Firestore rules); Reports (revenue/transactions/top services/staff/loyalty) with **PDF (jsPDF)** and **Excel (SheetJS)** exports; date-range picker.

**Phase 4 — Scale & hardening**
Firebase **App Check (reCAPTCHA v3)**; error logging (`window.onerror`/`onunhandledrejection` → Firestore); bulk SMS promos by tier; advanced loyalty perks; performance passes (code-split, memoization, pagination everywhere); custom domain.

---

## 8. Tech stack (as built in the reference repo)

This section now reflects the **actual stack of the [spillway-car-wash](https://github.com/Ribiz01/spillway-car-wash) repo**, which is the implementation of record for Graydot Carwash & Auto Detailing:

**Core:** Next.js 15 (App Router) + React 19 + TypeScript · Tailwind CSS + **shadcn/ui** (Radix primitives) · **Firebase 11** (Auth, Firestore, Storage, App Hosting; Cloud Functions when needed) · **Genkit + @genkit-ai/google-genai** (Gemini — powers AI license-plate scanning).

**Supporting libraries:** framer-motion (transitions) · react-hook-form + zod (forms/validation) · recharts (charts) · react-day-picker + date-fns (dates) · lucide-react (icons) · **@ducanh2912/next-pwa** (PWA/offline).

**To add as phases require:** jsPDF + html2canvas (or @thermal-print) + qrcode for PDF/QR receipts (Phase 1 finish) · SheetJS `xlsx` for Excel export (Phase 2 reports) · browser-image-compression for logo/photo uploads.

> **Note:** the original PRD draft assumed Vite + React 18 + vite-plugin-pwa. The repo instead uses Next.js + React 19 + next-pwa, which is a stronger foundation for this app. The stack above supersedes that earlier assumption; the two documents now agree.

---

## 9. Risks & open questions

| Risk / question | Note |
|---|---|
| Mobile-money gateway onboarding | KYC/settlement can take time — start Flutterwave/MoneyUnify paperwork during Phase 1 so Phase 2 isn't blocked. |
| `html5-qrcode` unmaintained | Keep scanning out of v1; evaluate `@zxing/browser` later. |
| Thermal printer support | Phase 1 ships PDF/share + browser print; native ESC/POS Bluetooth printing is a later, separate investigation. |
| Receipts over WhatsApp vs SMS | Confirm which channel customers actually prefer before investing in SMS. |
| Single vs. two roles in v1 | Confirm: is `cashier` + `admin` enough for first launch? |

**Decisions locked (28 June 2026)**

1. **One branch at launch.** Build single-branch, but keep an optional `location_id` on `transactions` from day one so Phase 3 multi-branch needs no migration.
2. **Record-only payment in v1.** Cashier confirms Cash / Mobile Money / Card; no live gateway.
3. **WhatsApp (Web Share API) for receipts in v1.** SMS (Africa's Talking) added in Phase 2 as a complement.
4. **MoneyUnify** is the chosen mobile-money path for Phase 2 (MTN/Airtel/Zamtel via its npm client). Start any required account/registration during Phase 1 so Phase 2 isn't blocked.

---

## 10. Sources

- Carwash/POS references: [evoPython/carwash-pos](https://github.com/evoPython/carwash-pos), [w3gen/carwash-jo.com](https://github.com/w3gen/carwash-jo.com), [mk346/Car-Wash-POS](https://github.com/mk346/Car-Wash-POS), [anand-144](https://github.com/anand-144/Car-Wash-Management-System), [andrepurnomo/react-firebase-pos](https://github.com/andrepurnomo/react-firebase-pos), [ifauzeee/Point-of-Sale](https://github.com/ifauzeee/Point-of-Sale)
- Libraries: [@thermal-print/pdf](https://www.npmjs.com/package/@thermal-print/pdf), [jsPDF](https://www.npmjs.com/package/jspdf), [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa), [html5-qrcode](https://github.com/mebjas/html5-qrcode)
- Payments: [Flutterwave Zambia Mobile Money](https://developer.flutterwave.com/v3.0/docs/zambia-mobile-money), [MoneyUnify](https://github.com/blessedjasonmwanza/MoneyUnify), [MTN MoMo Developer](https://momodeveloper.mtn.com/), [Airtel Money API](https://developers.airtel.africa/)
- SMS: [Africa's Talking pricing](https://africastalking.com/pricing), [Twilio Zambia SMS pricing](https://www.twilio.com/en-us/sms/pricing/zm)
