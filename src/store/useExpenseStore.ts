import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Transaction,
  MerchantAlias,
  PaymentMode,
  ExpenseCategory,
} from '../types/expense';
import { DEFAULT_ALIASES, SEED_TRANSACTIONS } from '../types/expense';
import { supabase, isCloudConfigured } from '../lib/supabase';

const SYNC_ROW_ID = 'aditya_main';
let isApplyingRemoteUpdate = false;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

interface ExpenseState {
  transactions: Transaction[];
  aliases: MerchantAlias[];
  quickMode: PaymentMode;
  openingBalance: number;
  syncState: 'offline' | 'syncing' | 'live' | 'error';
  lastSyncedAt: string | null;
  syncError: string | null;
  initRealtimeSync: () => () => void;
  syncNowToCloud: () => Promise<void>;
  setQuickMode: (mode: PaymentMode) => void;
  setOpeningBalance: (bal: number) => void;
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
}

function scheduleCloudPush(get: () => ExpenseState) {
  if (!isCloudConfigured || !supabase || isApplyingRemoteUpdate) return;
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    void get().syncNowToCloud();
  }, 350);
}

export const useExpenseStore = create<ExpenseState>()(
  persist(
    (set, get) => ({
      transactions: SEED_TRANSACTIONS,
      aliases: DEFAULT_ALIASES,
      quickMode: 'UPI',
      openingBalance: 20000,
      syncState: isCloudConfigured ? 'syncing' : 'offline',
      lastSyncedAt: null,
      syncError: null,

      syncNowToCloud: async () => {
        if (!supabase || isApplyingRemoteUpdate) return;
        const { transactions, aliases, openingBalance } = get();
        set({ syncState: 'syncing', syncError: null });

        const nowIso = new Date().toISOString();
        const { error } = await supabase.from('ledger_sync').upsert(
          {
            id: SYNC_ROW_ID,
            payload: { transactions, aliases, openingBalance, updatedAt: nowIso },
            updated_at: nowIso,
          },
          { onConflict: 'id' }
        );

        if (error) {
          set({ syncState: 'error', syncError: error.message });
        } else {
          set({
            syncState: 'live',
            lastSyncedAt: new Date().toLocaleTimeString(),
            syncError: null,
          });
        }
      },

      initRealtimeSync: () => {
        if (!supabase) {
          set({ syncState: 'offline' });
          return () => {};
        }

        // 1. Initial Pull or Seed on App Boot
        (async () => {
          set({ syncState: 'syncing' });
          const { data, error } = await supabase
            .from('ledger_sync')
            .select('payload, updated_at')
            .eq('id', SYNC_ROW_ID)
            .maybeSingle();

          if (error) {
            set({ syncState: 'error', syncError: error.message });
            return;
          }

          const remoteTx = data?.payload?.transactions || [];
          const localTx = get().transactions;

          // If cloud has data and local is empty (e.g. opening on your phone for the first time), pull cloud data
          if (remoteTx.length > 0 && localTx.length === 0) {
            isApplyingRemoteUpdate = true;
            set({
              transactions: remoteTx,
              aliases: data?.payload?.aliases || DEFAULT_ALIASES,
              openingBalance: data?.payload?.openingBalance ?? 20000,
              syncState: 'live',
              lastSyncedAt: new Date().toLocaleTimeString(),
            });
            isApplyingRemoteUpdate = false;
          } else if (localTx.length > 0 && remoteTx.length === 0) {
            // If laptop has your 290 imported rows and cloud is empty, push laptop data to cloud automatically
            await get().syncNowToCloud();
          } else if (data?.payload) {
            // Both exist: take remote if it has more or newer records
            isApplyingRemoteUpdate = true;
            set({
              transactions: remoteTx.length >= localTx.length ? remoteTx : localTx,
              aliases: data.payload.aliases || get().aliases,
              openingBalance: data.payload.openingBalance ?? get().openingBalance,
              syncState: 'live',
              lastSyncedAt: new Date().toLocaleTimeString(),
            });
            isApplyingRemoteUpdate = false;
            if (localTx.length > remoteTx.length) {
              await get().syncNowToCloud();
            }
          } else {
            set({ syncState: 'live' });
          }
        })();

        // 2. Subscribe to Live Postgres WebSocket Changes
        const channel = supabase
          .channel('realtime_ledger_sync')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'ledger_sync',
              filter: `id=eq.${SYNC_ROW_ID}`,
            },
            (payload) => {
              const newRecord = payload.new as { payload?: any } | undefined;
              if (!newRecord?.payload) return;
              isApplyingRemoteUpdate = true;
              set({
                transactions: newRecord.payload.transactions || [],
                aliases: newRecord.payload.aliases || DEFAULT_ALIASES,
                openingBalance: newRecord.payload.openingBalance ?? 20000,
                syncState: 'live',
                lastSyncedAt: new Date().toLocaleTimeString(),
              });
              isApplyingRemoteUpdate = false;
            }
          )
          .subscribe();

        return () => {
          if (supabase) {
            void supabase.removeChannel(channel);
          }
        };
      },

      setQuickMode: (mode) => set({ quickMode: mode }),

      setOpeningBalance: (openingBalance) => {
        set({ openingBalance });
        scheduleCloudPush(get);
      },

      addTransaction: (tx) => {
        set((state) => ({
          transactions: [
            { ...tx, id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` },
            ...state.transactions,
          ],
        }));
        scheduleCloudPush(get);
      },

      bulkAddTransactions: (txs) => {
        set((state) => ({
          transactions: [
            ...txs.map((t, idx) => ({
              ...t,
              id: `tx_b_${Date.now()}_${idx}`,
            })),
            ...state.transactions,
          ].sort((a, b) => b.date.localeCompare(a.date)),
        }));
        scheduleCloudPush(get);
      },

      updateTransaction: (id, patch, rememberForPayee = false) => {
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
            if (t.id === id) return { ...t, ...patch };
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
        });
        scheduleCloudPush(get);
      },

      reapplyAliasesToExisting: () => {
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
        });
        scheduleCloudPush(get);
      },

      deleteTransaction: (id) => {
        set((state) => ({
          transactions: state.transactions.filter((t) => t.id !== id),
        }));
        scheduleCloudPush(get);
      },

      clearAllTransactions: () => {
        set({ transactions: [] });
        scheduleCloudPush(get);
      },

      upsertAlias: (alias) => {
        set((state) => {
          const filtered = state.aliases.filter(
            (a) => a.key.toUpperCase() !== alias.key.toUpperCase()
          );
          return { aliases: [alias, ...filtered] };
        });
        scheduleCloudPush(get);
      },

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
    }),
    { name: 'bits-ledger-clean-v3' }
  )
);