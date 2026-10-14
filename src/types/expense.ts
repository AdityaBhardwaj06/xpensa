export type PaymentMode = 'UPI' | 'SU' | 'ID' | 'Cash' | 'Card' | 'Parents';

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
  date: string; // YYYY-MM-DD
  name: string;
  price: number;
  txType: 'DEBIT' | 'CREDIT';
  mode: PaymentMode;
  cat: ExpenseCategory;
  subcat: string;
  place: CampusPlace | string;
  indiv: 'Solo' | 'Split' | 'Treat / Gift';
  inflowCat?: InflowCategory;
  note: string;
  status: 'completed' | 'failed';
}

export interface MerchantAlias {
  key: string;
  place: CampusPlace | string;
  cat: ExpenseCategory;
  subcat: string;
  mode: PaymentMode;
  txType: 'DEBIT' | 'CREDIT';
  inflowCat?: InflowCategory;
}

export const DEFAULT_ALIASES: MerchantAlias[] = [
  { key: 'RAMESH KUMAR', place: 'Amul', cat: 'Food', subcat: 'Dairy', mode: 'UPI', txType: 'DEBIT' },
  { key: 'AMUL', place: 'Amul', cat: 'Food', subcat: 'Dairy', mode: 'UPI', txType: 'DEBIT' },
  { key: 'VENDI', place: 'Vendi', cat: 'Food', subcat: 'Snacks', mode: 'UPI', txType: 'DEBIT' },
  { key: 'INSTANT VEND', place: 'Vendi', cat: 'Food', subcat: 'Snacks', mode: 'UPI', txType: 'DEBIT' },
  { key: 'REDI', place: 'Redi', cat: 'Food', subcat: 'Canteen', mode: 'SU', txType: 'DEBIT' },
  { key: 'ANC', place: 'ANC', cat: 'Food', subcat: 'Night Canteen', mode: 'SU', txType: 'DEBIT' },
  { key: 'ALL NIGHT CANTEEN', place: 'ANC', cat: 'Food', subcat: 'Night Canteen', mode: 'SU', txType: 'DEBIT' },
  { key: 'FOOD MINISTRY', place: 'FM', cat: 'Food', subcat: 'Eatery', mode: 'SU', txType: 'DEBIT' },
  { key: 'LOOTERS', place: 'Looters', cat: 'Food', subcat: 'Eatery', mode: 'SU', txType: 'DEBIT' },
  { key: 'PITSTOP', place: 'Pitstop', cat: 'Food', subcat: 'Eatery', mode: 'SU', txType: 'DEBIT' },
  { key: 'CONNAUGHT', place: 'Cnot', cat: 'Food', subcat: 'Cnot', mode: 'UPI', txType: 'DEBIT' },
  { key: 'CNOT', place: 'Cnot', cat: 'Food', subcat: 'Cnot', mode: 'UPI', txType: 'DEBIT' },
  { key: 'AKSHAY', place: 'Akshay', cat: 'Essentials', subcat: 'Supermarket', mode: 'ID', txType: 'DEBIT' },
  { key: 'DOMINO', place: "Domino's", cat: 'Food', subcat: 'Delivery', mode: 'UPI', txType: 'DEBIT' },
  { key: 'AMAZON', place: 'Amazon', cat: 'Essentials', subcat: 'Online', mode: 'UPI', txType: 'DEBIT' },
];

export const CAMPUS_PRESETS = [
  { name: 'Yoghurt', price: 30, place: 'Amul', cat: 'Food' as ExpenseCategory, subcat: 'Dairy' },
  { name: 'Paneer Bhurji', price: 55, place: 'Mess', cat: 'Food' as ExpenseCategory, subcat: 'Mess Extra' },
  { name: 'Chips / Snack', price: 20, place: 'Vendi', cat: 'Food' as ExpenseCategory, subcat: 'Snacks' },
  { name: 'Lassi', price: 25, place: 'Amul', cat: 'Food' as ExpenseCategory, subcat: 'Dairy' },
  { name: 'Masala Maggi', price: 40, place: 'Redi', cat: 'Food' as ExpenseCategory, subcat: 'Canteen' },
  { name: 'Cheese Burger', price: 70, place: 'ANC', cat: 'Food' as ExpenseCategory, subcat: 'Night Canteen' },
  { name: 'Choco Lava', price: 70, place: 'Cnot', cat: 'Food' as ExpenseCategory, subcat: 'Dessert' },
  { name: 'Chili Potato', price: 80, place: 'FM', cat: 'Food' as ExpenseCategory, subcat: 'Eatery' },
  { name: 'Curd / Dahi', price: 24, place: 'Mess', cat: 'Food' as ExpenseCategory, subcat: 'Dairy' },
  { name: 'Room Cleaning', price: 50, place: 'Hostel / Campus', cat: 'Miscellaneous' as ExpenseCategory, subcat: 'Service' },
];

// Clean slate: zero pre-loaded Jan-Mar archive rows
export const SEED_TRANSACTIONS: Transaction[] = [];