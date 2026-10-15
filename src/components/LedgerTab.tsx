import { useState, useMemo, useEffect } from 'react';
import { Search, X, Sparkles, Filter, Trash2, Check } from 'lucide-react';
import { useExpenseStore } from '../store/useExpenseStore';
import type { ExpenseCategory, InflowCategory, PaymentMode, Transaction } from '../types/expense';
import { PLACES, CATEGORIES, INFLOW_TYPES, PAYMENT_MODES, fmt } from '../constants/taxonomy';
import type { NotifyFn } from '../constants/taxonomy';
import { triggerHaptic } from '../utils/feedback';

interface LedgerRowProps {
  t: Transaction;
  rememberEdits: boolean;
  onUpdate: (id: string, patch: Partial<Transaction>, remember?: boolean) => void;
  onDelete: (t: Transaction) => void;
  notify: NotifyFn;
}

function LedgerRow({ t, rememberEdits, onUpdate, onDelete, notify }: LedgerRowProps) {
  const [nameDraft, setNameDraft] = useState(t.name);
  const [priceDraft, setPriceDraft] = useState(String(t.price));
  const [isEditingName, setIsEditingName] = useState(false);

  useEffect(() => {
    setNameDraft(t.name);
  }, [t.name]);

  useEffect(() => {
    setPriceDraft(String(t.price));
  }, [t.price]);

  const saveName = () => {
    setIsEditingName(false);
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === t.name) {
      setNameDraft(t.name);
      return;
    }
    triggerHaptic('medium');
    onUpdate(t.id, { name: trimmed }, false);
    notify('Description updated', `${t.name} → ${trimmed}`, 'success');
  };

  const savePrice = () => {
    const parsed = parseFloat(priceDraft);
    if (isNaN(parsed) || parsed <= 0 || parsed === t.price) {
      setPriceDraft(String(t.price));
      return;
    }
    triggerHaptic('medium');
    onUpdate(t.id, { price: parsed }, false);
    notify('Amount updated', `₹${fmt(t.price)} → ₹${fmt(parsed)}`, 'success');
  };

  return (
    <tr className="hover:bg-zinc-900/40 group">
      {/* Editable Date */}
      <td className="py-2 px-2.5 text-zinc-400 whitespace-nowrap text-[11px]">
        <input
          type="date"
          value={t.date}
          onChange={(e) => {
            if (!e.target.value) return;
            triggerHaptic('light');
            onUpdate(t.id, { date: e.target.value }, false);
            notify('Date updated', e.target.value, 'info');
          }}
          className="bg-transparent text-zinc-400 hover:text-zinc-200 focus:text-zinc-100 focus:outline-none font-mono text-[11px] w-[98px] cursor-pointer"
        />
      </td>

      {/* Editable Description */}
      <td className="py-2 px-2.5 font-sans min-w-[180px] max-w-[240px]">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={nameDraft}
            onFocus={() => setIsEditingName(true)}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setNameDraft(t.name);
                setIsEditingName(false);
              }
            }}
            title="Click to edit description"
            className="w-full bg-transparent hover:bg-zinc-900/70 focus:bg-zinc-900 border border-transparent hover:border-zinc-800 focus:border-zinc-600 rounded px-1.5 py-0.5 text-xs text-zinc-200 focus:text-white focus:outline-none transition"
          />
          {isEditingName && nameDraft !== t.name && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                saveName();
              }}
              className="p-1 bg-emerald-500/20 text-emerald-400 rounded shrink-0"
            >
              <Check className="w-3 h-3" />
            </button>
          )}
        </div>
      </td>

      {/* Editable Place / Inflow Source */}
      <td className="py-2 px-2.5 font-sans">
        {t.txType === 'CREDIT' ? (
          <select
            value={t.inflowCat || 'Parent Top-up'}
            onChange={(e) => {
              triggerHaptic('medium');
              onUpdate(t.id, { inflowCat: e.target.value as InflowCategory }, rememberEdits);
              notify('Updated Inflow Type', `${t.name} → ${e.target.value}`, 'info');
            }}
            className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-xs text-emerald-400"
          >
            {INFLOW_TYPES.map((inf) => (
              <option key={inf} value={inf}>
                {inf}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={t.place}
            onChange={(e) => {
              triggerHaptic('medium');
              onUpdate(t.id, { place: e.target.value }, rememberEdits);
              notify(
                `Mapped to ${e.target.value}`,
                rememberEdits
                  ? 'Updated all matching merchant entries'
                  : 'Updated single entry',
                'success'
              );
            }}
            className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-xs text-zinc-300"
          >
            {PLACES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
      </td>

      {/* Editable Category */}
      <td className="py-2 px-2.5 font-sans">
        <select
          value={t.cat}
          onChange={(e) => {
            triggerHaptic('medium');
            onUpdate(t.id, { cat: e.target.value as ExpenseCategory }, rememberEdits);
            notify(`Category → ${e.target.value}`, t.name, 'info');
          }}
          className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-xs text-zinc-300"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </td>

      {/* Editable Payment Mode */}
      <td className="py-2 px-2.5 font-sans">
        <select
          value={t.mode}
          onChange={(e) => {
            triggerHaptic('medium');
            onUpdate(t.id, { mode: e.target.value as PaymentMode }, false);
            notify(`Mode → ${e.target.value}`, t.name, 'info');
          }}
          className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-xs font-mono text-zinc-300"
        >
          {PAYMENT_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </td>

      {/* Editable Amount */}
      <td className="py-2 px-2.5 text-right font-mono font-medium whitespace-nowrap">
        <div className="inline-flex items-center justify-end">
          <span className={t.txType === 'CREDIT' ? 'text-emerald-400' : 'text-zinc-400'}>
            {t.txType === 'CREDIT' ? '+₹' : '-₹'}
          </span>
          <input
            type="number"
            step="0.01"
            value={priceDraft}
            onChange={(e) => setPriceDraft(e.target.value)}
            onBlur={savePrice}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className={`w-16 bg-transparent hover:bg-zinc-900 focus:bg-zinc-900 border border-transparent focus:border-zinc-700 rounded px-1 py-0.5 text-right font-mono focus:outline-none ${
              t.txType === 'CREDIT' ? 'text-emerald-400' : 'text-zinc-100'
            }`}
          />
        </div>
      </td>

      {/* Delete Button */}
      <td className="py-2 px-2 text-right">
        <button
          onClick={() => onDelete(t)}
          className="text-zinc-600 hover:text-red-400 p-1"
          title="Delete transaction"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

interface LedgerTabProps {
  notify: NotifyFn;
  initialDrilldown?: { place?: string; category?: string; date?: string } | null;
  onClearDrilldown?: () => void;
}

export function LedgerTab({
  notify,
  initialDrilldown,
  onClearDrilldown,
}: LedgerTabProps) {
  const {
    transactions,
    addTransaction,
    updateTransaction,
    reapplyAliasesToExisting,
    deleteTransaction,
    clearAllTransactions,
  } = useExpenseStore();

  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerPlaceFilter, setLedgerPlaceFilter] = useState<string>('ALL');
  const [ledgerCatFilter, setLedgerCatFilter] = useState<string>('ALL');
  const [ledgerModeFilter, setLedgerModeFilter] = useState<string>('ALL');
  const [ledgerFlowFilter, setLedgerFlowFilter] = useState<'ALL' | 'DEBIT' | 'CREDIT'>('ALL');
  const [rememberEdits, setRememberEdits] = useState(true);

  useEffect(() => {
    if (!initialDrilldown) return;
    if (initialDrilldown.place) {
      setLedgerPlaceFilter(initialDrilldown.place);
      setLedgerFlowFilter('DEBIT');
    }
    if (initialDrilldown.category) {
      setLedgerCatFilter(initialDrilldown.category);
      setLedgerFlowFilter('DEBIT');
    }
    if (initialDrilldown.date) {
      setLedgerSearch(initialDrilldown.date);
    }
    onClearDrilldown?.();
  }, [initialDrilldown, onClearDrilldown]);

  const filteredLedger = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();
    return transactions.filter((t) => {
      if (ledgerFlowFilter !== 'ALL' && t.txType !== ledgerFlowFilter) return false;
      if (ledgerPlaceFilter !== 'ALL') {
        const p = t.txType === 'CREDIT' ? t.inflowCat : t.place;
        if (p !== ledgerPlaceFilter) return false;
      }
      if (ledgerCatFilter !== 'ALL' && t.cat !== ledgerCatFilter) return false;
      if (ledgerModeFilter !== 'ALL' && t.mode !== ledgerModeFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.place.toLowerCase().includes(q) ||
        t.cat.toLowerCase().includes(q) ||
        t.mode.toLowerCase().includes(q) ||
        t.date.includes(q)
      );
    });
  }, [
    transactions,
    ledgerSearch,
    ledgerPlaceFilter,
    ledgerCatFilter,
    ledgerModeFilter,
    ledgerFlowFilter,
  ]);

  const filteredLedgerStats = useMemo(() => {
    const debits = filteredLedger
      .filter((t) => t.txType === 'DEBIT')
      .reduce((s, t) => s + t.price, 0);
    const credits = filteredLedger
      .filter((t) => t.txType === 'CREDIT')
      .reduce((s, t) => s + t.price, 0);
    return { debits, credits, count: filteredLedger.length };
  }, [filteredLedger]);

  return (
    <div className="space-y-3 w-full overflow-hidden animate-pane">
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3 space-y-2.5">
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2">
          <div className="flex items-center gap-2 flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <input
              value={ledgerSearch}
              onChange={(e) => setLedgerSearch(e.target.value)}
              placeholder="Search merchant, item, date (YYYY-MM-DD)..."
              className="bg-transparent text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none w-full"
            />
            {ledgerSearch && (
              <button
                onClick={() => setLedgerSearch('')}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer mr-1">
              <input
                type="checkbox"
                checked={rememberEdits}
                onChange={(e) => setRememberEdits(e.target.checked)}
                className="rounded border-zinc-700"
              />
              <span>Remember payee spot/cat edits</span>
            </label>

            <button
              onClick={() => {
                triggerHaptic('success');
                reapplyAliasesToExisting();
                notify(
                  'Smart Merchant Rules Applied',
                  'Mapped Vending Bros, Namonarayan, Shubhan Print & fixed UPI modes',
                  'success'
                );
              }}
              className="inline-flex items-center gap-1 bg-zinc-100 text-zinc-950 px-2.5 py-1.5 rounded-md text-xs font-medium shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" /> Auto-Clean
            </button>

            {transactions.length > 0 && (
              <button
                onClick={() => {
                  triggerHaptic('warning');
                  if (confirm('Clear all entries?')) {
                    clearAllTransactions();
                    notify('Ledger cleared', 'All entries removed', 'info');
                  }
                }}
                className="text-xs text-zinc-500 hover:text-red-400 px-2 py-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
          <Filter className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <select
            value={ledgerPlaceFilter}
            onChange={(e) => {
              triggerHaptic('light');
              setLedgerPlaceFilter(e.target.value);
            }}
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 shrink-0"
          >
            <option value="ALL">Spot: All Locations</option>
            {PLACES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            value={ledgerCatFilter}
            onChange={(e) => {
              triggerHaptic('light');
              setLedgerCatFilter(e.target.value);
            }}
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 shrink-0"
          >
            <option value="ALL">Category: All</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={ledgerModeFilter}
            onChange={(e) => {
              triggerHaptic('light');
              setLedgerModeFilter(e.target.value);
            }}
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 shrink-0"
          >
            <option value="ALL">Mode: All</option>
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={ledgerFlowFilter}
            onChange={(e) => {
              triggerHaptic('light');
              setLedgerFlowFilter(e.target.value as 'ALL' | 'DEBIT' | 'CREDIT');
            }}
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 shrink-0"
          >
            <option value="ALL">Flow: Debits & Credits</option>
            <option value="DEBIT">Expenses Only (Debit)</option>
            <option value="CREDIT">Inflows Only (Credit)</option>
          </select>

          {(ledgerPlaceFilter !== 'ALL' ||
            ledgerCatFilter !== 'ALL' ||
            ledgerModeFilter !== 'ALL' ||
            ledgerFlowFilter !== 'ALL' ||
            ledgerSearch !== '') && (
            <button
              onClick={() => {
                triggerHaptic('light');
                setLedgerPlaceFilter('ALL');
                setLedgerCatFilter('ALL');
                setLedgerModeFilter('ALL');
                setLedgerFlowFilter('ALL');
                setLedgerSearch('');
              }}
              className="text-xs text-zinc-400 hover:text-white underline shrink-0 px-1"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Live Filtered Summary Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/70 text-[11px] font-mono text-zinc-400">
          <span>
            Showing <strong className="text-zinc-100">{filteredLedgerStats.count}</strong> of{' '}
            {transactions.length} rows (Click any description or amount to edit)
          </span>
          <div className="flex items-center gap-3">
            <span>
              Filtered Spend:{' '}
              <strong className="text-zinc-100">₹{fmt(filteredLedgerStats.debits)}</strong>
            </span>
            {filteredLedgerStats.credits > 0 && (
              <span>
                Inflows:{' '}
                <strong className="text-emerald-400">+₹{fmt(filteredLedgerStats.credits)}</strong>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="border border-zinc-800 rounded-lg overflow-x-auto w-full">
        <table className="w-full text-left text-xs min-w-[650px]">
          <thead className="border-b border-zinc-800 text-zinc-500 font-mono uppercase text-[10px] bg-zinc-900/40">
            <tr>
              <th className="py-2 px-2.5">Date</th>
              <th className="py-2 px-2.5">Description (Click to Edit)</th>
              <th className="py-2 px-2.5">Place / Inflow</th>
              <th className="py-2 px-2.5">Category</th>
              <th className="py-2 px-2.5">Mode</th>
              <th className="py-2 px-2.5 text-right">Amount</th>
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 font-mono">
            {filteredLedger.map((t) => (
              <LedgerRow
                key={t.id}
                t={t}
                rememberEdits={rememberEdits}
                onUpdate={updateTransaction}
                notify={notify}
                onDelete={(tx) => {
                  triggerHaptic('warning');
                  const backup = { ...tx };
                  deleteTransaction(tx.id);
                  notify(`Deleted ${tx.name}`, `₹${fmt(tx.price)} removed`, 'info', () => {
                    addTransaction(backup);
                    triggerHaptic('success');
                  });
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}