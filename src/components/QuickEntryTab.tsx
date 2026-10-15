import { useState } from 'react';
import { Calendar, Users, Settings2, Plus, Trash2, RotateCcw } from 'lucide-react';
import { useExpenseStore } from '../store/useExpenseStore';
import type { PaymentMode, InflowCategory, ExpenseCategory } from '../types/expense';
import { PLACES, CATEGORIES, INFLOW_TYPES, PAYMENT_MODES, fmt } from '../constants/taxonomy';
import type { NotifyFn } from '../constants/taxonomy';
import { triggerHaptic } from '../utils/feedback';

interface QuickEntryTabProps {
  notify: NotifyFn;
}

export function QuickEntryTab({ notify }: QuickEntryTabProps) {
  const {
    presets,
    quickMode,
    setQuickMode,
    addTransaction,
    addPreset,
    updatePreset,
    deletePreset,
    resetDefaultPresets,
    matchPayeeToAlias,
  } = useExpenseStore();

  const todayIso = new Date().toISOString().slice(0, 10);
  const yesterdayIso = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const [entryDate, setEntryDate] = useState<string>(todayIso);
  const [shorthand, setShorthand] = useState('');
  const [flashedPreset, setFlashedPreset] = useState<string | null>(null);

  // Preset Editor Mode State
  const [isEditingPresets, setIsEditingPresets] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetPrice, setNewPresetPrice] = useState('');
  const [newPresetPlace, setNewPresetPlace] = useState('Amul');
  const [newPresetCat, setNewPresetCat] = useState<ExpenseCategory>('Food');

  // Group Split State
  const [splitWay, setSplitWay] = useState<number>(1);
  const [customShare, setCustomShare] = useState<string>('');

  // Inflow State
  const [inflowAmt, setInflowAmt] = useState('');
  const [inflowSource, setInflowSource] = useState<InflowCategory>('Parent Top-up');
  const [inflowNote, setInflowNote] = useState('');

  const computeMyShare = (
    totalPrice: number,
    cmdOverrideSplit?: number
  ): {
    indiv: 'Solo' | 'Split';
    myShare: number;
    splitCount: number;
  } => {
    const activeSplit = cmdOverrideSplit || splitWay;
    if (customShare.trim() !== '') {
      const parsedCustom = parseFloat(customShare);
      if (!isNaN(parsedCustom) && parsedCustom >= 0 && parsedCustom <= totalPrice) {
        return {
          indiv: parsedCustom < totalPrice ? 'Split' : 'Solo',
          myShare: parsedCustom,
          splitCount: activeSplit > 1 ? activeSplit : 2,
        };
      }
    }
    if (activeSplit > 1) {
      return {
        indiv: 'Split',
        myShare: Number((totalPrice / activeSplit).toFixed(2)),
        splitCount: activeSplit,
      };
    }
    return { indiv: 'Solo', myShare: totalPrice, splitCount: 1 };
  };

  const handleShorthandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shorthand.trim()) {
      triggerHaptic('error');
      notify('Empty command', 'Type item + amount (e.g. cnot pasta 300 /3)', 'error');
      return;
    }

    const lower = shorthand.toLowerCase();
    const splitMatch = lower.match(/(?:\/|split\s*)([2-9]\d?)/);
    const cmdSplitCount = splitMatch ? parseInt(splitMatch[1], 10) : undefined;
    const cleanedForPrice = shorthand.replace(/(?:\/|split\s*)[2-9]\d?/gi, '');

    const priceMatch = cleanedForPrice.match(/(\d+(?:\.\d{1,2})?)/);
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

    const matched = matchPayeeToAlias(cleanedForPrice, cleanedForPrice, 'DEBIT');
    const cleanName =
      cleanedForPrice
        .replace(/\b(su|upi|id|swd|cash|parents|split)\b/gi, '')
        .replace(/\d+(?:\.\d{1,2})?/, '')
        .trim() || matched.place;

    const { indiv, myShare, splitCount } = computeMyShare(
      price,
      cmdSplitCount || (/\bsplit\b/.test(lower) ? 2 : undefined)
    );

    addTransaction({
      date: entryDate,
      name: cleanName,
      rawPayee: cleanName.toUpperCase(),
      price,
      myShare,
      splitCount,
      txType: 'DEBIT',
      mode,
      cat: matched.cat,
      subcat: matched.subcat,
      place: matched.place,
      indiv,
      note: indiv === 'Split' ? `Paid ₹${price} (My share ₹${myShare})` : '',
      status: 'completed',
    });

    triggerHaptic('success');
    notify(
      indiv === 'Split'
        ? `Split Logged: Paid ₹${price} (Your Share ₹${myShare})`
        : `Recorded ₹${price} · ${cleanName}`,
      `${matched.place} · ${mode} · ${entryDate}`,
      'success'
    );
    setShorthand('');
    setCustomShare('');
  };

  return (
    <div className="space-y-4 sm:space-y-5 animate-pane">
      {/* Date Picker & Group Split Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900/30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-zinc-300 font-medium">
            <Calendar className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>Date:</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setEntryDate(todayIso);
              }}
              className={`px-2 py-1 text-[11px] font-mono rounded transition ${
                entryDate === todayIso
                  ? 'bg-zinc-100 text-zinc-950 font-semibold'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setEntryDate(yesterdayIso);
              }}
              className={`px-2 py-1 text-[11px] font-mono rounded transition ${
                entryDate === yesterdayIso
                  ? 'bg-zinc-100 text-zinc-950 font-semibold'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
              }`}
            >
              Yesterday
            </button>
            <input
              type="date"
              value={entryDate}
              onClick={(e) => {
                try {
                  (e.currentTarget as any).showPicker?.();
                } catch {}
              }}
              onChange={(e) => {
                if (e.target.value) {
                  triggerHaptic('light');
                  setEntryDate(e.target.value);
                }
              }}
              className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600 cursor-pointer [color-scheme:dark]"
            />
          </div>
        </div>

        <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900/30 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-medium">
            <Users className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Bill Split:</span>
          </div>

          <div className="flex items-center gap-1.5">
            {([1, 2, 3, 4] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSplitWay(n);
                  setCustomShare('');
                }}
                className={`px-2.5 py-1 text-[11px] font-mono rounded transition ${
                  splitWay === n && !customShare
                    ? 'bg-emerald-500 text-zinc-950 font-semibold'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                }`}
              >
                {n === 1 ? 'Solo (100%)' : `÷${n}`}
              </button>
            ))}

            <input
              type="number"
              placeholder="My Share ₹"
              value={customShare}
              onChange={(e) => setCustomShare(e.target.value)}
              className="w-24 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-emerald-400 placeholder:text-zinc-600 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Command Entry Bar */}
      <form
        onSubmit={handleShorthandSubmit}
        className="border border-zinc-800 rounded-lg p-3.5 sm:p-4 bg-zinc-900/40 space-y-2"
      >
        <div className="flex justify-between items-center">
          <label className="text-xs font-medium text-zinc-300">
            Command Entry <span className="text-zinc-500 font-mono">({entryDate})</span>
          </label>
          <span className="text-[10px] text-zinc-500 font-mono">
            Add <code className="text-emerald-400">/2</code> or <code className="text-emerald-400">/3</code> to split group bills
          </span>
        </div>
        <div className="flex gap-2">
          <input
            value={shorthand}
            onChange={(e) => setShorthand(e.target.value)}
            placeholder="e.g. cnot dinner 600 upi /3   or   redi maggi 40 su"
            className="flex-1 min-w-0 bg-[#09090b] border border-zinc-800 rounded-md px-3 py-2 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
          />
          <button
            type="submit"
            className="bg-zinc-100 hover:bg-white text-zinc-950 px-4 py-2 rounded-md font-medium text-xs shrink-0"
          >
            Record
          </button>
        </div>
      </form>

      {/* Customizable 1-Tap Presets */}
      <div className="border border-zinc-800 rounded-lg p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 py-0.5">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider shrink-0">
              Mode:
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
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded-sm transition ${
                    quickMode === m ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setIsEditingPresets(!isEditingPresets);
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition ${
              isEditingPresets
                ? 'bg-emerald-500 text-zinc-950 border-emerald-400'
                : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            {isEditingPresets ? 'Done Customizing' : 'Customize Presets'}
          </button>
        </div>

        {/* Preset Customization Drawer */}
        {isEditingPresets && (
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-200">
                Add New Custom Preset (Saved to Cloud DB)
              </span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('warning');
                  if (confirm('Reset presets to default campus items?')) {
                    resetDefaultPresets();
                    notify('Presets reset', 'Restored default campus presets', 'info');
                  }
                }}
                className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200"
              >
                <RotateCcw className="w-3 h-3" /> Reset Defaults
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <input
                type="text"
                placeholder="Item Name (e.g. Cold Coffee)"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100"
              />
              <input
                type="number"
                placeholder="Price ₹ (e.g. 45)"
                value={newPresetPrice}
                onChange={(e) => setNewPresetPrice(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs font-mono text-zinc-100"
              />
              <select
                value={newPresetPlace}
                onChange={(e) => setNewPresetPlace(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
              >
                {PLACES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select
                value={newPresetCat}
                onChange={(e) => setNewPresetCat(e.target.value as ExpenseCategory)}
                className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const price = parseFloat(newPresetPrice);
                  if (!newPresetName.trim() || isNaN(price) || price <= 0) {
                    triggerHaptic('error');
                    notify('Incomplete preset', 'Enter a valid name and ₹ price', 'error');
                    return;
                  }
                  triggerHaptic('success');
                  addPreset({
                    name: newPresetName.trim(),
                    price,
                    place: newPresetPlace,
                    cat: newPresetCat,
                    subcat: newPresetPlace,
                  });
                  notify('Preset Added', `${newPresetName} (₹${price}) saved to DB`, 'success');
                  setNewPresetName('');
                  setNewPresetPrice('');
                }}
                className="inline-flex items-center justify-center gap-1 bg-zinc-100 text-zinc-950 rounded px-3 py-1.5 text-xs font-semibold col-span-2 sm:col-span-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Preset
              </button>
            </div>
          </div>
        )}

        {/* Presets Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
          {presets.map((p) => {
            const isFlashed = flashedPreset === p.id;
            const { indiv, myShare, splitCount } = computeMyShare(p.price);

            if (isEditingPresets) {
              return (
                <div
                  key={p.id}
                  className="border border-zinc-700 bg-zinc-900/70 rounded-md p-2.5 space-y-1.5"
                >
                  <div className="flex justify-between items-center gap-1">
                    <select
                      value={p.place}
                      onChange={(e) => updatePreset(p.id, { place: e.target.value })}
                      className="bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5 text-[10px] text-zinc-300 w-full"
                    >
                      {PLACES.map((pl) => (
                        <option key={pl} value={pl}>
                          {pl}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('warning');
                        deletePreset(p.id);
                        notify('Preset deleted', p.name, 'info');
                      }}
                      className="text-zinc-500 hover:text-red-400 p-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => updatePreset(p.id, { name: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-xs text-zinc-100"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-mono text-zinc-500">₹</span>
                    <input
                      type="number"
                      value={p.price}
                      onChange={(e) =>
                        updatePreset(p.id, { price: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-xs font-mono text-zinc-100"
                    />
                  </div>
                </div>
              );
            }

            return (
              <button
                key={p.id}
                onClick={() => {
                  triggerHaptic('success');
                  setFlashedPreset(p.id);
                  setTimeout(() => setFlashedPreset(null), 350);

                  addTransaction({
                    date: entryDate,
                    name: p.name,
                    rawPayee: p.place.toUpperCase(),
                    price: p.price,
                    myShare,
                    splitCount,
                    txType: 'DEBIT',
                    mode: quickMode,
                    cat: p.cat,
                    subcat: p.subcat,
                    place: p.place,
                    indiv,
                    note: indiv === 'Split' ? `Paid ₹${p.price} (My share ₹${myShare})` : '',
                    status: 'completed',
                  });

                  notify(
                    indiv === 'Split'
                      ? `Added ${p.name}: Paid ₹${p.price} (Your Share ₹${myShare})`
                      : `Added ${p.name} (₹${p.price})`,
                    `${p.place} · ${quickMode} · ${entryDate}`,
                    'success'
                  );
                }}
                className={`border rounded-md p-2.5 text-left transition ${
                  isFlashed
                    ? 'border-zinc-100 bg-zinc-800 scale-[0.97]'
                    : 'border-zinc-800/90 hover:border-zinc-600 bg-zinc-900/30'
                }`}
              >
                <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono">
                  <span>{p.place}</span>
                  <span>{quickMode}</span>
                </div>
                <div className="text-xs font-medium text-zinc-200 mt-1 truncate">{p.name}</div>
                <div className="flex items-baseline justify-between mt-0.5">
                  <span className="text-xs sm:text-sm font-mono font-semibold text-zinc-100">
                    ₹{p.price}
                  </span>
                  {indiv === 'Split' && (
                    <span className="text-[10px] font-mono text-emerald-400">
                      Mine: ₹{myShare}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Inflow Logger */}
      <div className="border border-zinc-800 rounded-lg p-3.5 sm:p-4 space-y-2.5">
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Log Inflow / Friend Split Settlement ({entryDate})
          </span>
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
            className="bg-[#09090b] border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs"
          >
            {INFLOW_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Friend / Note (optional)"
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
                date: entryDate,
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
              notify(`+₹${fmt(price)} added to wallet`, `${inflowSource} (${entryDate})`, 'success');
              setInflowAmt('');
              setInflowNote('');
            }}
            className="bg-zinc-100 text-zinc-950 rounded-md font-medium text-xs py-1.5"
          >
            + Add to Balance
          </button>
        </div>
      </div>
    </div>
  );
}