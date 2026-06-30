import { User as FirebaseUser } from "firebase/auth";
import { FieldValue, Timestamp } from "firebase/firestore";

export type UserRole = 'Admin' | 'Attendant';

export type CustomerTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

export function calcTier(points: number): CustomerTier {
  if (points >= 700) return 'Platinum';
  if (points >= 300) return 'Gold';
  if (points >= 100) return 'Silver';
  return 'Bronze';
}

/** Points earned = floor(totalAmountNgwe / 100) — 1 point per ZMW 1 spent. */
export function calcPointsEarned(totalAmountNgwe: number): number {
  return Math.floor(totalAmountNgwe / 100);
}

export interface Customer {
  id: string;
  name: string;
  phoneNumber: string;
  /** Cumulative loyalty points. */
  totalPoints: number;
  totalVisits: number;
  /** Total spend in ngwe across all completed transactions. */
  totalSpendNgwe: number;
  tier: CustomerTier;
  createdAt?: Timestamp | FieldValue;
  lastVisitAt?: Timestamp | FieldValue;
}

export interface Location {
  id: string;
  name: string;
  address?: string;
  active: boolean;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  /** Assigned branch. Attendants must have one; Admins with none see all locations. */
  locationId?: string;
  locationName?: string;
}

export interface AppUser extends FirebaseUser {
  profile: UserProfile;
}

export interface Vehicle {
  id?: string;
  licensePlate: string;
  type: 'Sedan' | 'SUV' | 'Truck' | 'Minibus';
  ownerName?: string;
  phoneNumber?: string;
  photoDataUri?: string;
}

export interface Service {
  id: string;
  name: string;
  /** Price in ngwe (100 ngwe = 1 ZMW). */
  price: number;
}

export type PaymentMethod = 'Cash' | 'Mobile Money' | 'Corporate Account';
export type TransactionStatus = 'Completed' | 'Pending Payment' | 'Voided';

export interface Payment {
  method: PaymentMethod;
  reference?: string;
  /** Amount in ngwe. */
  amount: number;
}

export interface Transaction {
  id: string;
  /** Client-side ISO time, written immediately so receipts/display work offline. */
  timestamp: string;
  /** Server-authoritative time (serverTimestamp). Use this for trusted ordering/reporting. */
  createdAt?: Timestamp | FieldValue;
  licensePlate: string;
  /** Each service price is in ngwe. */
  services: { id: string; name: string; price: number; }[];
  /** Total in ngwe. */
  totalAmount: number;
  payment: Payment;
  userId: string;
  locationId?: string;
  locationName?: string;
  washerId?: string; // Legacy
  washerName?: string; // Legacy
  assignedWashers?: { id: string; name: string }[];
  status: TransactionStatus;
  /** Denormalised from vehicle record for easy corporate tracking. */
  customerName?: string;
  customerPhone?: string;
  voidedAt?: Timestamp | FieldValue;
  voidedBy?: string;
  receiptUrl?: string;
}

export interface Washer {
  id: string;
  name: string;
}

    