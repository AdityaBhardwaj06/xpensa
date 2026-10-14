import React, { useState, useMemo } from 'react';
import { useExpenseStore } from '../store/useExpenseStore';
import { parseHDFCStatementFile } from '../utils/hdfcParser';
import type { RawParsedRow } from '../utils/hdfcParser';
import type { ExpenseCategory, InflowCategory } from '../types/expense';
import { PLACES, CATEGORIES, INFLOW_TYPES, fmt } from '../constants/taxonomy';
import type { NotifyFn } from '../constants/taxonomy';
import { triggerHaptic } from '../utils/feedback';

interface StatementImporterTabProps {
  notify: NotifyFn;
  onImportSuccess: () => void;
}

export const StatementImporterTab: React.FC<StatementImporterTabProps> = ({
  notify,
  onImportSuccess,
}) => {
  const { bulkAddTransactions, upsertAlias, matchPayeeToAlias } = useExpenseStore();

  const [parsedRows, setParsedRows] = useState<RawParsedRow[]>([]);
  const [importError, setImportError] = useState<string>('');
  const [payeeOverrides, setPayeeOverrides] = useState<
    Record<
      string,
      { place: string; cat: ExpenseCategory; mode: 'UPI' | 'Card'; inflowCat?: InflowCategory }
    >
  >({});

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    try {
      const rows = await parseHDFCStatementFile(file);
      if (rows.length === 0) {
        triggerHaptic('error');
        setImportError(
          'No valid transaction rows found. Ensure file contains Date, Narration, and Debit/Credit columns.'
        );
        notify('Import failed', 'No valid transaction rows detected', 'error');
        return;
      }
      setParsedRows(rows);
      triggerHaptic('success');
      notify(`Parsed ${rows.length} rows`, 'Review unique payees below before committing', 'info');

      const initialOverrides: typeof payeeOverrides = {};
      rows.forEach((r) => {
        if (!initialOverrides[r.payee]) {
          const matched = matchPayeeToAlias(r.payee, r.note, r.txType);
          initialOverrides[r.payee] = {
            place: matched.place,
            cat: matched.cat,
            mode: r.detectedBankMode,
            inflowCat: matched.inflowCat || 'Parent Top-up',
          };
        }
      });
      setPayeeOverrides(initialOverrides);
    } catch {
      triggerHaptic('error');
      setImportError('Failed to parse statement. Please check file format.');
      notify('Parse error', 'Could not read statement file', 'error');
    }
  };

  const uniquePayeeGroups = useMemo(() => {
    const groups: Record<
      string,
      { payee: string; count: number; total: number; txType: 'DEBIT' | 'CREDIT' }
    > = {};
    parsedRows.forEach((r) => {
      const key = `${r.txType}__${r.payee}`;
      if (!groups[key]) {
        groups[key] = { payee: r.payee, count: 0, total: 0, txType: r.txType };
      }
      groups[key].count += 1;
      groups[key].total += r.amount;
    });
    return Object.values(groups).sort((a, b) => b.count - a.count);
  }, [parsedRows]);

  const commitBulkImport = () => {
    Object.entries(payeeOverrides).forEach(([payeeKey, cfg]) => {
      upsertAlias({
        key: payeeKey,
        place: cfg.place,
        cat: cfg.cat,
        subcat: cfg.place,
        txType: 'DEBIT',
        inflowCat: cfg.inflowCat,
      });
    });

    const toCommit = parsedRows.map((r) => {
      const cfg = payeeOverrides[r.payee] || {
        place: 'Other',
        cat: 'Food' as ExpenseCategory,
        mode: r.detectedBankMode,
        inflowCat: 'Parent Top-up' as InflowCategory,
      };
      return {
        date: r.date,
        name: r.note ? `${r.payee} · ${r.note}` : r.payee,
        rawPayee: r.payee,
        price: r.amount,
        txType: r.txType,
        mode: cfg.mode,
        cat: cfg.cat,
        subcat: cfg.place,
        place: r.txType === 'CREDIT' ? 'Bank Transfer' : cfg.place,
        indiv: 'Solo' as const,
        inflowCat: r.txType === 'CREDIT' ? cfg.inflowCat : undefined,
        note: r.note || '',
        status: 'completed' as const,
      };
    });

    bulkAddTransactions(toCommit);
    triggerHaptic('success');
    notify(`Imported ${toCommit.length} transactions`, 'Synced with cloud ledger', 'success');
    setParsedRows([]);
    onImportSuccess();
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-pane">
      <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
        <div>
          <h2 className="text-sm font-medium text-zinc-100">HDFC Delimited .txt Importer</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Parsed locally. Strictly logged as UPI or Card transactions.
          </p>
        </div>
        <input
          type="file"
          accept=".txt,.csv,.xls,.xlsx"
          onChange={handleFileUpload}
          className="block w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-zinc-700 file:bg-zinc-900 file:text-zinc-200 cursor-pointer"
        />
        {importError && <p className="text-xs text-red-400 font-mono">{importError}</p>}
      </div>

      {uniquePayeeGroups.length > 0 && (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <div className="p-3 bg-zinc-900/50 border-b border-zinc-800 flex justify-between items-center gap-2">
            <span className="text-xs font-medium text-zinc-300">
              {uniquePayeeGroups.length} payees detected
            </span>
            <button
              onClick={commitBulkImport}
              className="bg-zinc-100 text-zinc-950 px-3 py-1 rounded text-xs font-medium"
            >
              Commit {parsedRows.length} Rows
            </button>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs min-w-[500px]">
              <thead className="border-b border-zinc-800 text-zinc-500 font-mono text-[11px]">
                <tr>
                  <th className="py-2 px-2.5">Payee</th>
                  <th className="py-2 px-2.5">Type</th>
                  <th className="py-2 px-2.5">Total</th>
                  <th className="py-2 px-2.5">Place / Source</th>
                  <th className="py-2 px-2.5">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {uniquePayeeGroups.map((g) => {
                  const cfg = payeeOverrides[g.payee] || {
                    place: 'Other',
                    cat: 'Food',
                    mode: 'UPI',
                    inflowCat: 'Parent Top-up',
                  };
                  return (
                    <tr key={`${g.txType}_${g.payee}`}>
                      <td className="py-2 px-2.5 font-mono text-zinc-200 truncate max-w-[130px]">
                        {g.payee}
                      </td>
                      <td className="py-2 px-2.5 font-mono text-[10px]">
                        <span
                          className={g.txType === 'CREDIT' ? 'text-emerald-400' : 'text-zinc-400'}
                        >
                          {g.txType}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 font-mono">₹{fmt(g.total)}</td>
                      <td className="py-2 px-2.5">
                        {g.txType === 'CREDIT' ? (
                          <select
                            value={cfg.inflowCat}
                            onChange={(e) =>
                              setPayeeOverrides((prev) => ({
                                ...prev,
                                [g.payee]: {
                                  ...cfg,
                                  inflowCat: e.target.value as InflowCategory,
                                },
                              }))
                            }
                            className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-xs"
                          >
                            {INFLOW_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={cfg.place}
                            onChange={(e) =>
                              setPayeeOverrides((prev) => ({
                                ...prev,
                                [g.payee]: { ...cfg, place: e.target.value },
                              }))
                            }
                            className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-xs"
                          >
                            {PLACES.map((spot) => (
                              <option key={spot} value={spot}>
                                {spot}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-2 px-2.5">
                        <select
                          value={cfg.cat}
                          onChange={(e) =>
                            setPayeeOverrides((prev) => ({
                              ...prev,
                              [g.payee]: { ...cfg, cat: e.target.value as ExpenseCategory },
                            }))
                          }
                          className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-xs"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};