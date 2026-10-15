import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Transaction,
  MerchantAlias,
  PaymentMode,
  ExpenseCategory,
  QuickPreset,
} from '../types/expense';
import { DEFAULT_ALIASES, DEFAULT_PRESETS } from '../types/expense';
import { supabase, isCloudConfigured } from '../lib/supabase';

let isApplyingRemoteUpdate = false;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let activeChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

interface ExpenseState {
  currentUser: UserProfile | null;
  lastActiveUserId: string | null;
  transactions: Transaction[];
  aliases: MerchantAlias[];
  presets: QuickPreset[];
  quickMode: PaymentMode;
  openingBalance: number;
  syncState: 'offline' | 'syncing' | 'live' | 'error';
  lastSyncedAt: string | null;
  syncError: string | null;

  setCurrentUser: (user: UserProfile | null) => void;
  initRealtimeSync: (userId?: string) => () => void;
  syncNowToCloud: () => Promise<void>;

  addPreset: (preset: Omit<QuickPreset, 'id'>) => void;
  updatePreset: (id: string, patch: Partial<QuickPreset>) => void;
  deletePreset: (id: string) => void;
  resetDefaultPresets: () => void;

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
  if (!isCloudConfigured || !supabase || isApplyingRemoteUpdate || !get().currentUser) return;
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    void get().syncNowToCloud();
  }, 350);
}

export const useExpenseStore = create<ExpenseState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      lastActiveUserId: null,
      transactions: [],
      aliases: DEFAULT_ALIASES,
      presets: DEFAULT_PRESETS,
      quickMode: 'UPI',
      openingBalance: 0,
      syncState: isCloudConfigured ? 'syncing' : 'offline',
      lastSyncedAt: null,
      syncError: null,

      setCurrentUser: (user) => {
        const prevUserId = get().lastActiveUserId;

        if (!user) {
          if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
          set({
            currentUser: null,
            transactions: [],
            aliases: DEFAULT_ALIASES,
            presets: DEFAULT_PRESETS,
            openingBalance: 0,
            syncState: 'offline',
          });
          return;
        }

        if (prevUserId && prevUserId !== user.id) {
          set({
            currentUser: user,
            lastActiveUserId: user.id,
            transactions: [],
            aliases: DEFAULT_ALIASES,
            presets: DEFAULT_PRESETS,
            openingBalance: 0,
            syncState: 'syncing',
          });
        } else {
          set({
            currentUser: user,
            lastActiveUserId: user.id,
          });
        }
      },

      syncNowToCloud: async () => {
        const { currentUser, transactions, aliases, presets, openingBalance } = get();
        if (!supabase || isApplyingRemoteUpdate || !currentUser) return;
        set({ syncState: 'syncing', syncError: null });

        const nowIso = new Date().toISOString();
        const { error } = await supabase.from('ledger_sync').upsert(
          {
            id: currentUser.id,
            user_email: currentUser.email,
            payload: {
              transactions,
              aliases,
              presets,
              openingBalance,
              updatedAt: nowIso,
            },
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

      initRealtimeSync: (userId) => {
        if (!supabase || !userId) {
          set({ syncState: 'offline' });
          return () => {};
        }

        if (activeChannel) {
          void supabase.removeChannel(activeChannel);
          activeChannel = null;
        }

        (async () => {
          set({ syncState: 'syncing', syncError: null });

          // Fetch ONLY this specific user's row from Supabase
          const { data, error } = await supabase
            .from('ledger_sync')
            .select('payload, updated_at')
            .eq('id', userId)
            .maybeSingle();

          if (error) {
            set({ syncState: 'error', syncError: error.message });
            return;
          }

          if (data?.payload) {
            // User has cloud data -> load it
            isApplyingRemoteUpdate = true;
            set({
              transactions: data.payload.transactions || [],
              aliases: data.payload.aliases || DEFAULT_ALIASES,
              presets: data.payload.presets || DEFAULT_PRESETS,
              openingBalance: data.payload.openingBalance ?? 0,
              syncState: 'live',
              lastSyncedAt: new Date().toLocaleTimeString(),
            });
            isApplyingRemoteUpdate = false;
          } else {
            // Brand new user with zero cloud data -> start completely fresh
            isApplyingRemoteUpdate = true;
            set({
              transactions: [],
              aliases: DEFAULT_ALIASES,
              presets: DEFAULT_PRESETS,
              openingBalance: 0,
              syncState: 'live',
              lastSyncedAt: new Date().toLocaleTimeString(),
            });
            isApplyingRemoteUpdate = false;
            await get().syncNowToCloud();
          }
        })();

        const channel = supabase
          .channel(`ledger_sync_${userId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'ledger_sync',
              filter: `id=eq.${userId}`,
            },
            (payload) => {
              const newRecord = payload.new as { payload?: any } | undefined;
              if (!newRecord?.payload) return;
              isApplyingRemoteUpdate = true;
              set({
                transactions: newRecord.payload.transactions || [],
                aliases: newRecord.payload.aliases || DEFAULT_ALIASES,
                presets: newRecord.payload.presets || DEFAULT_PRESETS,
                openingBalance: newRecord.payload.openingBalance ?? 0,
                syncState: 'live',
                lastSyncedAt: new Date().toLocaleTimeString(),
              });
              isApplyingRemoteUpdate = false;
            }
          )
          .subscribe();

        activeChannel = channel;

        return () => {
          if (activeChannel) {
            void supabase.removeChannel(activeChannel);
            activeChannel = null;
          }
        };
      },

      addPreset: (preset) => {
        set((state) => ({
          presets: [
            ...state.presets,
            { ...preset, id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 5)}` },
          ],
        }));
        scheduleCloudPush(get);
      },

      updatePreset: (id, patch) => {
        set((state) => ({
          presets: state.presets.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        }));
        scheduleCloudPush(get);
      },

      deletePreset: (id) => {
        set((state) => ({
          presets: state.presets.filter((p) => p.id !== id),
        }));
        scheduleCloudPush(get);
      },

      resetDefaultPresets: () => {
        set({ presets: DEFAULT_PRESETS });
        scheduleCloudPush(get);
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

        return {
          key: upperPayee,
          place: 'Other',
          cat: 'Food',
          subcat: 'Campus',
          txType: 'DEBIT',
        };
      },
    }),
    { name: '-multiuser-v3' }
  )
);