# Graydot Carwash & Auto Detailing

A mobile-friendly car-wash point-of-sale and operations app built with Next.js, TypeScript, Firebase, and Genkit.

## What it includes

- Attendant workflow for vehicle lookup, service selection, washer assignment, wash tracking, payment recording, and receipts.
- Admin tools for services, users, washers, locations, corporate accounts, expenses, customers, and reports.
- ZMW prices stored as integer ngwe.
- Optional WhatsApp receipt delivery and AI-assisted license-plate scanning.
- Installable PWA with Graydot-branded app icons.

## Getting started

Requirements: Node.js 18 or newer and a Firebase project configured for Authentication and Cloud Firestore.

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env.local` and provide the Firebase web configuration values. Add `GEMINI_API_KEY` to enable plate scanning.
3. Start the development server:

   ```sh
   npm run dev
   ```

   Open [http://localhost:9002](http://localhost:9002).

## Optional integrations

WhatsApp receipt delivery requires the server-only `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN`. Configure an approved WhatsApp receipt template with `WHATSAPP_RECEIPT_TEMPLATE` to deliver receipts outside an active customer-service window. Optional settings include `WHATSAPP_API_VERSION`, `WHATSAPP_TEMPLATE_LANGUAGE`, and `SUGGESTIONS_PHONE`.

Set `NEXT_PUBLIC_SUPPORT_PHONE` to show the customer-facing suggestions and complaints number. See `.env.example` for the Firebase and AI variables.

## Firebase configuration

Deploy `firestore.rules` to the Firebase project before using the app. Corporate-company records (`corporate_companies`) and expense records are restricted to administrators; signed-in attendants can read active company records to bill washes. The app expects signed-in users to have a corresponding `users/{uid}` profile with a `role` of `Admin` or `Attendant`.

## Validation and production

```sh
npm run typecheck
npm run build
npm start
```

The PWA manifest is `public/manifest.json`; its PNG icons are generated from `public/icons/graydot-icon.svg`.
