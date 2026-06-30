# Repo ↔ PRD Reconciliation — Spillway Car Wash

**Repo:** [Ribiz01/spillway-car-wash](https://github.com/Ribiz01/spillway-car-wash) · live at spillway-car-wash.vercel.app
**Compared against:** `PRD-Carwash-Management-System.md`
**Date:** 28 June 2026

---

## TL;DR

**Your repo already is Phase 1 — and slightly beyond it.** The full POS loop (lookup → services → payment → receipt) works, plus extras the PRD didn't even plan for: AI license-plate scanning, washer assignment with points, and corporate "bill later" accounts. WhatsApp receipts are already built, which confirms your Q3 decision.

So the job isn't "build Phase 1." It's **finish and harden the Phase 1 you already have**: fix a handful of real bugs, close four PRD gaps you flagged (integer money, PDF/QR receipt, void + KPIs, loyalty/customers), and update the PRD's stack section to match reality.

One important correction: **the PRD assumed Vite + React 18. The repo is actually Next.js 15 + React 19 + Genkit (Google AI).** That's a *better* foundation for this app, not a problem — but the PRD should be updated so the two documents agree.

---

## 1. What the repo already delivers (mapped to PRD Phase 1)

| PRD Phase 1 item | In repo? | Where |
|---|---|---|
| Login (email/password) + role redirect | ✅ | `src/app/login/page.tsx` (Admin→/admin, Attendant→/dashboard) |
| POS: vehicle lookup | ✅ | `components/dashboard/workflow.tsx` (Firestore query by plate) |
| POS: register new vehicle (+ photo) | ✅ | same; writes `vehicles/{plate}` |
| POS: service selection | ✅ | live `services` collection, multi-select cards |
| POS: cart / order summary + total | ✅ | sticky summary panel |
| POS: payment method selector | ✅ | Cash / Mobile Money (+ref) / Corporate Account |
| POS: complete job → write transaction | ✅ | `addDoc(transactions)` |
| Receipt view | ✅ | receipt step with services, total, status |
| **Receipt share via WhatsApp** | ✅ | `handleShareReceipt` → `wa.me` deep link (text receipt) |
| Real-time data | ✅ | `useCollection` hooks (onSnapshot) |
| Admin: services / users / washers / corporate | ✅ | `src/app/admin/*`, `components/admin/*` |
| Admin dashboard KPIs (revenue, cars, cash/MoMo, top services, washer points) | ✅ | `components/admin/admin-dashboard.tsx` (with date range) |
| Firestore security rules | ✅ | `firestore.rules` (users, vehicles, services, washers, transactions, receipts) |
| PWA / installable | ⚠️ partial | `@ducanh2912/next-pwa` configured, but manifest is broken (see §3) |
| ZMW currency display | ✅ | `formatCurrency` (Intl `en-ZM`) |

**Extras beyond the PRD (keep these):** AI plate scan (`src/ai/flows/scan-plate-flow.ts`, Gemini via Genkit), vehicle photo capture, washer assignment + point-splitting, corporate "bill later" accounts.

---

## 2. Stack reality vs PRD

| | PRD assumed | Repo actually uses |
|---|---|---|
| Framework | Vite + React 18 | **Next.js 15 (App Router) + React 19** |
| UI | Tailwind (hand-rolled) | Tailwind + **shadcn/ui** (full component set) |
| AI | none | **Genkit + @genkit-ai/google-genai** (Gemini) |
| Backend | Firebase | Firebase 11 (same) |
| Hosting | Firebase Hosting | Firebase **App Hosting** (`apphosting.yaml`) + Vercel |
| PWA | vite-plugin-pwa | @ducanh2912/next-pwa |

**Recommendation:** keep the repo's stack — Next.js + shadcn/ui + Genkit is a stronger base than the PRD's original plan. Update the PRD's "tech stack" section to match, and treat the PRD as the *roadmap*, the repo as the *implementation of record*.

---

## 3. Bugs & risks found in the code (fix these first — they're cheap)

| # | Issue | Evidence | Impact |
|---|---|---|---|
| B1 | **PWA manifest is wrong app + broken icons** | `public/manifest.json` says "SmartWash Automation" (should be **"Tee-DOT Car Care Express"** / short name "Tee-DOT"); references `icon-192x192.png` / `icon-512x512.png` but `public/icons/` only has `icon.png` | Install banner shows wrong name; icons 404 → fails PWA install criteria |
| B2 | **Build errors are silenced** | `next.config.ts`: `typescript.ignoreBuildErrors:true`, `eslint.ignoreDuringBuilds:true` | Real type/lint bugs ship to production unnoticed |
| B3 | **Money stored as floats** | `Service.price: number`, `totalAmount`, `Intl` currency | Rounding drift over many transactions; **PRD explicitly wants integer ngwe** |
| B4 | **Timestamps are client ISO strings, not `serverTimestamp()`** | `timestamp: new Date().toISOString()` | Clock-dependent ordering; unreliable offline; PRD specifies `serverTimestamp()` |
| B5 | **Firebase config committed in source** | `src/firebase/config.ts` has live keys; `env.txt`/`gitignore.txt`/`firebaserc.txt` renamed to `.txt` | Web API keys aren't strictly secret, but real `.env`/`.gitignore` aren't wired up; pair with missing App Check (B6) |
| B6 | **No App Check** | not configured | Firestore is callable from outside the app (PRD Phase 4 item; matters once live) |
| B7 | **Receipts collection unused** | rules define `receipts/{id}` but `workflow.tsx` never writes one; no `receipt_url` | No durable receipt record / no reprint source of truth |

---

## 4. Gap analysis — the four areas you prioritized

### G1 — Money as integer ngwe *(correctness)*
Repo uses floats throughout. **Fix:** store all money as integers in ngwe (100 ngwe = 1 ZMW); change `Service.price`, `Transaction.totalAmount`, `Payment.amount` to ngwe; update `formatCurrency` to divide by 100 for display and a parallel `parseToNgwe` for inputs. One-time migration of existing `services`/`transactions` docs. **Effort: M.**

### G2 — PDF + QR receipt *(currently WhatsApp text only)*
Repo shares a text receipt via `wa.me`. **Add:** render the existing receipt card to an 80mm PDF (`jspdf` + `html2canvas`, or `@thermal-print`), embed a QR (`qrcode`), upload to Storage at `receipts/{YYYY}/{MM}/{receiptNo}.pdf`, write a `receipts` doc + `transaction.receipt_url`, then attach/share that. Keep WhatsApp text as the fast path. **Effort: M.**

### G3 — Void flow + attendant KPIs
- **Void:** add a `voided` status + manager-confirm dialog in the receipt/transactions view (rules already allow creator/admin update). Show void on the receipt. **Effort: S.**
- **KPIs:** the *admin* dashboard already has revenue/cars/cash/MoMo/top-services/washer-points. The *attendant* `/dashboard` is just the POS. Decide whether attendants get a lightweight "today" strip. **Effort: S** (reuse admin logic).

### G4 — Loyalty + customers *(PRD Phase 2)*
Today, customer = `ownerName`+`phoneNumber` embedded on the vehicle; no loyalty. **Add:** a `customers` collection, link vehicles → customer, accrue points per completed transaction, tiers + redemption. Larger, genuinely Phase 2. **Effort: L.** Recommend doing G1–G3 first, then this.

---

## 5. "Finish Phase 1" — prioritized task list

**Tier 0 — quick wins / correctness (do this week)**
1. B1: fix `manifest.json` (name "Spillway", correct icon files at the referenced sizes).
2. B2: turn off `ignoreBuildErrors`/`ignoreDuringBuilds`, fix what surfaces.
3. B4: switch transaction `timestamp` to `serverTimestamp()`.
4. B5: add real `.env`/`.gitignore`/`.firebaserc`; move config to env vars.
5. Confirm Firestore **offline persistence** is enabled (PRD requires queued offline writes).

**Tier 1 — close the priority gaps**
6. G1: migrate money to integer ngwe.
7. G3: void flow (manager confirm) + show void on receipt.
8. G2: PDF + QR receipt → Storage + `receipts` doc + `receipt_url`.

**Tier 2 — round out**
9. G3: attendant "today" KPI strip (reuse admin calcs).
10. Reports export: PDF (`jspdf`) + Excel (`xlsx`) from the admin dashboard.

**Tier 3 — Phase 2**
11. G4: customers collection + loyalty points/tiers/redemption.
12. MoneyUnify live mobile-money charge + webhook confirm (your Q4 choice).
13. App Check (B6) before public launch.

---

## 6. Updated, repo-grounded roadmap

```
NOW   Repo = working Phase 1 POS (single branch, record-only pay, WhatsApp receipts) ✅
P1✓   Harden: Tier 0 fixes + integer ngwe + void + PDF/QR receipt
P2    Customers + loyalty; MoneyUnify mobile money; SMS (Africa's Talking); reports export
P3    Multi-branch (locations), per-branch dashboards, deeper RBAC
P4    App Check, error logging, bulk promos, performance + PWA polish
```

The repo confirmed three of your four locked decisions (single branch, record-only payment, WhatsApp). The fourth (MoneyUnify) stays a Phase 2 item — start its account/registration now so it's unblocked.

---

## 7. Recommended next 5 actions

1. Fix the PWA manifest + icons (B1) — smallest change, restores installability.
2. Re-enable TypeScript/ESLint build checks (B2) and clear the errors.
3. Decide: do the **integer-ngwe migration (G1) now**, while transaction volume is low and migration is cheap.
4. Add the **void flow (G3)** — small, high-trust feature for the owner.
5. Build the **PDF/QR receipt (G2)** on top of the existing receipt card.

Say the word and I'll clone the repo into your working folder and start implementing from Tier 0 down — or update the PRD's stack section first so both docs line up.
