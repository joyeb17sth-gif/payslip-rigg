'use client';

import { useState, useMemo, useRef } from 'react';
import { ContractorRate, InvoiceRateItem } from '@/lib/data';
import { updateRates, updateInvoiceRate } from './actions';
import { Button } from '@/components/ui/button';
import {
  Save,
  Search,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Check,
  Building2,
  MapPin,
  Users,
  X,
} from 'lucide-react';

const DAY_TYPES = ['Mon - Fri', 'Saturday', 'Sunday', 'Public Holidays'] as const;
const DEFAULT_SA_RATE = 2.8;

export function isSaCode(code: string): boolean {
  if (!code) return false;
  const norm = code.replace(/[\s\-_]/g, '').toUpperCase();
  return norm === 'SA70' || norm === 'SA07' || norm.startsWith('SA');
}

export function formatSaCode(code: string): string {
  const norm = code.replace(/[\s\-_]/g, '').toUpperCase();
  if (norm === 'SA70') return 'SA 7-0';
  if (norm === 'SA07') return 'SA 0-7';
  return code.trim().toUpperCase();
}

interface CodeGroup {
  id: string;
  code: string;
  rates: Record<string, number>;
}

interface ContractorGroup {
  id: string;
  client: string;
  location: string;
  contractorKey: string;
  displayName: string;
  codes: CodeGroup[];
}

export const CLIENT_LOCATIONS: Record<string, string[]> = {
  IHS: ['ACE', 'Caption', 'Hyatt Regency', 'Park Hyatt', 'Q-Station', 'Shangrila'],
  ZBsolution: ['ZBS'],
};

function parseGroups(rates: ContractorRate[]): ContractorGroup[] {
  const grouped = new Map<string, Map<string, Map<string, number>>>();
  const meta = new Map<string, { client: string; location: string; display: string }>();

  for (const r of rates) {
    let contractorKey: string;
    let code: string;

    const parenMatch = r.name.match(/^(.*?)\s*\(([^()]+)\)$/);
    if (parenMatch) {
      contractorKey = parenMatch[1].trim().toUpperCase();
      code = parenMatch[2].trim().toUpperCase();
    } else {
      contractorKey = r.name.trim().toUpperCase();
      code = '';
    }

    if (isSaCode(code)) {
      code = formatSaCode(code);
    }

    const groupKey = `${r.client}|${r.location}|${contractorKey}`;
    if (!grouped.has(groupKey)) grouped.set(groupKey, new Map());
    if (!meta.has(groupKey)) meta.set(groupKey, { client: r.client, location: r.location, display: contractorKey });

    const codeMap = grouped.get(groupKey)!;
    if (!codeMap.has(code)) codeMap.set(code, new Map());
    codeMap.get(code)!.set(r.dayType, r.rate);
  }

  const result: ContractorGroup[] = [];

  for (const [gk, codeMap] of grouped) {
    const m = meta.get(gk)!;
    const codes: CodeGroup[] = [];

    for (const [code, dayMap] of codeMap) {
      const ratesRecord: Record<string, number> = {};
      for (const [dt, rate] of dayMap) {
        ratesRecord[dt] = rate;
      }
      codes.push({
        id: `${gk}|${code}|${Math.random()}`,
        code,
        rates: ratesRecord,
      });
    }

    codes.sort((a, b) => {
      const aSa = isSaCode(a.code);
      const bSa = isSaCode(b.code);
      if (aSa && !bSa) return 1;
      if (!aSa && bSa) return -1;
      return a.code.localeCompare(b.code);
    });

    const hasSa70 = codes.some(c => formatSaCode(c.code) === 'SA 7-0');
    if (!hasSa70) {
      codes.push({
        id: `${gk}|SA 7-0|default`,
        code: 'SA 7-0',
        rates: { Allowance: DEFAULT_SA_RATE },
      });
    }

    const hasSa07 = codes.some(c => formatSaCode(c.code) === 'SA 0-7');
    if (!hasSa07) {
      codes.push({
        id: `${gk}|SA 0-7|default`,
        code: 'SA 0-7',
        rates: { Allowance: DEFAULT_SA_RATE },
      });
    }

    result.push({
      id: gk,
      client: m.client,
      location: m.location,
      contractorKey: gk.split('|')[2],
      displayName: m.display,
      codes,
    });
  }

  return result.sort((a, b) => {
    if (a.client !== b.client) return a.client.localeCompare(b.client);
    return `${a.location} - ${a.displayName}`.localeCompare(`${b.location} - ${b.displayName}`);
  });
}

function groupsToRates(groups: ContractorGroup[]): ContractorRate[] {
  const out: ContractorRate[] = [];

  for (const g of groups) {
    const cleanKey = g.displayName.trim().replace(/\s+/g, '').toUpperCase();
    if (!cleanKey) continue;

    for (const cg of g.codes) {
      let code = cg.code.trim().toUpperCase();

      if (isSaCode(code)) {
        code = formatSaCode(code);
        const nameKey = `${cleanKey} (${code})`;
        const rateVal =
          cg.rates['Allowance'] !== undefined && !isNaN(cg.rates['Allowance'])
            ? cg.rates['Allowance']
            : DEFAULT_SA_RATE;

        out.push({
          id: `${g.client}|${g.location}|${nameKey}|Allowance`,
          client: g.client,
          location: g.location,
          name: nameKey,
          dayType: 'Allowance',
          rate: rateVal,
        });
      } else {
        const nameKey = code ? `${cleanKey} (${code})` : cleanKey;
        for (const dt of DAY_TYPES) {
          out.push({
            id: `${g.client}|${g.location}|${nameKey}|${dt}`,
            client: g.client,
            location: g.location,
            name: nameKey,
            dayType: dt,
            rate: cg.rates[dt] !== undefined && !isNaN(cg.rates[dt]) ? cg.rates[dt] : 0,
          });
        }
      }
    }
  }

  return out;
}

export default function RatesClient({ 
  initialRates,
  initialInvoiceRates,
}: { 
  initialRates: ContractorRate[];
  initialInvoiceRates?: InvoiceRateItem[];
}) {
  const [ratesMode, setRatesMode] = useState<'contractor' | 'invoice'>('contractor');
  const [invoiceRates, setInvoiceRates] = useState<InvoiceRateItem[]>(() =>
    initialInvoiceRates && initialInvoiceRates.length > 0
      ? initialInvoiceRates
      : [
          { client: 'ZB Solution', location: 'Ozone', weekdays: 32.0, weekend: 38.0 },
          { client: 'ZB Solution', location: 'Beyond', weekdays: 32.0, weekend: 38.0 },
        ]
  );
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [savedInvoiceSuccess, setSavedInvoiceSuccess] = useState(false);

  const handleSaveInvoiceRates = async () => {
    setSavingInvoice(true);
    setSavedInvoiceSuccess(false);
    try {
      for (const it of invoiceRates) {
        await updateInvoiceRate(it.client, it.location, it.weekdays, it.weekend);
      }
      setSavedInvoiceSuccess(true);
      setTimeout(() => setSavedInvoiceSuccess(false), 3000);
    } catch (e) {
      console.error('Error saving invoice rates:', e);
    } finally {
      setSavingInvoice(false);
    }
  };

  const [groups, setGroups] = useState<ContractorGroup[]>(() => parseGroups(initialRates));
  const initialSnapshot = useRef<string>(JSON.stringify(groups));
  
  const [selectedClient, setSelectedClient] = useState<'ALL' | 'IHS' | 'ZBsolution'>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [collapsedLocations, setCollapsedLocations] = useState<Set<string>>(new Set());

  // Modal State for Add Contractor
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newContractorName, setNewContractorName] = useState('');
  const [newContractorClient, setNewContractorClient] = useState('IHS');
  const [newContractorLocation, setNewContractorLocation] = useState('ACE');
  const [newContractorCode, setNewContractorCode] = useState('PT1');
  const [newContractorRateMF, setNewContractorRateMF] = useState('24.0');
  const [newContractorRateSat, setNewContractorRateSat] = useState('25.0');
  const [newContractorRateSun, setNewContractorRateSun] = useState('25.0');
  const [newContractorRatePH, setNewContractorRatePH] = useState('0.0');

  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(groups) !== initialSnapshot.current;
  }, [groups]);

  // Clients & Locations
  const availableClients = useMemo(() => ['ALL', 'IHS', 'ZBsolution'] as const, []);

  const availableLocationsForFilter = useMemo(() => {
    if (selectedClient === 'IHS') return CLIENT_LOCATIONS['IHS'];
    if (selectedClient === 'ZBsolution') return CLIENT_LOCATIONS['ZBsolution'];
    return Array.from(new Set([...CLIENT_LOCATIONS['IHS'], ...CLIENT_LOCATIONS['ZBsolution']])).sort();
  }, [selectedClient]);

  // Handle client filter tab switch
  const handleClientTabChange = (client: 'ALL' | 'IHS' | 'ZBsolution') => {
    setSelectedClient(client);
    setSelectedLocation('ALL');
  };

  // Filtered groups
  const filteredGroups = useMemo(() => {
    let list = groups;

    if (selectedClient !== 'ALL') {
      list = list.filter(g => g.client === selectedClient);
    }

    if (selectedLocation !== 'ALL') {
      list = list.filter(g => g.location === selectedLocation);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        g =>
          g.displayName.toLowerCase().includes(q) ||
          g.location.toLowerCase().includes(q) ||
          g.client.toLowerCase().includes(q) ||
          g.codes.some(c => c.code.toLowerCase().includes(q))
      );
    }

    return list;
  }, [groups, selectedClient, selectedLocation, search]);

  // Group by Location
  const groupedByLocation = useMemo(() => {
    const map = new Map<string, { client: string; location: string; items: { g: ContractorGroup; originalIdx: number }[] }>();

    filteredGroups.forEach(g => {
      const originalIdx = groups.findIndex(orig => orig.id === g.id);
      const locKey = `${g.client} • ${g.location}`;
      if (!map.has(locKey)) {
        map.set(locKey, { client: g.client, location: g.location, items: [] });
      }
      map.get(locKey)!.items.push({ g, originalIdx });
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.client !== b.client) return a.client.localeCompare(b.client);
      return a.location.localeCompare(b.location);
    });
  }, [filteredGroups, groups]);

  const toggleLocationCollapse = (locKey: string) => {
    setCollapsedLocations(prev => {
      const next = new Set(prev);
      next.has(locKey) ? next.delete(locKey) : next.add(locKey);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSavedSuccess(false);
    try {
      const flatRates = groupsToRates(groups);
      await updateRates(flatRates);
      initialSnapshot.current = JSON.stringify(groups);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save rates:', err);
    } finally {
      setSaving(false);
    }
  };

  const updateRate = (gIdx: number, cIdx: number, dayType: string, val: string) => {
    const num = parseFloat(val);
    setGroups(prev =>
      prev.map((g, gi) =>
        gi !== gIdx
          ? g
          : {
              ...g,
              codes: g.codes.map((c, ci) =>
                ci !== cIdx
                  ? c
                  : {
                      ...c,
                      rates: { ...c.rates, [dayType]: isNaN(num) ? 0 : num },
                    }
              ),
            }
      )
    );
  };

  const updateSaRate = (gIdx: number, saCodeName: 'SA 7-0' | 'SA 0-7', val: string) => {
    const num = parseFloat(val);
    setGroups(prev =>
      prev.map((g, gi) => {
        if (gi !== gIdx) return g;
        return {
          ...g,
          codes: g.codes.map(c => {
            if (formatSaCode(c.code) !== saCodeName) return c;
            return {
              ...c,
              rates: { Allowance: isNaN(num) ? DEFAULT_SA_RATE : num },
            };
          }),
        };
      })
    );
  };

  const updateContractorName = (gIdx: number, name: string) => {
    setGroups(prev =>
      prev.map((g, gi) =>
        gi !== gIdx
          ? g
          : {
              ...g,
              displayName: name,
              contractorKey: name.trim().replace(/\s+/g, '').toUpperCase(),
            }
      )
    );
  };

  const updateCodeName = (gIdx: number, cIdx: number, codeVal: string) => {
    const upper = codeVal.toUpperCase();
    setGroups(prev =>
      prev.map((g, gi) =>
        gi !== gIdx
          ? g
          : {
              ...g,
              codes: g.codes.map((c, ci) => (ci !== cIdx ? c : { ...c, code: upper })),
            }
      )
    );
  };

  const addShiftCode = (gIdx: number) => {
    setGroups(prev =>
      prev.map((g, gi) => {
        if (gi !== gIdx) return g;
        const newCode = prompt('Enter Shift Code (e.g. PT2, MOD):', 'PT2');
        if (!newCode || !newCode.trim()) return g;
        const cleanCode = newCode.trim().toUpperCase();

        return {
          ...g,
          codes: [
            ...g.codes,
            {
              id: `${g.id}_${cleanCode}_${Date.now()}`,
              code: cleanCode,
              rates: { 'Mon - Fri': 0, Saturday: 0, Sunday: 0, 'Public Holidays': 0 },
            },
          ],
        };
      })
    );
  };

  const removeShiftCode = (gIdx: number, cIdx: number) => {
    setGroups(prev =>
      prev.map((g, gi) => {
        if (gi !== gIdx) return g;
        return {
          ...g,
          codes: g.codes.filter((_, ci) => ci !== cIdx),
        };
      })
    );
  };

  const removeContractor = (gIdx: number, name: string) => {
    if (!confirm(`Are you sure you want to remove contractor "${name}"?`)) return;
    setGroups(prev => prev.filter((_, gi) => gi !== gIdx));
  };

  const openAddModal = (presetLocation?: string, presetClient?: string) => {
    const client = presetClient || (selectedClient !== 'ALL' ? selectedClient : 'IHS');
    const locs = CLIENT_LOCATIONS[client] || ['ACE'];
    const loc = presetLocation || (selectedLocation !== 'ALL' && locs.includes(selectedLocation) ? selectedLocation : locs[0]);

    setNewContractorName('');
    setNewContractorClient(client);
    setNewContractorLocation(loc);
    setNewContractorCode(client === 'ZBsolution' ? '' : 'PT1');
    setNewContractorRateMF('24.0');
    setNewContractorRateSat('25.0');
    setNewContractorRateSun('25.0');
    setNewContractorRatePH('0.0');
    setIsAddModalOpen(true);
  };

  const submitAddContractor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContractorName.trim()) {
      alert('Please enter a contractor name');
      return;
    }

    const cleanName = newContractorName.trim().toUpperCase();
    const cleanCode = newContractorCode.trim().toUpperCase();
    const id = `${newContractorClient}|${newContractorLocation}|${cleanName.replace(/\s+/g, '')}_${Date.now()}`;

    const newGroup: ContractorGroup = {
      id,
      client: newContractorClient,
      location: newContractorLocation,
      contractorKey: cleanName.replace(/\s+/g, ''),
      displayName: cleanName,
      codes: [
        {
          id: `${id}_${cleanCode || 'BASE'}`,
          code: cleanCode,
          rates: {
            'Mon - Fri': parseFloat(newContractorRateMF) || 0,
            Saturday: parseFloat(newContractorRateSat) || 0,
            Sunday: parseFloat(newContractorRateSun) || 0,
            'Public Holidays': parseFloat(newContractorRatePH) || 0,
          },
        },
        {
          id: `${id}_SA70`,
          code: 'SA 7-0',
          rates: { Allowance: DEFAULT_SA_RATE },
        },
        {
          id: `${id}_SA07`,
          code: 'SA 0-7',
          rates: { Allowance: DEFAULT_SA_RATE },
        },
      ],
    };

    setGroups(prev => [newGroup, ...prev]);
    setIsAddModalOpen(false);
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-16">
      {/* Top Header & Sticky Control Deck */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Rates Manager
            </h1>
            {hasUnsavedChanges && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 animate-pulse">
                Unsaved Changes
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Streamlined shift and allowance rates. Grouped by client location with real-time editing.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => openAddModal()}
            className="gap-2 h-9 text-xs font-semibold border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" /> Add Contractor
          </Button>

          <Button
            onClick={handleSave}
            disabled={saving}
            className={`gap-2 h-9 min-w-[130px] font-semibold text-xs transition-all shadow-sm ${
              savedSuccess
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : hasUnsavedChanges
                ? 'bg-blue-600 hover:bg-blue-700 text-white ring-2 ring-blue-500/20'
                : 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white'
            }`}
          >
            {savedSuccess ? (
              <>
                <Check className="h-4 w-4" /> Saved!
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : hasUnsavedChanges ? 'Save Changes' : 'Save Rates'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Rate Mode Toggle */}
      <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl w-fit border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setRatesMode('contractor')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            ratesMode === 'contractor'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          Contractor Pay Rates (Internal Cost)
        </button>
        <button
          type="button"
          onClick={() => setRatesMode('invoice')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
            ratesMode === 'invoice'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          Client Invoice Rates (Hotel Billing - ZB Solution)
        </button>
      </div>

      {ratesMode === 'invoice' ? (
        <div className="space-y-6">
          <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-blue-950 dark:text-blue-200">
                ZB Solution — Hotel Billing Charge Rates
              </h2>
              <p className="text-xs text-blue-800/80 dark:text-blue-300/80 mt-0.5">
                These rates are billed to the hotel for supplied staff. Mon–Fri shifts use the Weekdays rate; Saturday and Sunday shifts use the Weekend rate.
              </p>
            </div>
            <Button
              onClick={handleSaveInvoiceRates}
              disabled={savingInvoice}
              className={`gap-2 h-9 px-4 font-semibold text-xs transition-all shadow-sm ${
                savedInvoiceSuccess
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {savedInvoiceSuccess ? (
                <>
                  <Check className="h-4 w-4" /> Saved!
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> {savingInvoice ? 'Saving...' : 'Save Invoice Rates'}
                </>
              )}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {invoiceRates.map((item, idx) => (
              <div 
                key={`${item.client}-${item.location}`} 
                className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-300 font-bold text-sm">
                      {item.location.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {item.location}
                      </h3>
                      <p className="text-[11px] text-slate-500 font-medium">Client: {item.client}</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    Active
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                      Weekdays (Mon - Fri)
                    </label>
                    <p className="text-[10px] text-slate-400">Rate charged to hotel for M-F shifts</p>
                    <div className="relative mt-2">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">$</span>
                      <input
                        type="number"
                        step="0.5"
                        value={item.weekdays}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0;
                          setInvoiceRates(prev => prev.map((it, i) => i === idx ? { ...it, weekdays: val } : it));
                        }}
                        className="w-full pl-7 pr-3 py-2 text-sm font-bold font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                      Weekend (Sat & Sun)
                    </label>
                    <p className="text-[10px] text-slate-400">Rate charged to hotel for Sat/Sun shifts</p>
                    <div className="relative mt-2">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">$</span>
                      <input
                        type="number"
                        step="0.5"
                        value={item.weekend}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0;
                          setInvoiceRates(prev => prev.map((it, i) => i === idx ? { ...it, weekend: val } : it));
                        }}
                        className="w-full pl-7 pr-3 py-2 text-sm font-bold font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Filter Toolbar: Client Tabs + Location Dropdown + Search */}
          <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Client Segmented Control */}
        <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 self-start">
          <span className="text-xs font-semibold text-slate-400 px-2 select-none flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" /> Client:
          </span>
          {availableClients.map(c => {
            const count =
              c === 'ALL'
                ? groups.length
                : groups.filter(g => g.client === c).length;
            const active = selectedClient === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => handleClientTabChange(c)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                  active
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <span>{c === 'ALL' ? 'All Clients' : c}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    active
                      ? 'bg-slate-800 text-slate-200 dark:bg-slate-200 dark:text-slate-800'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 flex-1 justify-end flex-wrap">
          {/* Location Dropdown */}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs">
            <MapPin className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-400 font-medium">Location:</span>
            <select
              value={selectedLocation}
              onChange={e => setSelectedLocation(e.target.value)}
              className="bg-transparent font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer pr-1"
            >
              <option value="ALL">All Locations ({availableLocationsForFilter.length})</option>
              {availableLocationsForFilter.map(loc => {
                const count = groups.filter(g =>
                  (selectedClient === 'ALL' || g.client === selectedClient) && g.location === loc
                ).length;
                return (
                  <option key={loc} value={loc}>
                    {loc} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search contractor or code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-7 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-slate-400 dark:focus:border-slate-600 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Stat Line */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span>
          Showing <strong className="text-slate-700 dark:text-slate-300">{filteredGroups.length}</strong>{' '}
          contractors across{' '}
          <strong className="text-slate-700 dark:text-slate-300">{groupedByLocation.length}</strong>{' '}
          location groups
        </span>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500"></span> Standard Shifts (M-F, Sat, Sun, PH)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500"></span> SA Allowances ($2.80 default)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500"></span> Unallocated Standard Pay (Red Name)
          </span>
        </div>
      </div>

      {/* Main Grouped Location Tables */}
      {groupedByLocation.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20">
          <Users className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">No contractors found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            No contractors match your active client, location, or search filters. Try resetting the filters or add a new contractor.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedClient('ALL');
              setSelectedLocation('ALL');
              setSearch('');
            }}
            className="mt-4 text-xs font-semibold"
          >
            Reset Filters
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByLocation.map(locGroup => {
            const locKey = `${locGroup.client} • ${locGroup.location}`;
            const isCollapsed = collapsedLocations.has(locKey);

            return (
              <div
                key={locKey}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden shadow-sm"
              >
                {/* Location Section Header */}
                <div
                  onClick={() => toggleLocationCollapse(locKey)}
                  className="px-4 py-3 bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between cursor-pointer select-none hover:bg-slate-100/60 dark:hover:bg-slate-900 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        locGroup.client === 'ZBsolution'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      }`}
                    >
                      {locGroup.client}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        {locGroup.location}
                      </h2>
                    </div>

                    <span className="text-xs font-semibold text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full">
                      {locGroup.items.length} {locGroup.items.length === 1 ? 'contractor' : 'contractors'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => openAddModal(locGroup.location, locGroup.client)}
                      className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                      title={`Add contractor to ${locGroup.location}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleLocationCollapse(locKey)}
                      className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Tabular Grid */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50/50 dark:bg-slate-900/30 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200/80 dark:border-slate-800">
                          <th className="py-2.5 px-4 w-[240px]">Contractor</th>
                          <th className="py-2.5 px-2 w-[100px]">Shift Code</th>
                          <th className="py-2.5 px-2 text-right w-[110px]">Mon - Fri ($)</th>
                          <th className="py-2.5 px-2 text-right w-[110px]">Saturday ($)</th>
                          <th className="py-2.5 px-2 text-right w-[110px]">Sunday ($)</th>
                          <th className="py-2.5 px-2 text-right w-[115px]">Public Hol ($)</th>
                          <th className="py-2.5 px-2 text-right w-[105px] text-amber-700 dark:text-amber-400">
                            SA 7-0 ($)
                          </th>
                          <th className="py-2.5 px-2 text-right w-[105px] text-amber-700 dark:text-amber-400">
                            SA 0-7 ($)
                          </th>
                          <th className="py-2.5 px-3 text-center w-[85px]">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {locGroup.items.map(({ g, originalIdx }) => {
                          const regularCodes = g.codes.filter(c => !isSaCode(c.code));
                          const sa70 = g.codes.find(c => formatSaCode(c.code) === 'SA 7-0');
                          const sa07 = g.codes.find(c => formatSaCode(c.code) === 'SA 0-7');

                          // Collect any missing standard shift rates (<= 0), excluding Public Holidays
                          const REQUIRED_STANDARD_DAY_TYPES = ['Mon - Fri', 'Saturday', 'Sunday'] as const;
                          const missingDayTypes: string[] = [];
                          if (regularCodes.length === 0) {
                            missingDayTypes.push('All Standard Shifts');
                          } else {
                            for (const c of regularCodes) {
                              for (const dt of REQUIRED_STANDARD_DAY_TYPES) {
                                const val = Number(c.rates[dt]) || 0;
                                if (val <= 0 && !missingDayTypes.includes(dt)) {
                                  missingDayTypes.push(dt);
                                }
                              }
                            }
                          }
                          const hasMissingRate = missingDayTypes.length > 0;

                          // If no regular code exists, render at least one placeholder code row
                          const codeList =
                            regularCodes.length > 0
                              ? regularCodes
                              : [{ id: `${g.id}_blank`, code: '', rates: {} }];

                          return codeList.map((cg, codeIdx) => {
                            const isFirstCode = codeIdx === 0;
                            const isExtraCode = codeIdx > 0;
                            const cgActualIdx = g.codes.findIndex(c => c.id === cg.id);

                            return (
                              <tr
                                key={cg.id}
                                className={`transition-colors group hover:bg-slate-50/70 dark:hover:bg-slate-900/40 ${
                                  isExtraCode ? 'bg-slate-50/20' : ''
                                }`}
                              >
                                {/* Contractor Name */}
                                <td className="py-2 px-4 align-middle">
                                  {isFirstCode ? (
                                    <div className="flex items-center gap-2">
                                      {hasMissingRate && (
                                        <span
                                          className="h-2 w-2 rounded-full bg-red-500 shrink-0"
                                          title={`Missing: ${missingDayTypes.join(', ')}`}
                                        />
                                      )}
                                      <input
                                        type="text"
                                        value={g.displayName}
                                        onChange={e => updateContractorName(originalIdx, e.target.value)}
                                        className={`font-bold text-xs bg-transparent hover:bg-slate-100 focus:bg-white dark:hover:bg-slate-800 dark:focus:bg-slate-900 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-slate-400 rounded px-1.5 py-1 w-full focus:outline-none transition-colors ${
                                          hasMissingRate
                                            ? 'text-red-600 dark:text-red-400 placeholder:text-red-400'
                                            : 'text-slate-900 dark:text-white'
                                        }`}
                                        title={hasMissingRate ? `Missing: ${missingDayTypes.join(', ')}` : undefined}
                                      />
                                    </div>
                                  ) : (
                                    <div className="pl-6 text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                                      <span className="text-slate-300 select-none">↳</span>
                                      <span className="italic">Additional shift code</span>
                                    </div>
                                  )}
                                </td>

                                {/* Shift Code */}
                                <td className="py-2 px-2 align-middle">
                                  <input
                                    type="text"
                                    value={cg.code}
                                    onChange={e =>
                                      cgActualIdx !== -1 &&
                                      updateCodeName(originalIdx, cgActualIdx, e.target.value)
                                    }
                                    placeholder="Base"
                                    className="w-20 text-center font-mono font-bold text-xs uppercase px-1.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:outline-none"
                                  />
                                </td>

                                {/* Mon - Fri */}
                                <td className="py-2 px-2 text-right align-middle">
                                  <div className="relative inline-flex items-center w-full max-w-[100px]">
                                    <span className="absolute left-2 text-[11px] text-slate-400 select-none font-mono">
                                      $
                                    </span>
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      value={cg.rates['Mon - Fri'] ?? 0}
                                      onChange={e =>
                                        cgActualIdx !== -1 &&
                                        updateRate(originalIdx, cgActualIdx, 'Mon - Fri', e.target.value)
                                      }
                                      className={`w-full text-right font-mono text-xs pl-5 pr-1.5 py-1 rounded border focus:outline-none transition-colors ${
                                        !cg.rates['Mon - Fri'] || Number(cg.rates['Mon - Fri']) <= 0
                                          ? 'border-red-300 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20 text-red-600 dark:text-red-400 focus:border-red-500'
                                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-blue-500'
                                      }`}
                                    />
                                  </div>
                                </td>

                                {/* Saturday */}
                                <td className="py-2 px-2 text-right align-middle">
                                  <div className="relative inline-flex items-center w-full max-w-[100px]">
                                    <span className="absolute left-2 text-[11px] text-slate-400 select-none font-mono">
                                      $
                                    </span>
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      value={cg.rates['Saturday'] ?? 0}
                                      onChange={e =>
                                        cgActualIdx !== -1 &&
                                        updateRate(originalIdx, cgActualIdx, 'Saturday', e.target.value)
                                      }
                                      className={`w-full text-right font-mono text-xs pl-5 pr-1.5 py-1 rounded border focus:outline-none transition-colors ${
                                        !cg.rates['Saturday'] || Number(cg.rates['Saturday']) <= 0
                                          ? 'border-red-300 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20 text-red-600 dark:text-red-400 focus:border-red-500'
                                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-blue-500'
                                      }`}
                                    />
                                  </div>
                                </td>

                                {/* Sunday */}
                                <td className="py-2 px-2 text-right align-middle">
                                  <div className="relative inline-flex items-center w-full max-w-[100px]">
                                    <span className="absolute left-2 text-[11px] text-slate-400 select-none font-mono">
                                      $
                                    </span>
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      value={cg.rates['Sunday'] ?? 0}
                                      onChange={e =>
                                        cgActualIdx !== -1 &&
                                        updateRate(originalIdx, cgActualIdx, 'Sunday', e.target.value)
                                      }
                                      className={`w-full text-right font-mono text-xs pl-5 pr-1.5 py-1 rounded border focus:outline-none transition-colors ${
                                        !cg.rates['Sunday'] || Number(cg.rates['Sunday']) <= 0
                                          ? 'border-red-300 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20 text-red-600 dark:text-red-400 focus:border-red-500'
                                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-blue-500'
                                      }`}
                                    />
                                  </div>
                                </td>

                                {/* Public Holidays */}
                                <td className="py-2 px-2 text-right align-middle">
                                  <div className="relative inline-flex items-center w-full max-w-[100px]">
                                    <span className="absolute left-2 text-[11px] text-slate-400 select-none font-mono">
                                      $
                                    </span>
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      value={cg.rates['Public Holidays'] ?? 0}
                                      onChange={e =>
                                        cgActualIdx !== -1 &&
                                        updateRate(originalIdx, cgActualIdx, 'Public Holidays', e.target.value)
                                      }
                                      className="w-full text-right font-mono text-xs pl-5 pr-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                                    />
                                  </div>
                                </td>


                                {/* SA 7-0 (Per Contractor) */}
                                <td className="py-2 px-2 text-right align-middle">
                                  {isFirstCode ? (
                                    <div className="relative inline-flex items-center w-full max-w-[95px]">
                                      <span className="absolute left-2 text-[10px] text-amber-600 dark:text-amber-400 select-none font-bold font-mono">
                                        $
                                      </span>
                                      <input
                                        type="number"
                                        step="0.05"
                                        min="0"
                                        value={sa70?.rates['Allowance'] ?? DEFAULT_SA_RATE}
                                        onChange={e => updateSaRate(originalIdx, 'SA 7-0', e.target.value)}
                                        className="w-full text-right font-mono text-xs pl-5 pr-1.5 py-1 rounded border border-amber-200 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-300 font-semibold focus:border-amber-500 focus:outline-none"
                                      />
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-slate-300 text-center block">—</span>
                                  )}
                                </td>

                                {/* SA 0-7 (Per Contractor) */}
                                <td className="py-2 px-2 text-right align-middle">
                                  {isFirstCode ? (
                                    <div className="relative inline-flex items-center w-full max-w-[95px]">
                                      <span className="absolute left-2 text-[10px] text-amber-600 dark:text-amber-400 select-none font-bold font-mono">
                                        $
                                      </span>
                                      <input
                                        type="number"
                                        step="0.05"
                                        min="0"
                                        value={sa07?.rates['Allowance'] ?? DEFAULT_SA_RATE}
                                        onChange={e => updateSaRate(originalIdx, 'SA 0-7', e.target.value)}
                                        className="w-full text-right font-mono text-xs pl-5 pr-1.5 py-1 rounded border border-amber-200 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-300 font-semibold focus:border-amber-500 focus:outline-none"
                                      />
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-slate-300 text-center block">—</span>
                                  )}
                                </td>

                                {/* Actions */}
                                <td className="py-2 px-3 text-center align-middle">
                                  <div className="flex items-center justify-center gap-1.5">
                                    {isFirstCode ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => addShiftCode(originalIdx)}
                                          className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                                          title="Add shift code (e.g. PT2, MOD)"
                                        >
                                          <Plus className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => removeContractor(originalIdx, g.displayName)}
                                          className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                                          title="Delete contractor"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => cgActualIdx !== -1 && removeShiftCode(originalIdx, cgActualIdx)}
                                        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                                        title="Delete this shift code"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          });
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {/* Add Contractor Modal Dialog */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Add New Contractor</h3>
                <p className="text-xs text-slate-500 mt-0.5">Define contractor profile and starting rates.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submitAddContractor} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Contractor Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. RAM SHARMA"
                  value={newContractorName}
                  onChange={e => setNewContractorName(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-bold uppercase focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Client
                  </label>
                  <select
                    value={newContractorClient}
                    onChange={e => {
                      const c = e.target.value;
                      setNewContractorClient(c);
                      const locs = CLIENT_LOCATIONS[c] || ['ACE'];
                      setNewContractorLocation(locs[0]);
                      if (c === 'ZBsolution') setNewContractorCode('');
                      else if (!newContractorCode) setNewContractorCode('PT1');
                    }}
                    className="w-full h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-medium focus:border-blue-500 focus:outline-none cursor-pointer"
                  >
                    <option value="IHS">IHS</option>
                    <option value="ZBsolution">ZBsolution</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Location
                  </label>
                  <select
                    value={newContractorLocation}
                    onChange={e => setNewContractorLocation(e.target.value)}
                    className="w-full h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-medium focus:border-blue-500 focus:outline-none cursor-pointer"
                  >
                    {(CLIENT_LOCATIONS[newContractorClient] || ['ACE']).map(loc => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Shift Code <span className="text-slate-400 font-normal">(optional, default PT1)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. PT1 or blank"
                  value={newContractorCode}
                  onChange={e => setNewContractorCode(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono font-semibold uppercase focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                  Initial Hourly Rates ($/hr)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 font-medium block mb-1">M-F</span>
                    <input
                      type="number"
                      step="0.1"
                      value={newContractorRateMF}
                      onChange={e => setNewContractorRateMF(e.target.value)}
                      className="w-full h-8 text-right px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-medium block mb-1">Sat</span>
                    <input
                      type="number"
                      step="0.1"
                      value={newContractorRateSat}
                      onChange={e => setNewContractorRateSat(e.target.value)}
                      className="w-full h-8 text-right px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-medium block mb-1">Sun</span>
                    <input
                      type="number"
                      step="0.1"
                      value={newContractorRateSun}
                      onChange={e => setNewContractorRateSun(e.target.value)}
                      className="w-full h-8 text-right px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-medium block mb-1">PH</span>
                    <input
                      type="number"
                      step="0.1"
                      value={newContractorRatePH}
                      onChange={e => setNewContractorRatePH(e.target.value)}
                      className="w-full h-8 text-right px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                  Add Contractor
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
