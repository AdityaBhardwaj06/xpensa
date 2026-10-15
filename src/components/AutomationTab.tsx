import { useState } from 'react';
import { Smartphone, Copy, Play, Plus, Trash2 } from 'lucide-react';
import { useExpenseStore } from '../store/useExpenseStore';
import type { ExpenseCategory } from '../types/expense';
import { PLACES, CATEGORIES } from '../constants/taxonomy';
import type { NotifyFn } from '../constants/taxonomy';
import { triggerHaptic } from '../utils/feedback';

interface AutomationTabProps {
  notify: NotifyFn;
  onSimulateRawNotification: (rawText: string, mode?: 'UPI' | 'SU') => void;
}

export function AutomationTab({ notify, onSimulateRawNotification }: AutomationTabProps) {
  const { aliases, upsertAlias } = useExpenseStore();

  const [testText, setTestText] = useState(
    'Paid ₹30.00 to NAMONARAYAN ENTERPRISES on Google Pay. UPI Ref: 623918273641'
  );
  const [newKey, setNewKey] = useState('');
  const [newPlace, setNewPlace] = useState('Amul');
  const [newCat, setNewCat] = useState<ExpenseCategory>('Food');

  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://your-app.vercel.app';

  const gpayWebhookUrl = `${baseUrl}/?mode=UPI&raw={notification_text}`;
  const suWebhookUrl = `${baseUrl}/?mode=SU&raw={screen_text}`;

  const copyToClipboard = (text: string, label: string) => {
    triggerHaptic('light');
    void navigator.clipboard.writeText(text);
    notify(`Copied ${label}`, text, 'info');
  };

  return (
    <div className="space-y-5 animate-pane">
      {/* Section 1: Android MacroDroid Zero-Regex Setup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-zinc-800 rounded-lg p-4 space-y-3 bg-zinc-900/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                1. Google Pay Auto-Capture (MacroDroid)
              </h2>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
              No SMS Permission Needed
            </span>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            In <strong>MacroDroid</strong> on your Android phone, create a macro that listens only to
            Google Pay notifications and opens this URL. Kosh automatically extracts the ₹ amount and
            maps the merchant name:
          </p>

          <div className="space-y-1.5 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded p-2.5 text-zinc-300">
            <div>
              <span className="text-zinc-500">Trigger:</span> Notification Received → App:{' '}
              <span className="text-emerald-400">Google Pay</span> (Contains: <code className="text-zinc-100">Paid ₹</code>)
            </div>
            <div>
              <span className="text-zinc-500">Action:</span> Open Website / HTTP GET:
            </div>
            <div className="bg-zinc-900 p-2 rounded text-[11px] text-zinc-200 break-all border border-zinc-800">
              {gpayWebhookUrl}
            </div>
          </div>

          <button
            onClick={() => copyToClipboard(gpayWebhookUrl, 'GPay MacroDroid URL')}
            className="inline-flex items-center gap-1.5 bg-zinc-100 text-zinc-950 hover:bg-white px-3 py-1.5 rounded-md text-xs font-medium"
          >
            <Copy className="w-3.5 h-3.5" /> Copy GPay MacroDroid URL
          </button>
        </div>

        {/* SU App Quick Tile / Screen Reader */}
        <div className="border border-zinc-800 rounded-lg p-4 space-y-3 bg-zinc-900/20">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
              2. BITS SU App Capture (Silent QR Scans)
            </h2>
            <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
              Quick Tile or UI Query
            </span>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            Since the SU App does not send push notifications, use a MacroDroid{' '}
            <strong>Quick Settings Tile</strong> (or Floating Button) when paying via SU QR:
          </p>

          <div className="space-y-1.5 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded p-2.5 text-zinc-300">
            <div>
              <span className="text-zinc-500">Trigger:</span> Quick Settings Tile (<code className="text-zinc-100">Log SU QR</code>)
            </div>
            <div>
              <span className="text-zinc-500">Action:</span> Read Screen Content → Open URL:
            </div>
            <div className="bg-zinc-900 p-2 rounded text-[11px] text-zinc-200 break-all border border-zinc-800">
              {suWebhookUrl}
            </div>
          </div>

          <button
            onClick={() => copyToClipboard(suWebhookUrl, 'SU App MacroDroid URL')}
            className="inline-flex items-center gap-1.5 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 px-3 py-1.5 rounded-md text-xs font-medium"
          >
            <Copy className="w-3.5 h-3.5" /> Copy SU App URL
          </button>
        </div>
      </div>

      {/* Section 2: Live Deep-Link Simulator */}
      <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-300">
              Test Android Notification Parser & 1-Tap Confirmation Sheet
            </h3>
            <p className="text-[11px] text-zinc-500">
              Paste any GPay SMS/notification or SU receipt text to see how the mobile popup pre-fills it
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                triggerHaptic('medium');
                onSimulateRawNotification(testText, 'UPI');
              }}
              className="inline-flex items-center gap-1.5 bg-zinc-100 text-zinc-950 px-3.5 py-2 rounded-md text-xs font-medium shrink-0"
            >
              <Play className="w-3.5 h-3.5" /> Simulate GPay Popup
            </button>
            <button
              onClick={() => {
                const sampleSU = 'SU Payment Successful ₹80 at FOOD MINISTRY FM';
                setTestText(sampleSU);
                triggerHaptic('medium');
                onSimulateRawNotification(sampleSU, 'SU');
              }}
              className="bg-zinc-800 text-zinc-200 px-3 py-2 rounded-md text-xs font-medium shrink-0"
            >
              Test SU ₹80
            </button>
          </div>
        </div>
      </div>

      {/* Section 3: Merchant Alias Memory Dictionary */}
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <div className="p-3.5 bg-zinc-900/40 border-b border-zinc-800 flex flex-wrap justify-between items-center gap-2">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-300">
              Saved Merchant Memory Rules ({aliases.length})
            </h3>
            <p className="text-[11px] text-zinc-500">
              Automatically maps raw bank/GPay names to your campus locations
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="Payee keyword (e.g. NAMONARAYAN)"
              className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-xs font-mono"
            />
            <select
              value={newPlace}
              onChange={(e) => setNewPlace(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs"
            >
              {PLACES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={newCat}
              onChange={(e) => setNewCat(e.target.value as ExpenseCategory)}
              className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                if (!newKey.trim()) return;
                triggerHaptic('success');
                upsertAlias({
                  key: newKey.trim().toUpperCase(),
                  place: newPlace,
                  cat: newCat,
                  subcat: newPlace,
                  txType: 'DEBIT',
                });
                notify('Rule saved', `${newKey.toUpperCase()} → ${newPlace}`, 'success');
                setNewKey('');
              }}
              className="inline-flex items-center gap-1 bg-zinc-100 text-zinc-950 px-2.5 py-1 rounded text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> Add Rule
            </button>
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-800 text-zinc-500 font-mono text-[10px] uppercase bg-zinc-900/20">
              <tr>
                <th className="py-2 px-3">Payee Keyword</th>
                <th className="py-2 px-3">Mapped Spot</th>
                <th className="py-2 px-3">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50 font-mono">
              {aliases.map((a) => (
                <tr key={a.key} className="hover:bg-zinc-900/30">
                  <td className="py-2 px-3 text-zinc-200">{a.key}</td>
                  <td className="py-2 px-3 text-zinc-300 font-sans">{a.place}</td>
                  <td className="py-2 px-3 text-zinc-400 font-sans">{a.cat}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}