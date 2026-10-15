import type { ExpenseCategory, InflowCategory, PaymentMode } from '../types/expense';

export const PLACES = [
  'Amul',
  'Vendi',
  'Mess',
  'Redi',
  'ANC',
  'FM',
  'Cnot',
  'Looters',
  'Pitstop',
  'IC',
  'Akshay',
  'Blinkit',
  "Domino's",
  'Amazon',
  'Pilani / Local',
  'Hostel / Campus',
  'Other',
];

export const CATEGORIES: ExpenseCategory[] = [
  'Food',
  'Essentials',
  'Stationery',
  'Entertainment',
  'Gift, treat',
  'Transportation',
  'Health',
  'Miscellaneous',
];

export const INFLOW_TYPES: InflowCategory[] = [
  'Parent Top-up',
  'Relative / Gift',
  'Split Reimbursement',
  'Refund / Reversal',
];

export const PAYMENT_MODES: PaymentMode[] = [
  'UPI',
  'SU',
  'ID',
  'Cash',
  'Card',
  'Parents',
];

export type TabId = 'overview' | 'log' | 'import' | 'ledger' | 'auto' | 'profile';

export interface ToastItem {
  id: string;
  title: string;
  subtitle?: string;
  type: 'success' | 'info' | 'error';
  undoAction?: () => void;
}

export type NotifyFn = (
  title: string,
  subtitle?: string,
  type?: 'success' | 'info' | 'error',
  undoAction?: () => void
) => void;

export const fmt = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });