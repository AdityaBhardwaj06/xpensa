export type PaymentMode = 'UPI' | 'SU' | 'ID' | 'Cash' | 'Card' | 'Parents';

export interface QuickPreset {
  id: string;
  name: string;
  price: number;
  place: string;
  cat: ExpenseCategory;
  subcat: string;
}

export type ExpenseCategory =
  | 'Food'
  | 'Essentials'
  | 'Stationery'
  | 'Entertainment'
  | 'Gift, treat'
  | 'Transportation'
  | 'Health'
  | 'Miscellaneous';

export type CampusPlace =
  | 'Amul'
  | 'Vendi'
  | 'Mess'
  | 'Redi'
  | 'ANC'
  | 'FM'
  | 'Cnot'
  | 'Looters'
  | 'Pitstop'
  | 'IC'
  | 'Akshay'
  | 'Blinkit'
  | "Domino's"
  | 'Amazon'
  | 'Pilani / Local'
  | 'Hostel / Campus'
  | 'Other';

export type InflowCategory =
  | 'Parent Top-up'
  | 'Relative / Gift'
  | 'Split Reimbursement'
  | 'Refund / Reversal';

export interface Transaction {
  id: string;
  date: string;
  name: string;
  rawPayee?: string;
  price: number;        // Total money that left your wallet/bank
  myShare?: number;     // Your true personal share (prevents group bills from inflating analytics)
  splitCount?: number;  // e.g., 2, 3, 4 people
  txType: 'DEBIT' | 'CREDIT';
  mode: PaymentMode;
  cat: ExpenseCategory;
  subcat: string;
  place: string;
  indiv: 'Solo' | 'Split';
  inflowCat?: InflowCategory;
  note: string;
  status: 'completed' | 'pending';
}

/**
 * Returns your actual personal expense for analytics/categories/habits.
 * If a ₹600 Domino's bill was split 3 ways (myShare = 200), analytics only counts ₹200.
 */
export function getEffectiveSpend(t: Transaction): number {
  if (t.txType !== 'DEBIT') return 0;
  if (typeof t.myShare === 'number' && t.myShare >= 0) {
    return t.myShare;
  }
  return t.indiv === 'Split' ? Number((t.price / 2).toFixed(2)) : t.price;
}

export interface MerchantAlias {
  key: string;
  place: CampusPlace | string;
  cat: ExpenseCategory;
  subcat: string;
  txType: 'DEBIT' | 'CREDIT';
  inflowCat?: InflowCategory;
}

export const DEFAULT_ALIASES: MerchantAlias[] = [
  { key: 'VENDING BROTHERS', place: 'Vendi', cat: 'Food', subcat: 'Snacks', txType: 'DEBIT' },
  { key: 'VENDI', place: 'Vendi', cat: 'Food', subcat: 'Snacks', txType: 'DEBIT' },
  { key: 'INSTANT VEND', place: 'Vendi', cat: 'Food', subcat: 'Snacks', txType: 'DEBIT' },
  { key: 'NAMONARAYAN', place: 'Amul', cat: 'Food', subcat: 'Dairy', txType: 'DEBIT' },
  { key: 'ADITYAFOODMANAGEMENT', place: 'Mess', cat: 'Food', subcat: 'Mess / Canteen', txType: 'DEBIT' },
  { key: 'SHUBHAN PRINT', place: 'Hostel / Campus', cat: 'Stationery', subcat: 'Print & Pens', txType: 'DEBIT' },
  { key: 'BLINKIT', place: 'Blinkit', cat: 'Essentials', subcat: 'Quick Commerce', txType: 'DEBIT' },
  { key: 'AUDIBLE', place: 'Other', cat: 'Entertainment', subcat: 'Subscription', txType: 'DEBIT' },
  { key: 'AMUL', place: 'Amul', cat: 'Food', subcat: 'Dairy', txType: 'DEBIT' },
  { key: 'REDI', place: 'Redi', cat: 'Food', subcat: 'Canteen', txType: 'DEBIT' },
  { key: 'ANC', place: 'ANC', cat: 'Food', subcat: 'Night Canteen', txType: 'DEBIT' },
  { key: 'ALL NIGHT CANTEEN', place: 'ANC', cat: 'Food', subcat: 'Night Canteen', txType: 'DEBIT' },
  { key: 'FOOD MINISTRY', place: 'FM', cat: 'Food', subcat: 'Eatery', txType: 'DEBIT' },
  { key: 'LOOTERS', place: 'Looters', cat: 'Food', subcat: 'Eatery', txType: 'DEBIT' },
  { key: 'PITSTOP', place: 'Pitstop', cat: 'Food', subcat: 'Eatery', txType: 'DEBIT' },
  { key: 'CONNAUGHT', place: 'Cnot', cat: 'Food', subcat: 'Cnot', txType: 'DEBIT' },
  { key: 'CNOT', place: 'Cnot', cat: 'Food', subcat: 'Cnot', txType: 'DEBIT' },
  { key: 'AKSHAY', place: 'Akshay', cat: 'Essentials', subcat: 'Supermarket', txType: 'DEBIT' },
  { key: 'DOMINO', place: "Domino's", cat: 'Food', subcat: 'Delivery', txType: 'DEBIT' },
  { key: 'AMAZON', place: 'Amazon', cat: 'Essentials', subcat: 'Online', txType: 'DEBIT' },
];

export const CAMPUS_PRESETS = [
  { name: 'Yoghurt', price: 30, place: 'Amul', cat: 'Food' as ExpenseCategory, subcat: 'Dairy' },
  { name: 'Paneer Bhurji', price: 55, place: 'Mess', cat: 'Food' as ExpenseCategory, subcat: 'Mess Extra' },
  { name: 'Chips / Snack', price: 20, place: 'Vendi', cat: 'Food' as ExpenseCategory, subcat: 'Snacks' },
  { name: 'Lassi / Chaach', price: 20, place: 'Amul', cat: 'Food' as ExpenseCategory, subcat: 'Dairy' },
  { name: 'Masala Maggi', price: 40, place: 'Redi', cat: 'Food' as ExpenseCategory, subcat: 'Canteen' },
  { name: 'Cheese Burger', price: 70, place: 'ANC', cat: 'Food' as ExpenseCategory, subcat: 'Night Canteen' },
  { name: 'Choco Lava', price: 70, place: 'Cnot', cat: 'Food' as ExpenseCategory, subcat: 'Dessert' },
  { name: 'Chili Potato', price: 80, place: 'FM', cat: 'Food' as ExpenseCategory, subcat: 'Eatery' },
  { name: 'Curd / Dahi', price: 24, place: 'Mess', cat: 'Food' as ExpenseCategory, subcat: 'Dairy' },
  { name: 'Room Cleaning', price: 50, place: 'Hostel / Campus', cat: 'Miscellaneous' as ExpenseCategory, subcat: 'Service' },
];

export const DEFAULT_PRESETS: QuickPreset[] = [
  { id: 'p_1', name: 'Yoghurt', price: 30, place: 'Amul', cat: 'Food', subcat: 'Dairy' },
  { id: 'p_2', name: 'Lassi / Chaach', price: 25, place: 'Amul', cat: 'Food', subcat: 'Dairy' },
  { id: 'p_3', name: 'Paneer Bhurji', price: 90, place: 'Mess', cat: 'Food', subcat: 'Mess Extra' },
  { id: 'p_4', name: 'Vendi Chips', price: 20, place: 'Vendi', cat: 'Food', subcat: 'Snacks' },
  { id: 'p_5', name: 'Redi Maggi', price: 40, place: 'Redi', cat: 'Food', subcat: 'Canteen' },
  { id: 'p_6', name: 'ANC Burger / Fries', price: 85, place: 'ANC', cat: 'Food', subcat: 'Night Canteen' },
  { id: 'p_7', name: 'FM Roll / Momo', price: 80, place: 'FM', cat: 'Food', subcat: 'Night Canteen' },
  { id: 'p_8', name: 'Choco Lava', price: 50, place: 'Cnot', cat: 'Food', subcat: 'Dessert' },
];

export const SEED_TRANSACTIONS: Transaction[] = [];