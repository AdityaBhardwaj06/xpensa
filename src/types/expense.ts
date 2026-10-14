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
  date: string; // YYYY-MM-DD
  name: string;
  rawPayee?: string; // Preserved for retrospective bulk-memory updates
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

export const SEED_TRANSACTIONS: Transaction[] = [];