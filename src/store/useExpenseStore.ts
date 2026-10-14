import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Transaction,
  MerchantAlias,
  PaymentMode,
  ExpenseCategory,
} from '../types/expense';
import { DEFAULT_ALIASES, SEED_TRANSACTIONS } from '../types/expense';

interface ExpenseState {
  transactions: Transaction[];
  aliases: MerchantAlias[];
  quickMode: PaymentMode;
  setQuickMode: (mode: PaymentMode) => void;
  addTransaction: (tx: Omit<Transaction, 'id'>) => void;
  bulkAddTransactions: (txs: Omit<Transaction, 'id'>[]) => void;
  deleteTransaction: (id: string) => void;
  clearAllTransactions: () => void;
  upsertAlias: (alias: MerchantAlias) => void;
  matchPayeeToAlias: (payee: string, txType: 'DEBIT' | 'CREDIT') => MerchantAlias;
}

export const useExpenseStore = create<ExpenseState>()(
  persist(
    (set, get) => ({
      transactions: SEED_TRANSACTIONS,
      aliases: DEFAULT_ALIASES,
      quickMode: 'UPI',

      setQuickMode: (mode) => set({ quickMode: mode }),

      addTransaction: (tx) =>
        set((state) => ({
          transactions: [
            { ...tx, id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` },
            ...state.transactions,
          ],
        })),

      bulkAddTransactions: (txs) =>
        set((state) => ({
          transactions: [
            ...txs.map((t, idx) => ({
              ...t,
              id: `tx_b_${Date.now()}_${idx}`,
            })),
            ...state.transactions,
          ].sort((a, b) => b.date.localeCompare(a.date)),
        })),

      deleteTransaction: (id) =>
        set((state) => ({
          transactions: state.transactions.filter((t) => t.id !== id),
        })),

      clearAllTransactions: () => set({ transactions: [] }),

      upsertAlias: (alias) =>
        set((state) => {
          const filtered = state.aliases.filter(
            (a) => a.key.toUpperCase() !== alias.key.toUpperCase()
          );
          return { aliases: [alias, ...filtered] };
        }),

      matchPayeeToAlias: (payee, txType) => {
        const upper = payee.toUpperCase();
        const found = get().aliases.find((a) => upper.includes(a.key.toUpperCase()));
        if (found) return found;

        if (txType === 'CREDIT') {
          return {
            key: upper,
            place: 'Bank Transfer',
            cat: 'Miscellaneous' as ExpenseCategory,
            subcat: 'Inflow',
            mode: 'UPI',
            txType: 'CREDIT',
            inflowCat: 'Parent Top-up',
          };
        }

        const isSU = /\bSU\b|SU QR/i.test(upper);
        return {
          key: upper,
          place: isSU ? 'ANC' : 'Other',
          cat: 'Food',
          subcat: 'Campus',
          mode: isSU ? 'SU' : 'UPI',
          txType: 'DEBIT',
        };
      },
    }),
    { name: 'bits-ledger-clean-v3' }
  )
);