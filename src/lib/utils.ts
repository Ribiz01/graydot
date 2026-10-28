import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Transaction } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** All money values in Firestore are stored as integer ngwe (100 ngwe = 1 ZMW). */
export function formatCurrency(ngwe: number) {
  return new Intl.NumberFormat('en-ZM', {
    style: 'currency',
    currency: 'ZMW',
  }).format(ngwe / 100);
}

/** Converts a ZMW decimal entered by a user into integer ngwe for Firestore storage. */
export function parseToNgwe(zmw: number): number {
  return Math.round(zmw * 100);
}

export function localDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

type TransactionAccountingFields = Pick<Transaction, "totalAmount" | "amountPaid" | "payment" | "status">

/** Returns actual receipts; legacy unpaid corporate invoices stored their charge in payment.amount. */
export function getAmountReceived(transaction: TransactionAccountingFields) {
  if (transaction.status === "Voided") return 0
  const amount = transaction.amountPaid ?? (
    transaction.status === "Completed"
      ? transaction.payment.amount ?? transaction.totalAmount
      : 0
  )
  return Math.min(transaction.totalAmount, Math.max(0, amount))
}

export function getOutstandingBalance(transaction: Transaction & { outstandingBalance?: number }) {
  if (transaction.status === "Voided") return 0
  return Math.max(0, transaction.totalAmount - getAmountReceived(transaction))
}

/** Older transaction records were created only after the attendant finished the wash. */
export function isWashServed(transaction: Pick<Transaction, "status" | "washStatus">) {
  return transaction.status !== "Voided" && transaction.washStatus !== "In Progress"
}
