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
  openingBalance: number;
  cloudUrl: string;
  cloudKey: string;
  lastSyncedAt: string | null;
  setQuickMode: (mode: PaymentMode) => void;
  setOpeningBalance: (bal: number) => void;
  setCloudCredentials: (url: string, key: string) => void;
  addTransaction: (tx: Omit<Transaction, 'id'>) => void;
  bulkAddTransactions: (txs: Omit<Transaction, 'id'>[]) => void;
  updateTransaction: (
    id: string,
    patch: Partial<Transaction>,
    rememberForPayee?: boolean
  ) => void;
  reapplyAliasesToExisting: () => void;
  deleteTransaction: (id: string) => void;
  clearAllTransactions: () => void;
  upsertAlias: (alias: MerchantAlias) => void;
  matchPayeeToAlias: (payee: string, note: string, txType: 'DEBIT' | 'CREDIT') => MerchantAlias;
  pushToCloud: () => Promise<string>;
  pullFromCloud: () => Promise<string>;
}

export const useExpenseStore = create<ExpenseState>()(
  persist(
    (set, get) => ({
      transactions: SEED_TRANSACTIONS,
      aliases: DEFAULT_ALIASES,
      quickMode: 'UPI',
      openingBalance: 20000, // Default Aug 1 opening bank balance (editable in UI)
      cloudUrl: '',
      cloudKey: '',
      lastSyncedAt: null,

      setQuickMode: (mode) => set({ quickMode: mode }),
      setOpeningBalance: (openingBalance) => set({ openingBalance }),
      setCloudCredentials: (cloudUrl, cloudKey) => set({ cloudUrl, cloudKey }),

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

      updateTransaction: (id, patch, rememberForPayee = false) =>
        set((state) => {
          const target = state.transactions.find((t) => t.id === id);
          if (!target) return state;

          const payeeKey = (target.rawPayee || target.name.split('·')[0] || '')
            .trim()
            .toUpperCase();

          let updatedAliases = state.aliases;
          if (rememberForPayee && payeeKey) {
            const newAlias: MerchantAlias = {
              key: payeeKey,
              place: patch.place ?? target.place,
              cat: patch.cat ?? target.cat,
              subcat: patch.subcat ?? target.subcat,
              txType: target.txType,
              inflowCat: patch.inflowCat ?? target.inflowCat,
            };
            updatedAliases = [
              newAlias,
              ...state.aliases.filter((a) => a.key.toUpperCase() !== payeeKey),
            ];
          }

          const updatedTx = state.transactions.map((t) => {
            if (t.id === id) {
              return { ...t, ...patch };
            }
            if (rememberForPayee && payeeKey) {
              const tKey = (t.rawPayee || t.name.split('·')[0] || '').trim().toUpperCase();
              if (tKey === payeeKey && t.txType === target.txType) {
                return {
                  ...t,
                  place: patch.place ?? t.place,
                  cat: patch.cat ?? t.cat,
                  inflowCat: patch.inflowCat ?? t.inflowCat,
                };
              }
            }
            return t;
          });

          return { transactions: updatedTx, aliases: updatedAliases };
        }),

      // Retroactively fixes existing imported HDFC rows (removes accidental SU mode & maps campus vendors)
      reapplyAliasesToExisting: () =>
        set((state) => {
          const mergedAliases = [
            ...DEFAULT_ALIASES,
            ...state.aliases.filter(
              (a) => !DEFAULT_ALIASES.some((d) => d.key === a.key)
            ),
          ];

          const fixed = state.transactions.map((t) => {
            const rawPayee = (t.rawPayee || t.name.split('·')[0] || '').trim().toUpperCase();
            const rawNote = (t.name.split('·')[1] || t.note || '').trim().toUpperCase();
            const found = mergedAliases.find((a) => rawPayee.includes(a.key.toUpperCase()));

            // If this came from the HDFC statement import, it CANNOT be SU, Cash, or Parents
            const fixedMode: PaymentMode =
              t.mode === 'SU' && t.name.includes('·') ? 'UPI' : t.mode;

            if (found && t.txType === 'DEBIT') {
              return {
                ...t,
                mode: fixedMode,
                place: found.place,
                cat: found.cat,
                subcat: found.subcat,
              };
            }

            // Note-based smart fallback (e.g. CHAACH / YOGHURT / PEN)
            if (t.txType === 'DEBIT') {
              if (/YOGHURT|CHAACH|LASSI|AMUL/i.test(rawNote)) {
                return { ...t, mode: fixedMode, place: 'Amul', cat: 'Food' as ExpenseCategory };
              }
              if (/PEN|PRINT|NOTEBOOK/i.test(rawNote)) {
                return {
                  ...t,
                  mode: fixedMode,
                  place: 'Hostel / Campus',
                  cat: 'Stationery' as ExpenseCategory,
                };
              }
            }

            return { ...t, mode: fixedMode };
          });

          return { transactions: fixed, aliases: mergedAliases };
        }),

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

      matchPayeeToAlias: (payee, note, txType) => {
        const upperPayee = payee.toUpperCase();
        const upperNote = (note || '').toUpperCase();

        const found = get().aliases.find((a) => upperPayee.includes(a.key.toUpperCase()));
        if (found) return found;

        if (txType === 'CREDIT') {
          return {
            key: upperPayee,
            place: 'Bank Transfer',
            cat: 'Miscellaneous' as ExpenseCategory,
            subcat: 'Inflow',
            txType: 'CREDIT',
            inflowCat: 'Parent Top-up',
          };
        }

        // Check UPI note keywords if payee is an unfamiliar personal name
        if (/YOGHURT|CHAACH|LASSI|CURD/i.test(upperNote)) {
          return { key: upperPayee, place: 'Amul', cat: 'Food', subcat: 'Dairy', txType: 'DEBIT' };
        }
        if (/PEN|PRINT|XEROX/i.test(upperNote)) {
          return {
            key: upperPayee,
            place: 'Hostel / Campus',
            cat: 'Stationery',
            subcat: 'Stationery',
            txType: 'DEBIT',
          };
        }

        return {
          key: upperPayee,
          place: 'Other',
          cat: 'Food',
          subcat: 'Campus',
          txType: 'DEBIT',
        };
      },

      // Cloud Sync via Supabase REST API (Zero extra SDK dependencies needed)
      pushToCloud: async () => {
        const { cloudUrl, cloudKey, transactions, aliases, openingBalance } = get();
        if (!cloudUrl || !cloudKey) return 'Enter Supabase URL & Anon Key first.';
        const res = await fetch(`${cloudUrl.replace(/\/$/, '')}/rest/v1/ledger_sync?id=eq.aditya_main`, {
          method: 'POST',
          headers: {
            apikey: cloudKey,
            Authorization: `Bearer ${cloudKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            id: 'aditya_main',
            payload: { transactions, aliases, openingBalance },
            updated_at: new Date().toISOString(),
          }),
        });
        if (!res.ok) throw new Error(`Cloud push failed: ${res.statusText}`);
        const now = new Date().toLocaleTimeString();
        set({ lastSyncedAt: now });
        return `Synced ${transactions.length} txns to cloud at ${now}`;
      },

      pullFromCloud: async () => {
        const { cloudUrl, cloudKey } = get();
        if (!cloudUrl || !cloudKey) return 'Enter Supabase URL & Anon Key first.';
        const res = await fetch(
          `${cloudUrl.replace(/\/$/, '')}/rest/v1/ledger_sync?id=eq.aditya_main&select=payload,updated_at`,
          {
            headers: {
              apikey: cloudKey,
              Authorization: `Bearer ${cloudKey}`,
            },
          }
        );
        if (!res.ok) throw new Error(`Cloud pull failed: ${res.statusText}`);
        const data = await res.json();
        if (data?.[0]?.payload) {
          const { transactions, aliases, openingBalance } = data[0].payload;
          const now = new Date().toLocaleTimeString();
          set({
            transactions: transactions || [],
            aliases: aliases || DEFAULT_ALIASES,
            openingBalance: openingBalance ?? 20000,
            lastSyncedAt: now,
          });
          return `Pulled ${transactions?.length || 0} txns from cloud`;
        }
        return 'No cloud backup found yet.';
      },
    }),
    { name: 'bits-ledger-clean-v3' }
  )
);