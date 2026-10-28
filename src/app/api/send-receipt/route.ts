import { NextRequest, NextResponse } from "next/server";
import { firebaseConfig } from "@/firebase/config";

export const dynamic = "force-dynamic";

type FirestoreFields = Record<string, {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  mapValue?: { fields?: FirestoreFields };
  arrayValue?: { values?: { mapValue?: { fields?: FirestoreFields } }[] };
}>;

function stringField(fields: FirestoreFields, key: string) {
  return fields[key]?.stringValue || "";
}

function numberField(fields: FirestoreFields, key: string) {
  return Number(fields[key]?.integerValue ?? fields[key]?.doubleValue ?? 0);
}

function money(amount: number) {
  return `ZMW ${(amount / 100).toFixed(2)}`;
}

export async function POST(request: NextRequest) {
  try {
    const idToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const { transactionId } = await request.json();
    if (!idToken || typeof transactionId !== "string" || !transactionId.trim()) {
      return NextResponse.json({ error: "Authentication and transactionId are required." }, { status: 400 });
    }

    const accountResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const account = await accountResponse.json();
    const uid = account.users?.[0]?.localId;
    if (!accountResponse.ok || !uid) return NextResponse.json({ error: "Your session is invalid. Sign in again." }, { status: 401 });

    const projectId = firebaseConfig.projectId;
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    const transactionResponse = await fetch(`${firestoreUrl}/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!transactionResponse.ok) return NextResponse.json({ error: "Transaction was not found or is not accessible." }, { status: 404 });
    const transaction = await transactionResponse.json();
    const fields = transaction.fields as FirestoreFields;
    if (stringField(fields, "userId") !== uid) {
      const profileResponse = await fetch(`${firestoreUrl}/users/${encodeURIComponent(uid)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const profile = profileResponse.ok ? await profileResponse.json() : null;
      if (profile?.fields?.role?.stringValue !== "Admin") {
        return NextResponse.json({ error: "You cannot send a receipt for this transaction." }, { status: 403 });
      }
    }

    const savedPhone = stringField(fields, "customerPhone").replace(/\D/g, "");
    const phoneNumber = savedPhone.startsWith("0")
      ? `260${savedPhone.slice(1)}`
      : savedPhone.length === 9
        ? `260${savedPhone}`
        : savedPhone;
    if (phoneNumber.length < 9) return NextResponse.json({ error: "The customer has no valid saved phone number." }, { status: 400 });
    if (fields.whatsappReceiptConsent?.booleanValue !== true) {
      return NextResponse.json({ error: "Customer WhatsApp receipt consent was not recorded." }, { status: 400 });
    }
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) {
      return NextResponse.json({ error: "WhatsApp delivery is not configured on the server." }, { status: 503 });
    }

    const serviceValues = fields.services?.arrayValue?.values || [];
    const services = serviceValues.map(value => {
      const serviceFields = value.mapValue?.fields || {};
      return `- ${stringField(serviceFields, "name")}: ${money(numberField(serviceFields, "price"))}`;
    });
    const supportPhone = process.env.SUGGESTIONS_PHONE || process.env.NEXT_PUBLIC_SUPPORT_PHONE || "Not configured";
    const vehicle = `${stringField(fields, "vehicleMake")} ${stringField(fields, "vehicleModel")} (${stringField(fields, "licensePlate")})`.trim();
    const receiptValues = [
      transactionId,
      stringField(fields, "timestamp"),
      vehicle,
      services.join("\n"),
      money(numberField(fields, "totalAmount")),
      money(numberField(fields, "amountPaid")),
      money(numberField(fields, "outstandingBalance")),
      fields.payment?.mapValue?.fields?.method?.stringValue || "—",
      supportPhone,
    ];
    const apiVersion = process.env.WHATSAPP_API_VERSION || "v22.0";
    const templateName = process.env.WHATSAPP_RECEIPT_TEMPLATE;
    const messagePayload = templateName
      ? {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phoneNumber,
          type: "template",
          template: {
            name: templateName,
            language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US" },
            components: [{
              type: "body",
              parameters: receiptValues.map(text => ({ type: "text", text })),
            }],
          },
        }
      : {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phoneNumber,
          type: "text",
          text: {
            body: [
              "Graydot Carwash & Auto Detailing",
              "OFFICIAL RECEIPT",
              `Receipt ID: ${receiptValues[0]}`,
              `Date: ${receiptValues[1]}`,
              `Vehicle: ${receiptValues[2]}`,
              "Services:",
              ...services,
              `Total: ${receiptValues[4]}`,
              `Paid: ${receiptValues[5]}`,
              `Outstanding: ${receiptValues[6]}`,
              `Payment: ${receiptValues[7]}`,
              `Suggestions and complaints: ${receiptValues[8]}`,
            ].join("\n"),
          },
        };
    const sendResponse = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(messagePayload),
    });
    const result = await sendResponse.json();
    if (!sendResponse.ok) {
      const error = result.error?.message || "WhatsApp rejected the receipt message.";
      return NextResponse.json({ error }, { status: 502 });
    }
    return NextResponse.json({ success: true, messageId: result.messages?.[0]?.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Receipt delivery failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}