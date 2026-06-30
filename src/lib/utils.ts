import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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
