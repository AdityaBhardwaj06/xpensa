import React, { useState } from 'react';
import { useExpenseStore } from '../store/useExpenseStore';
import type { PaymentMode, InflowCategory } from '../types/expense';
import { CAMPUS_PRESETS } from '../types/expense';
import { INFLOW_TYPES, PAYMENT_MODES, fmt } from '../constants/taxonomy';
import type { NotifyFn } from '../constants/taxonomy';
import { triggerHaptic } from '../utils/feedback';

interface QuickEntryTabProps {
  notify: NotifyFn;
}

export const QuickEntryTab: React.FC<QuickEntryTabProps> = ({ notify }) => {
  const { quickMode, setQuickMode, addTransaction, matchPayeeToAlias } = useExpenseStore();

  const [shorthand, setShorthand] = useState('');
  const [flashedPreset, setFlashedPreset] = useState<string | null>(null);

  // Manual Inflow State
  const [inflowAmt, setInflowAmt] = useState('');
  const [inflowSource, setInflowSource] = useState<InflowCategory>('Parent Top-up');
  const [inflowNote, setInflowNote] = useState('');

  const handleShorthandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shorthand.trim()) {
      triggerHaptic('error');
      notify('Empty command', 'Type item + amount (e.g. redi maggi 40 su)', 'error');
      return;
    }
    const lower = shorthand.toLowerCase();
    const priceMatch = shorthand.match(/(\d+(?:\.\d{1,2})?)/);
    const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
    if (price <= 0) {
      triggerHaptic('error');
      notify('Missing price', 'Include a valid ₹ number (e.g. maggi 40)', 'error');
      return;
    }

    let mode: PaymentMode = quickMode;
    if (/\bsu\b/.test(lower)) mode = 'SU';
    else if (/\bid\b|\bswd\b/.test(lower)) mode = 'ID';
    else if (/\bcash\b/.test(lower)) mode = 'Cash';
    else if (/\bparents?\b/.test(lower)) mode = 'Parents';
    else if (/\bupi\b/.test(lower)) mode = 'UPI';

    const indiv = /\bsplit\b/.test(lower) ? 'Split' : 'Solo';
    const matched = matchPayeeToAlias(shorthand, shorthand, 'DEBIT');

    const cleanName =
      shorthand
        .replace(/\b(su|upi|id|swd|cash|parents|split)\b/gi, '')
        .replace(/\d+(?:\.\d{1,2})?/, '')
        .trim() || matched.place;

    addTransaction({
      date: new Date().toISOString().slice(0, 10),
      name: cleanName,
      rawPayee: cleanName.toUpperCase(),
      price,
      txType: 'DEBIT',
      mode,
      cat: matched.cat,
      subcat: matched.subcat,
      place: matched.place,
      indiv,
      note: '',
      status: 'completed',
    });

    triggerHaptic('success');
    notify(`Recorded ₹${price} · ${cleanName}`, `${matched.place} · ${mode}`, 'success');
    setShorthand('');
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-pane">
      {/* Command Entry Bar */}
      <form
        onSubmit={handleShorthandSubmit}
        className="border border-zinc-800 rounded-lg p-3.5 sm:p-4 bg-zinc-900/40 space-y-2"
      >
        <div className="flex justify-between items-center">
          <label className="text-xs font-medium text-zinc-300">Command Entry</label>
          <span className="text-[10px] text-zinc-500 font-mono">
            [item] [amount] [su|upi|id|cash]
          </span>
        </div>
        <div className="flex gap-2">
          <input
            value={shorthand}
            onChange={(e) => setShorthand(e.target.value)}
            placeholder="e.g. redi maggi 80 su   or   cnot pasta 140 upi"
            className="flex-1 min-w-0 bg-[#09090b] border border-zinc-800 rounded-md px-3 py-2 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
          />
          <button
            type="submit"
            className="bg-zinc-100 hover:bg-white text-zinc-950 px-4 py-2 rounded-md font-medium text-xs shrink-0 cursor-pointer"
          >
            Record
          </button>
        </div>
      </form>

      {/* 1-Tap Presets Section */}
      <div className="border border-zinc-800 rounded-lg p-3.5 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider shrink-0">
            Active Mode:
          </span>
          <div className="inline-flex p-0.5 bg-zinc-900 border border-zinc-800 rounded-md shrink-0">
            {PAYMENT_MODES.map((m) => (
              <button
                key={m}
                onClick={() => {
                  triggerHaptic('light');
                  setQuickMode(m);
                  notify(`Mode switched to ${m}`, '1-Tap presets updated', 'info');
                }}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded-sm transition cursor-pointer ${
                  quickMode === m ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {CAMPUS_PRESETS.map((p) => {
            const isFlashed = flashedPreset === p.name;
            return (
              <button
                key={p.name}
                onClick={() => {
                  triggerHaptic('success');
                  setFlashedPreset(p.name);
                  setTimeout(() => setFlashedPreset(null), 350);

                  addTransaction({
                    date: new Date().toISOString().slice(0, 10),
                    name: p.name,
                    rawPayee: p.place.toUpperCase(),
                    price: p.price,
                    txType: 'DEBIT',
                    mode: quickMode,
                    cat: p.cat,
                    subcat: p.subcat,
                    place: p.place,
                    indiv: 'Solo',
                    note: '',
                    status: 'completed',
                  });

                  notify(
                    `Added ${p.name} (₹${p.price})`,
                    `Logged under ${p.place} · ${quickMode}`,
                    'success'
                  );
                }}
                className={`border rounded-md p-2.5 text-left transition cursor-pointer ${
                  isFlashed
                    ? 'border-zinc-100 bg-zinc-800 scale-[0.97]'
                    : 'border-zinc-800/90 hover:border-zinc-600 bg-zinc-900/30'
                }`}
              >
                <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono">
                  <span>{p.place}</span>
                  <span>{quickMode}</span>
                </div>
                <div className="text-xs font-medium text-zinc-200 mt-1 truncate">
                  {p.name}
                </div>
                <div className="text-xs sm:text-sm font-mono font-semibold text-zinc-100 mt-0.5">
                  ₹{p.price}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Manual Inflow Section */}
      <div className="border border-zinc-800 rounded-lg p-3.5 sm:p-4 space-y-2.5">
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Log Inflow / Top-up
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input
            type="number"
            placeholder="Amount (₹)"
            value={inflowAmt}
            onChange={(e) => setInflowAmt(e.target.value)}
            className="bg-[#09090b] border border-zinc-800 rounded-md px-3 py-1.5 text-xs font-mono"
          />
          <select
            value={inflowSource}
            onChange={(e) => setInflowSource(e.target.value as InflowCategory)}
            className="bg-[#09090b] border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-200"
          >
            {INFLOW_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Note (optional)"
            value={inflowNote}
            onChange={(e) => setInflowNote(e.target.value)}
            className="bg-[#09090b] border border-zinc-800 rounded-md px-3 py-1.5 text-xs"
          />
          <button
            onClick={() => {
              const price = parseFloat(inflowAmt);
              if (!price || price <= 0) {
                triggerHaptic('error');
                notify('Invalid amount', 'Enter an inflow amount greater than ₹0', 'error');
                return;
              }
              triggerHaptic('success');
              addTransaction({
                date: new Date().toISOString().slice(0, 10),
                name: inflowNote ? `${inflowSource} · ${inflowNote}` : inflowSource,
                price,
                txType: 'CREDIT',
                mode: 'UPI',
                cat: 'Miscellaneous',
                subcat: 'Inflow',
                place: 'Bank Transfer',
                indiv: 'Solo',
                inflowCat: inflowSource,
                note: inflowNote,
                status: 'completed',
              });
              notify(`+₹${fmt(price)} added to wallet`, inflowSource, 'success');
              setInflowAmt('');
              setInflowNote('');
            }}
            className="bg-zinc-100 hover:bg-white text-zinc-950 rounded-md font-medium text-xs py-1.5 cursor-pointer"
          >
            + Add to Balance
          </button>
        </div>
      </div>
    </div>
  );
};
