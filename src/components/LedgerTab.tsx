import { useState, useMemo, useEffect } from 'react';
import { Search, X, Sparkles, Filter, Trash2, Check, Calendar } from 'lucide-react';
import { useExpenseStore } from '../store/useExpenseStore';
import { getEffectiveSpend } from '../types/expense';
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
  const effectiveShare = getEffectiveSpend(t);
  const [nameDraft, setNameDraft] = useState(t.name);
  const [priceDraft, setPriceDraft] = useState(String(t.price));
  const [shareDraft, setShareDraft] = useState(String(effectiveShare));
  const [isEditingName, setIsEditingName] = useState(false);

  useEffect(() => {
    setNameDraft(t.name);
  }, [t.name]);

  useEffect(() => {
    setPriceDraft(String(t.price));
  }, [t.price]);

  useEffect(() => {
    setShareDraft(String(getEffectiveSpend(t)));
  }, [t.price, t.myShare, t.indiv]);

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
    const ratio = t.myShare !== undefined && t.price > 0 ? t.myShare / t.price : 1;
    const updatedShare =
      t.indiv === 'Split' ? Number((parsed * ratio).toFixed(2)) : parsed;
    onUpdate(t.id, { price: parsed, myShare: updatedShare }, false);
    notify('Total Paid updated', `₹${fmt(t.price)} → ₹${fmt(parsed)}`, 'success');
  };

  const saveMyShare = () => {
    const parsed = parseFloat(shareDraft);
    if (isNaN(parsed) || parsed < 0 || parsed > t.price) {
      setShareDraft(String(effectiveShare));
      return;
    }
    triggerHaptic('medium');
    const isNowSplit = parsed < t.price;
    onUpdate(
      t.id,
      {
        myShare: parsed,
        indiv: isNowSplit ? 'Split' : 'Solo',
      },
      false
    );
    notify(
      isNowSplit ? `Personal Share set to ₹${fmt(parsed)}` : 'Reverted to 100% Solo expense',
      `Total bill was ₹${fmt(t.price)}`,
      'success'
    );
  };

  const cycleSplitRatio = () => {
    triggerHaptic('light');
    const currentCount = t.splitCount || (t.indiv === 'Split' ? 2 : 1);
    const nextCount = currentCount >= 4 ? 1 : currentCount + 1;
    const newShare = Number((t.price / nextCount).toFixed(2));
    onUpdate(
      t.id,
      {
        indiv: nextCount === 1 ? 'Solo' : 'Split',
        splitCount: nextCount,
        myShare: newShare,
      },
      false
    );
    notify(
      nextCount === 1
        ? `Set to Solo (₹${fmt(t.price)})`
        : `Split ÷${nextCount}: Your share is ₹${fmt(newShare)}`,
      t.name,
      'info'
    );
  };

  return (
    <tr className="hover:bg-zinc-900/40 group">
      {/* Interactive Date Picker Modifier */}
      <td className="py-2 px-2.5 text-zinc-300 whitespace-nowrap text-[11px]">
        <label className="relative inline-flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-600 rounded px-2 py-1 cursor-pointer">
          <Calendar className="w-3 h-3 text-emerald-400 shrink-0" />
          <input
            type="date"
            value={t.date}
            onClick={(e) => {
              try {
                (e.currentTarget as HTMLInputElement).showPicker?.();
              } catch {}
            }}
            onChange={(e) => {
              if (!e.target.value) return;
              triggerHaptic('medium');
              onUpdate(t.id, { date: e.target.value }, false);
              notify('Date modified', `${t.name} → ${e.target.value}`, 'success');
            }}
            className="bg-transparent text-zinc-200 focus:text-white focus:outline-none font-mono text-[11px] w-[96px] cursor-pointer [color-scheme:dark]"
          />
        </label>
      </td>

      {/* Editable Description */}
      <td className="py-2 px-2.5 font-sans min-w-[165px] max-w-[220px]">
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

      {/* Place / Inflow Source */}
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

      {/* Category */}
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

      {/* Mode */}
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

      {/* Total Paid (Bank Outflow) */}
      <td className="py-2 px-2.5 text-right font-mono font-medium whitespace-nowrap">
        <div className="inline-flex items-center justify-end">
          <span className={t.txType === 'CREDIT' ? 'text-emerald-400' : 'text-zinc-500'}>
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
              t.txType === 'CREDIT' ? 'text-emerald-400' : 'text-zinc-300'
            }`}
          />
        </div>
      </td>

      {/* Personal Share & 1-Tap Split Cycle */}
      <td className="py-2 px-2.5 text-right font-mono whitespace-nowrap">
        {t.txType === 'CREDIT' ? (
          <span className="text-[10px] text-zinc-600">—</span>
        ) : (
          <div className="inline-flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={cycleSplitRatio}
              title="Tap to cycle Solo → ÷2 → ÷3 → ÷4"
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${
                effectiveShare < t.price
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300'
              }`}
            >
              {effectiveShare < t.price
                ? `÷${t.splitCount || Math.round(t.price / Math.max(effectiveShare, 1))}`
                : 'Solo'}
            </button>
            <div className="inline-flex items-center">
              <span className="text-zinc-500 text-[11px]">₹</span>
              <input
                type="number"
                step="0.01"
                value={shareDraft}
                onChange={(e) => setShareDraft(e.target.value)}
                onBlur={saveMyShare}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                title="Edit your actual personal share of this bill"
                className={`w-14 bg-zinc-900/60 hover:bg-zinc-900 focus:bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded px-1 py-0.5 text-right font-mono text-xs focus:outline-none ${
                  effectiveShare < t.price ? 'text-emerald-400 font-semibold' : 'text-zinc-100'
                }`}
              />
            </div>
          </div>
        )}
      </td>

      {/* Delete */}
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
  const [ledgerDateFilter, setLedgerDateFilter] = useState<string>('');
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
      setLedgerDateFilter(initialDrilldown.date);
    }
    onClearDrilldown?.();
  }, [initialDrilldown, onClearDrilldown]);

  const filteredLedger = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();
    return transactions.filter((t) => {
      if (ledgerDateFilter && t.date !== ledgerDateFilter) return false;
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
    ledgerDateFilter,
    ledgerPlaceFilter,
    ledgerCatFilter,
    ledgerModeFilter,
    ledgerFlowFilter,
  ]);

  const filteredLedgerStats = useMemo(() => {
    const debits = filteredLedger.filter((t) => t.txType === 'DEBIT');
    const totalPaid = debits.reduce((s, t) => s + t.price, 0);
    const personalSpend = debits.reduce((s, t) => s + getEffectiveSpend(t), 0);
    const credits = filteredLedger
      .filter((t) => t.txType === 'CREDIT')
      .reduce((s, t) => s + t.price, 0);
    return { totalPaid, personalSpend, credits, count: filteredLedger.length };
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

          {/* Controlled Date Filter */}
          <div className="inline-flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 shrink-0">
            <Calendar className="w-3 h-3 text-zinc-400" />
            <input
              type="date"
              value={ledgerDateFilter}
              onClick={(e) => {
                try {
                  (e.currentTarget as HTMLInputElement).showPicker?.();
                } catch {}
              }}
              onChange={(e) => {
                triggerHaptic('light');
                setLedgerDateFilter(e.target.value);
              }}
              className="bg-transparent text-xs font-mono text-zinc-200 focus:outline-none cursor-pointer [color-scheme:dark]"
            />
            {ledgerDateFilter && (
              <button
                type="button"
                onClick={() => setLedgerDateFilter('')}
                className="text-zinc-500 hover:text-zinc-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {(ledgerPlaceFilter !== 'ALL' ||
            ledgerCatFilter !== 'ALL' ||
            ledgerModeFilter !== 'ALL' ||
            ledgerFlowFilter !== 'ALL' ||
            ledgerDateFilter !== '' ||
            ledgerSearch !== '') && (
            <button
              onClick={() => {
                triggerHaptic('light');
                setLedgerPlaceFilter('ALL');
                setLedgerCatFilter('ALL');
                setLedgerModeFilter('ALL');
                setLedgerFlowFilter('ALL');
                setLedgerDateFilter('');
                setLedgerSearch('');
              }}
              className="text-xs text-zinc-400 hover:text-white underline shrink-0 px-1"
            >
              Reset
            </button>
          )}
        </div>

        {/* Live Filtered Summary Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/70 text-[11px] font-mono text-zinc-400">
          <span>
            Showing <strong className="text-zinc-100">{filteredLedgerStats.count}</strong> rows
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Your True Spend:{' '}
              <strong className="text-emerald-400">
                ₹{fmt(filteredLedgerStats.personalSpend)}
              </strong>
            </span>
            {filteredLedgerStats.totalPaid !== filteredLedgerStats.personalSpend && (
              <span>
                Total Bill Paid:{' '}
                <strong className="text-zinc-300">₹{fmt(filteredLedgerStats.totalPaid)}</strong>
              </span>
            )}
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
        <table className="w-full text-left text-xs min-w-[740px]">
          <thead className="border-b border-zinc-800 text-zinc-500 font-mono uppercase text-[10px] bg-zinc-900/40">
            <tr>
              <th className="py-2 px-2.5">Date (Tap to Edit)</th>
              <th className="py-2 px-2.5">Description</th>
              <th className="py-2 px-2.5">Place / Inflow</th>
              <th className="py-2 px-2.5">Category</th>
              <th className="py-2 px-2.5">Mode</th>
              <th className="py-2 px-2.5 text-right">Bill Paid</th>
              <th className="py-2 px-2.5 text-right">My True Share</th>
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