'use client';
import { useEffect, useState } from 'react';
import type {
  AutomationConfig, TriggerType, ScheduleConfig, SourceConfig,
  TranslationTable, FieldMapping, MappingMode,
} from '@/lib/automation-types';
import { describeSchedule } from '@/lib/automation-types';

interface ConnectorLite { id: string; name: string; type: string; }
interface AfasEntry { id: string; description: string; }
interface AfasField { id: string; label: string; dataType: string; required: boolean; }
interface WorkflowLite { id: string; name: string; }

const STEPS = [
  'Naam', 'Trigger', 'Doel', 'Bronnen', 'Voorbeeld',
  'Vertaaltabellen', 'Mapping', 'Testen', 'Opslaan',
];

const uid = () => Math.random().toString(36).slice(2, 10);

export default function AutomationWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);

  // Step 1
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // Step 2
  const [triggerType, setTriggerType] = useState<TriggerType>('manual');
  const [schedule, setSchedule] = useState<ScheduleConfig>({ frequency: 'daily', time: '09:00', interval: 1, dayOfWeek: 1, dayOfMonth: 1 });
  const [chainedAutomationId, setChainedAutomationId] = useState('');
  // Step 3
  const [connectors, setConnectors] = useState<ConnectorLite[]>([]);
  const [targetConnectorId, setTargetConnectorId] = useState('');
  const [updateConnectors, setUpdateConnectors] = useState<AfasEntry[]>([]);
  const [getConnectorsList, setGetConnectorsList] = useState<AfasEntry[]>([]);
  const [updateConnectorId, setUpdateConnectorId] = useState('');
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [metaError, setMetaError] = useState('');
  // Step 4
  const [sources, setSources] = useState<SourceConfig[]>([]);
  // Step 5
  const [previews, setPreviews] = useState<Record<string, { columns: string[]; rows: Record<string, string>[]; error?: string }>>({});
  // Step 6
  const [tables, setTables] = useState<TranslationTable[]>([]);
  // Step 7
  const [fields, setFields] = useState<AfasField[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [mappings, setMappings] = useState<Record<string, FieldMapping>>({});
  // misc
  const [workflows, setWorkflows] = useState<WorkflowLite[]>([]);
  const [visibility, setVisibility] = useState<'tenant' | 'private'>('tenant');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    fetch('/api/connectors').then(r => r.json()).then((d: ConnectorLite[]) =>
      setConnectors(d.filter(c => c.type === 'afas_adapter')));
    fetch('/api/workflows').then(r => r.json()).then(setWorkflows).catch(() => {});
  }, []);

  // Load AFAS connector lists when target integration changes.
  useEffect(() => {
    if (!targetConnectorId) { setUpdateConnectors([]); setGetConnectorsList([]); return; }
    setLoadingMeta(true); setMetaError('');
    fetch(`/api/connectors/${targetConnectorId}/afas`)
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error ?? 'Fout'); return r.json(); })
      .then(d => { setUpdateConnectors(d.updateConnectors ?? []); setGetConnectorsList(d.getConnectors ?? []); })
      .catch(e => setMetaError(e.message))
      .finally(() => setLoadingMeta(false));
  }, [targetConnectorId]);

  const targetConnector = connectors.find(c => c.id === targetConnectorId);

  function gotoStep(n: number) {
    if (n === 4) loadPreviews();
    if (n === 6) loadFields();
    setStep(n);
  }

  async function loadPreviews() {
    const next: typeof previews = {};
    for (const src of sources) {
      if (src.kind === 'csv') {
        next[src.id] = { columns: src.columns ?? [], rows: (src.rows ?? []).slice(0, 25) };
      } else if (src.kind === 'getconnector' && src.connectorId && src.getConnectorId) {
        try {
          const r = await fetch(`/api/connectors/${src.connectorId}/afas/get-data?connector=${encodeURIComponent(src.getConnectorId)}&take=25`);
          const d = await r.json();
          if (!r.ok) throw new Error(d.error ?? 'Fout');
          next[src.id] = { columns: d.columns ?? [], rows: d.rows ?? [] };
          // remember columns on the source for mapping
          setSources(prev => prev.map(s => s.id === src.id ? { ...s, columns: d.columns ?? [] } : s));
        } catch (e) {
          next[src.id] = { columns: [], rows: [], error: e instanceof Error ? e.message : 'Fout' };
        }
      }
    }
    setPreviews(next);
  }

  async function loadFields() {
    if (!targetConnectorId || !updateConnectorId) return;
    setLoadingFields(true);
    try {
      const r = await fetch(`/api/connectors/${targetConnectorId}/afas/update-fields?connector=${encodeURIComponent(updateConnectorId)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Fout');
      const fs: AfasField[] = d.fields ?? [];
      setFields(fs);
      setMappings(prev => {
        const next = { ...prev };
        for (const f of fs) {
          if (!next[f.id]) next[f.id] = { targetField: f.id, targetLabel: f.label, required: f.required, dataType: f.dataType, mode: 'none' };
        }
        return next;
      });
    } catch {
      setFields([]);
    } finally {
      setLoadingFields(false);
    }
  }

  function buildConfig(): AutomationConfig {
    return {
      description,
      trigger: {
        type: triggerType,
        ...(triggerType === 'schedule' ? { schedule } : {}),
        ...(triggerType === 'automation' ? { chainedAutomationId } : {}),
      },
      target: {
        connectorId: targetConnectorId,
        connectorName: targetConnector?.name,
        updateConnectorId,
        updateConnectorLabel: updateConnectors.find(u => u.id === updateConnectorId)?.description,
      },
      sources,
      translationTables: tables,
      mappings: Object.values(mappings).filter(m => m.mode !== 'none'),
    };
  }

  const validation = validateAll(buildConfig(), fields, previews);

  async function save() {
    setSaving(true); setSaveError('');
    const automation = buildConfig();
    const triggerNodeType =
      triggerType === 'schedule' ? 'trigger.schedule' : 'trigger.manual';
    const definition = {
      nodes: [
        { id: 't1', type: triggerNodeType, config: { label: triggerType, schedule } },
        { id: 'a1', type: 'action.afas_sync', config: { label: 'AFAS sync', dryRun: false } },
      ],
      edges: [{ from: 't1', to: 'a1' }],
      automation,
    };
    try {
      const r = await fetch('/api/workflows', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, definition, enabled: false, visibility }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error ?? 'Opslaan mislukt'); }
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  const canNext = (() => {
    switch (step) {
      case 0: return name.trim().length > 0;
      case 1: return triggerType !== 'automation' || !!chainedAutomationId;
      case 2: return !!targetConnectorId && !!updateConnectorId;
      case 3: return sources.length > 0;
      default: return true;
    }
  })();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-3xl p-0 max-h-[92vh] flex flex-col">
        <div className="p-5 border-b">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Nieuwe Automation</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <Stepper step={step} onJump={(n) => n < step && gotoStep(n)} />
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === 0 && (
            <Section title="Stap 1 — Naam" hint="Geef de Automation een herkenbare naam en optioneel een omschrijving.">
              <Field label="Naam"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Bijv. Reiskosten naar AFAS" /></Field>
              <Field label="Omschrijving (optioneel)"><textarea className="input" rows={3} value={description} onChange={e => setDescription(e.target.value)} /></Field>
            </Section>
          )}

          {step === 1 && (
            <Section title="Stap 2 — Trigger" hint="Bepaal wanneer de Automation draait.">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <TriggerCard active={triggerType === 'manual'} onClick={() => setTriggerType('manual')} icon="▶" title="Handmatig" desc="Start zelf met de play-knop." />
                <TriggerCard active={triggerType === 'schedule'} onClick={() => setTriggerType('schedule')} icon="⏰" title="Planning" desc="Op vaste tijden automatisch." />
                <TriggerCard active={triggerType === 'automation'} onClick={() => setTriggerType('automation')} icon="🔗" title="Andere Automation" desc="Start ná een andere Automation." />
                <TriggerCard active={false} disabled icon="⚡" title="Webhook" desc="Binnenkort beschikbaar." />
              </div>

              {triggerType === 'schedule' && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <Field label="Frequentie">
                    <select className="input" value={schedule.frequency} onChange={e => setSchedule({ ...schedule, frequency: e.target.value as ScheduleConfig['frequency'] })}>
                      <option value="hourly">Elk uur</option>
                      <option value="daily">Dagelijks</option>
                      <option value="weekly">Wekelijks</option>
                      <option value="monthly">Maandelijks</option>
                    </select>
                  </Field>
                  {schedule.frequency === 'hourly' && (
                    <Field label="Elke … uur"><input type="number" min={1} max={24} className="input" value={schedule.interval ?? 1} onChange={e => setSchedule({ ...schedule, interval: Number(e.target.value) })} /></Field>
                  )}
                  {schedule.frequency === 'weekly' && (
                    <Field label="Dag van de week">
                      <select className="input" value={schedule.dayOfWeek ?? 1} onChange={e => setSchedule({ ...schedule, dayOfWeek: Number(e.target.value) })}>
                        {['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'].map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </Field>
                  )}
                  {schedule.frequency === 'monthly' && (
                    <Field label="Dag van de maand"><input type="number" min={1} max={31} className="input" value={schedule.dayOfMonth ?? 1} onChange={e => setSchedule({ ...schedule, dayOfMonth: Number(e.target.value) })} /></Field>
                  )}
                  {schedule.frequency !== 'hourly' && (
                    <Field label="Tijdstip"><input type="time" className="input" value={schedule.time ?? '09:00'} onChange={e => setSchedule({ ...schedule, time: e.target.value })} /></Field>
                  )}
                  <p className="text-xs text-gray-500">Samenvatting: <strong>{describeSchedule(schedule)}</strong></p>
                </div>
              )}

              {triggerType === 'automation' && (
                <Field label="Welke Automation start deze?">
                  <select className="input" value={chainedAutomationId} onChange={e => setChainedAutomationId(e.target.value)}>
                    <option value="">— kies een Automation —</option>
                    {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </Field>
              )}
            </Section>
          )}

          {step === 2 && (
            <Section title="Stap 3 — Doel" hint="Kies de AFAS-integratie en de UpdateConnector waarnaar je gaat schrijven.">
              <Field label="Integratie">
                <select className="input" value={targetConnectorId} onChange={e => { setTargetConnectorId(e.target.value); setUpdateConnectorId(''); }}>
                  <option value="">— kies een integratie —</option>
                  {connectors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {connectors.length === 0 && <p className="text-xs text-amber-600 mt-1">Geen AFAS-integraties gevonden. Maak er eerst één aan onder Integrations.</p>}
              </Field>
              {loadingMeta && <p className="text-sm text-gray-500">Connectoren ophalen…</p>}
              {metaError && <p className="text-sm text-red-600">{metaError}</p>}
              {targetConnectorId && !loadingMeta && (
                <Field label="UpdateConnector (doel)">
                  <select className="input" value={updateConnectorId} onChange={e => setUpdateConnectorId(e.target.value)}>
                    <option value="">— kies een UpdateConnector —</option>
                    {updateConnectors.map(u => <option key={u.id} value={u.id}>{u.id}{u.description ? ` — ${u.description}` : ''}</option>)}
                  </select>
                </Field>
              )}
            </Section>
          )}

          {step === 3 && (
            <SourcesStep
              sources={sources} setSources={setSources}
              getConnectorsList={getConnectorsList}
              targetConnectorId={targetConnectorId}
            />
          )}

          {step === 4 && (
            <Section title="Stap 5 — Voorbeeld" hint={sources.length > 1 ? 'Controleer de gegevens en stel per bron de koppelsleutel in zodat regels correct worden samengevoegd.' : 'Een voorbeeld van de gegevens uit elke bron.'}>
              {sources.length === 0 && <p className="text-sm text-gray-500">Geen bronnen.</p>}
              {sources.map((src, srcIdx) => {
                const p = previews[src.id];
                const cols = p?.columns ?? [];
                return (
                  <div key={src.id} className="mb-5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">{src.name} <span className="text-xs text-gray-400">({src.kind})</span></p>
                      {sources.length > 1 && cols.length > 0 && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500">{srcIdx === 0 ? 'Primaire sleutel:' : 'Koppelsleutel:'}</label>
                          <select
                            className="input text-xs py-0.5 w-44"
                            value={src.joinKey ?? ''}
                            onChange={e => setSources(sources.map(s => s.id === src.id ? { ...s, joinKey: e.target.value || undefined } : s))}
                          >
                            <option value="">— geen koppeling —</option>
                            {cols.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                    {!p ? <p className="text-xs text-gray-400">Laden…</p> :
                      p.error ? <p className="text-xs text-red-600">{p.error}</p> :
                      <DataTable columns={p.columns} rows={p.rows} />}
                  </div>
                );
              })}
              {sources.length > 1 && sources.some(s => s.joinKey) && !sources.every(s => s.joinKey) && (
                <p className="text-xs text-amber-600">Tip: stel voor alle bronnen een koppelsleutel in voor een correcte koppeling.</p>
              )}
            </Section>
          )}

          {step === 5 && (
            <TranslationStep tables={tables} setTables={setTables} />
          )}

          {step === 6 && (
            <MappingStep
              loading={loadingFields} fields={fields}
              mappings={mappings} setMappings={setMappings}
              sources={sources} previews={previews} tables={tables}
            />
          )}

          {step === 7 && (
            <Section title="Stap 8 — Testen" hint="Controle of de configuratie klopt vóór opslaan.">
              <ValidationReport report={validation} />
            </Section>
          )}

          {step === 8 && (
            <Section title="Stap 9 — Opslaan" hint="Sla de Automation op. Deze wordt uitgeschakeld opgeslagen — je kunt 'm daarna activeren of handmatig draaien.">
              <SummaryReview config={buildConfig()} name={name} valid={validation.ok} />
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <label className="text-sm font-medium text-gray-700 block mb-2">Zichtbaarheid</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="visibility" value="tenant" checked={visibility === 'tenant'} onChange={() => setVisibility('tenant')} />
                    <span className="text-sm">Iedereen in de organisatie</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="visibility" value="private" checked={visibility === 'private'} onChange={() => setVisibility('private')} />
                    <span className="text-sm">Alleen ikzelf</span>
                  </label>
                </div>
              </div>
              {saveError && <p className="text-sm text-red-600 mt-3">{saveError}</p>}
            </Section>
          )}
        </div>

        <div className="p-4 border-t flex items-center justify-between">
          <button className="btn-secondary" onClick={() => step === 0 ? onClose() : gotoStep(step - 1)}>
            {step === 0 ? 'Annuleren' : '← Vorige'}
          </button>
          <span className="text-xs text-gray-400">Stap {step + 1} van {STEPS.length}</span>
          {step < STEPS.length - 1 ? (
            <button className="btn-primary" disabled={!canNext} onClick={() => gotoStep(step + 1)}>Volgende →</button>
          ) : (
            <button className="btn-primary" disabled={saving || !name} onClick={save}>{saving ? 'Opslaan…' : 'Opslaan & sluiten'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function Stepper({ step, onJump }: { step: number; onJump: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center">
          <button
            onClick={() => onJump(i)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs whitespace-nowrap ${
              i === step ? 'bg-blue-600 text-white' : i < step ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${i === step ? 'bg-white text-blue-600' : i < step ? 'bg-blue-100' : 'bg-gray-100'}`}>{i + 1}</span>
            {label}
          </button>
          {i < STEPS.length - 1 && <span className="text-gray-300 mx-0.5">›</span>}
        </div>
      ))}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold mb-1">{title}</h3>
      {hint && <p className="text-sm text-gray-500 mb-4">{hint}</p>}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>;
}

function TriggerCard({ active, disabled, icon, title, desc, onClick }: { active: boolean; disabled?: boolean; icon: string; title: string; desc: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      className={`text-left p-3 rounded-lg border-2 transition ${active ? 'border-blue-600 bg-blue-50' : disabled ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed' : 'border-gray-200 hover:border-gray-300'}`}
    >
      <div className="text-xl mb-1">{icon}</div>
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-gray-500">{desc}</div>
    </button>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: Record<string, string>[] }) {
  if (columns.length === 0) return <p className="text-xs text-gray-400">Geen gegevens.</p>;
  return (
    <div className="border rounded-lg overflow-auto max-h-64">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 border-b sticky top-0">
          <tr>{columns.map(c => <th key={c} className="text-left p-2 font-medium text-gray-600 whitespace-nowrap">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, 25).map((row, i) => (
            <tr key={i} className="border-b last:border-0">
              {columns.map(c => <td key={c} className="p-2 whitespace-nowrap text-gray-700">{String(row[c] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 25 && <p className="text-[11px] text-gray-400 p-2">… en {rows.length - 25} meer regels</p>}
    </div>
  );
}

function SourcesStep({ sources, setSources, getConnectorsList, targetConnectorId }: {
  sources: SourceConfig[]; setSources: (s: SourceConfig[]) => void;
  getConnectorsList: AfasEntry[]; targetConnectorId: string;
}) {
  const [pickGet, setPickGet] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');

  function addGet() {
    if (!pickGet) return;
    const entry = getConnectorsList.find(g => g.id === pickGet);
    setSources([...sources, {
      id: uid(), kind: 'getconnector', name: entry?.description ? `${pickGet} — ${entry.description}` : pickGet,
      connectorId: targetConnectorId, getConnectorId: pickGet,
    }]);
    setPickGet('');
  }

  async function uploadCsv(file: File) {
    setUploading(true); setUploadErr('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/parse/spreadsheet', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Upload mislukt');
      setSources([...sources, { id: uid(), kind: 'csv', name: file.name, columns: d.columns, rows: d.rows }]);
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : 'Upload mislukt');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Section title="Stap 4 — Bronnen" hint="Kies één of meer GetConnectors, of upload een CSV/Excel-bestand.">
      {sources.length > 0 && (
        <div className="space-y-2">
          {sources.map(s => (
            <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
              <div>
                <span className="text-sm font-medium">{s.name}</span>
                <span className="text-xs text-gray-400 ml-2">{s.kind === 'csv' ? `${s.rows?.length ?? 0} regels` : 'GetConnector'}</span>
              </div>
              <button className="btn-danger text-xs py-1" onClick={() => setSources(sources.filter(x => x.id !== s.id))}>Verwijder</button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        <Field label="GetConnector toevoegen">
          <div className="flex gap-2">
            <select className="input flex-1" value={pickGet} onChange={e => setPickGet(e.target.value)}>
              <option value="">— kies een GetConnector —</option>
              {getConnectorsList.map(g => <option key={g.id} value={g.id}>{g.id}{g.description ? ` — ${g.description}` : ''}</option>)}
            </select>
            <button className="btn-secondary" disabled={!pickGet} onClick={addGet}>Toevoegen</button>
          </div>
        </Field>
        <div>
          <label className="label">Of upload CSV / Excel (.csv, .xlsx)</label>
          <input type="file" accept=".csv,.xlsx" disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadCsv(f); e.target.value = ''; }}
            className="text-sm" />
          {uploading && <p className="text-xs text-gray-500 mt-1">Bestand verwerken…</p>}
          {uploadErr && <p className="text-xs text-red-600 mt-1">{uploadErr}</p>}
        </div>
      </div>
    </Section>
  );
}

function TranslationStep({ tables, setTables }: { tables: TranslationTable[]; setTables: (t: TranslationTable[]) => void }) {
  const [uploadFor, setUploadFor] = useState('');

  function addTable() { setTables([...tables, { id: uid(), name: `Vertaaltabel ${tables.length + 1}`, entries: [{ source: '', target: '' }] }]); }
  function update(id: string, patch: Partial<TranslationTable>) { setTables(tables.map(t => t.id === id ? { ...t, ...patch } : t)); }
  function remove(id: string) { setTables(tables.filter(t => t.id !== id)); }

  async function importInto(id: string, file: File) {
    setUploadFor(id);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/parse/spreadsheet', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Import mislukt');
      const cols: string[] = d.columns ?? [];
      const srcCol = cols[0]; const tgtCol = cols[1];
      const entries = (d.rows ?? []).map((row: Record<string, string>) => ({ source: String(row[srcCol] ?? ''), target: String(row[tgtCol] ?? '') })).filter((e: { source: string }) => e.source);
      update(id, { entries });
    } catch {
      // silently ignore; user can retry
    } finally {
      setUploadFor('');
    }
  }

  return (
    <Section title="Stap 6 — Vertaaltabellen" hint="Optioneel: zet bronwaarden om naar doelwaarden. Handmatig of importeren via CSV/Excel (eerste kolom = bron, tweede = doel).">
      {tables.map(t => (
        <div key={t.id} className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input className="input flex-1" value={t.name} onChange={e => update(t.id, { name: e.target.value })} />
            <button className="btn-danger text-xs py-1" onClick={() => remove(t.id)}>Verwijder tabel</button>
          </div>
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-gray-500"><span>Waarde bron</span><span>Waarde doel</span><span></span></div>
            {t.entries.map((e, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input className="input" value={e.source} onChange={ev => update(t.id, { entries: t.entries.map((x, xi) => xi === i ? { ...x, source: ev.target.value } : x) })} />
                <input className="input" value={e.target} onChange={ev => update(t.id, { entries: t.entries.map((x, xi) => xi === i ? { ...x, target: ev.target.value } : x) })} />
                <button className="text-red-500 px-2" onClick={() => update(t.id, { entries: t.entries.filter((_, xi) => xi !== i) })}>×</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <button className="btn-secondary text-xs py-1" onClick={() => update(t.id, { entries: [...t.entries, { source: '', target: '' }] })}>+ Regel</button>
            <label className="text-xs text-blue-600 cursor-pointer hover:underline">
              {uploadFor === t.id ? 'Importeren…' : 'Importeer CSV/Excel'}
              <input type="file" accept=".csv,.xlsx" className="hidden" onChange={ev => { const f = ev.target.files?.[0]; if (f) importInto(t.id, f); ev.target.value = ''; }} />
            </label>
          </div>
        </div>
      ))}
      <button className="btn-secondary" onClick={addTable}>+ Vertaaltabel toevoegen</button>
    </Section>
  );
}

function MappingStep({ loading, fields, mappings, setMappings, sources, previews, tables }: {
  loading: boolean; fields: AfasField[];
  mappings: Record<string, FieldMapping>; setMappings: React.Dispatch<React.SetStateAction<Record<string, FieldMapping>>>;
  sources: SourceConfig[]; previews: Record<string, { columns: string[]; rows: Record<string, string>[] }>; tables: TranslationTable[];
}) {
  function patch(field: string, p: Partial<FieldMapping>) {
    setMappings(prev => ({ ...prev, [field]: { ...prev[field], ...p } }));
  }
  const colsFor = (sourceId?: string) => {
    const src = sources.find(s => s.id === sourceId);
    return src?.columns ?? previews[sourceId ?? '']?.columns ?? [];
  };

  if (loading) return <Section title="Stap 7 — Mapping"><p className="text-sm text-gray-500">Velden ophalen…</p></Section>;
  if (fields.length === 0) return <Section title="Stap 7 — Mapping"><p className="text-sm text-amber-600">Geen velden gevonden voor deze UpdateConnector.</p></Section>;

  return (
    <Section title="Stap 7 — Mapping" hint="Bepaal per veld waar de waarde vandaan komt. Verplichte velden zijn rood gemarkeerd.">
      <div className="space-y-2">
        {fields.map(f => {
          const m = mappings[f.id] ?? { targetField: f.id, required: f.required, mode: 'none' as MappingMode };
          return (
            <div key={f.id} className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{f.label}</span>
                  <span className="text-[11px] font-mono text-gray-400">{f.id}</span>
                  {f.required
                    ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">verplicht</span>
                    : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">optioneel</span>}
                </div>
                <select className="input text-xs py-1 w-36" value={m.mode} onChange={e => patch(f.id, { mode: e.target.value as MappingMode })}>
                  <option value="none">— niet vullen —</option>
                  <option value="fixed">Vaste waarde</option>
                  <option value="source">Uit bron (1-op-1)</option>
                </select>
              </div>

              {m.mode === 'fixed' && (
                <input className="input" placeholder="Vaste waarde" value={m.fixedValue ?? ''} onChange={e => patch(f.id, { fixedValue: e.target.value })} />
              )}
              {m.mode === 'source' && (
                <div className="grid grid-cols-2 gap-2">
                  <select className="input" value={m.sourceId ?? ''} onChange={e => patch(f.id, { sourceId: e.target.value, sourceField: '' })}>
                    <option value="">— bron —</option>
                    {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <select className="input" value={m.sourceField ?? ''} onChange={e => patch(f.id, { sourceField: e.target.value })}>
                    <option value="">— bronveld —</option>
                    {colsFor(m.sourceId).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              {m.mode !== 'none' && tables.length > 0 && (
                <div className="mt-2">
                  <label className="text-xs text-gray-500">Vertaaltabel (optioneel)</label>
                  <select className="input text-xs py-1" value={m.translationTableId ?? ''} onChange={e => patch(f.id, { translationTableId: e.target.value || undefined })}>
                    <option value="">— geen —</option>
                    {tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

interface ValReport { ok: boolean; errors: string[]; warnings: string[] }

function validateAll(config: AutomationConfig, fields: AfasField[], previews: Record<string, { rows: Record<string, string>[] }>): ValReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.target.connectorId || !config.target.updateConnectorId) errors.push('Geen doel-UpdateConnector gekozen.');
  if (config.sources.length === 0) errors.push('Geen bron geconfigureerd.');

  const mapByField = new Map(config.mappings.map(m => [m.targetField, m]));
  for (const f of fields) {
    if (f.required) {
      const m = mapByField.get(f.id);
      if (!m || m.mode === 'none') errors.push(`Verplicht veld "${f.label}" is niet gemapt.`);
      else if (m.mode === 'fixed' && !(m.fixedValue ?? '').trim()) errors.push(`Verplicht veld "${f.label}" heeft een lege vaste waarde.`);
      else if (m.mode === 'source' && (!m.sourceId || !m.sourceField)) errors.push(`Verplicht veld "${f.label}" heeft geen bronveld.`);
    }
  }

  for (const m of config.mappings) {
    if (m.mode === 'source' && m.sourceId) {
      const prev = previews[m.sourceId];
      if (prev && m.sourceField && prev.rows.length > 0 && !(m.sourceField in prev.rows[0])) {
        warnings.push(`Bronveld "${m.sourceField}" niet teruggevonden in voorbeelddata.`);
      }
    }
    if (m.translationTableId) {
      const table = config.translationTables.find(t => t.id === m.translationTableId);
      const prev = m.sourceId ? previews[m.sourceId] : undefined;
      if (table && prev && m.sourceField) {
        const values = new Set(prev.rows.map(r => String(r[m.sourceField!] ?? '')));
        const mapped = new Set(table.entries.map(e => e.source));
        const missing = [...values].filter(v => v && !mapped.has(v)).slice(0, 5);
        if (missing.length) warnings.push(`Vertaaltabel "${table.name}" mist waarden: ${missing.join(', ')}.`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function ValidationReport({ report }: { report: ValReport }) {
  return (
    <div className="space-y-3">
      <div className={`px-4 py-3 rounded-lg text-sm font-medium ${report.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
        {report.ok ? '✅ Alle controles geslaagd — klaar om op te slaan.' : `❌ ${report.errors.length} probleem(en) gevonden.`}
      </div>
      {report.errors.length > 0 && (
        <ul className="text-sm text-red-700 list-disc pl-5 space-y-1">{report.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
      )}
      {report.warnings.length > 0 && (
        <div>
          <p className="text-sm font-medium text-amber-700 mb-1">Waarschuwingen</p>
          <ul className="text-sm text-amber-700 list-disc pl-5 space-y-1">{report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function SummaryReview({ config, name, valid }: { config: AutomationConfig; name: string; valid: boolean }) {
  const row = (k: string, v: string) => <div className="flex justify-between py-1 border-b last:border-0"><span className="text-gray-500">{k}</span><span className="font-medium text-right">{v}</span></div>;
  return (
    <div className="text-sm">
      {row('Naam', name)}
      {row('Trigger', config.trigger.type === 'schedule' ? describeSchedule(config.trigger.schedule) : config.trigger.type)}
      {row('Doel', config.target.updateConnectorId || '—')}
      {row('Bronnen', config.sources.map(s => s.name).join(', ') || '—')}
      {row('Vertaaltabellen', String(config.translationTables.length))}
      {row('Gemapte velden', String(config.mappings.length))}
      {!valid && <p className="text-amber-600 mt-3 text-xs">Let op: er zijn nog validatieproblemen. Je kunt opslaan, maar de Automation draait mogelijk niet correct.</p>}
    </div>
  );
}
