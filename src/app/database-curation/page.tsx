'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Download, Save } from 'lucide-react';

import RootContainer from '@/components/RootContainer';
import CurationCombinedTreeAlignment from '@/components/CurationCombinedTreeAlignment';
import receptors from '../../../public/receptors.json';

interface Receptor {
  geneName: string;
  class: string;
  numOrthologs: number;
  lca: string;
  gpcrdbId: string;
  tree: string;
  alignment: string;
  conservationFile: string;
  snakePlot: string;
  svgTree: string;
  name: string;
}

type PerReceptorCuration = {
  curated: boolean;
  maskedSequenceHeaders: string[];
  curationNote?: string;
  updatedAt: string;
};

type CurationStore = Record<string, PerReceptorCuration>;
type CurationPayload = {
  generatedAt: string;
  totalReceptors: number;
  curatedCount: number;
  receptors: Array<{
    geneName: string;
    class: string;
    curated: boolean;
    maskedSequenceHeaders: string[];
    curationNote?: string | null;
    updatedAt: string | null;
  }>;
};

const STORAGE_KEY = 'gpcr-curation-v1';

function payloadToStore(payload: CurationPayload): CurationStore {
  const next: CurationStore = {};
  for (const receptor of payload.receptors) {
    next[receptor.geneName] = {
      curated: receptor.curated,
      maskedSequenceHeaders: receptor.maskedSequenceHeaders ?? [],
      curationNote: receptor.curationNote ?? '',
      updatedAt: receptor.updatedAt ?? new Date(0).toISOString(),
    };
  }
  return next;
}

export default function DatabaseCurationPage() {
  const receptorList = receptors as Receptor[];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [newick, setNewick] = useState('');
  const [alignmentFasta, setAlignmentFasta] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [store, setStore] = useState<CurationStore>({});
  const [statusMessage, setStatusMessage] = useState('');
  const [pendingSelectionCount, setPendingSelectionCount] = useState(0);
  const [unsavedChangeCount, setUnsavedChangeCount] = useState(0);
  const [saveAfterStoreUpdate, setSaveAfterStoreUpdate] = useState(false);
  const pendingSelectionBufferRef = useRef<string[]>([]);

  const receptor = receptorList[currentIndex] ?? null;
  const totalReceptors = receptorList.length;

  useEffect(() => {
    let cancelled = false;

    const loadInitialData = async () => {
      try {
        const response = await fetch('/api/curation-masks');
        if (!response.ok) throw new Error('Failed to load saved curation file.');
        const body = (await response.json()) as { exists: boolean; data: CurationPayload | null };
        if (cancelled) return;

        if (body.exists && body.data) {
          setStore(payloadToStore(body.data));
          setStatusMessage('Loaded saved curation file from public/manual_curation.json');
          setPendingSelectionCount(0);
          setUnsavedChangeCount(0);
          pendingSelectionBufferRef.current = [];
          return;
        }
      } catch {
        // fallback to local storage
      }

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as CurationStore;
        if (cancelled) return;
        setStore(parsed);
        setStatusMessage('Loaded curation state from browser local storage.');
        setPendingSelectionCount(0);
        setUnsavedChangeCount(0);
        pendingSelectionBufferRef.current = [];
      } catch {
        if (!cancelled) setStore({});
      }
    };

    loadInitialData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // no-op on storage write issues
    }
  }, [store]);

  useEffect(() => {
    if (!receptor) return;
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all([fetch(receptor.tree).then(r => r.text()), fetch(receptor.alignment).then(r => r.text())])
      .then(([treeData, alignmentData]) => {
        if (cancelled) return;
        setNewick(treeData.trim());
        setAlignmentFasta(alignmentData);
      })
      .catch(() => {
        if (cancelled) return;
        setNewick('');
        setAlignmentFasta('');
        setError('Failed to load tree/alignment files for this receptor.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [receptor]);

  const receptorState: PerReceptorCuration = useMemo(() => {
    if (!receptor) {
      return { curated: false, maskedSequenceHeaders: [], curationNote: '', updatedAt: new Date(0).toISOString() };
    }
    return (
      store[receptor.geneName] ?? {
        curated: false,
        maskedSequenceHeaders: [],
        curationNote: '',
        updatedAt: new Date(0).toISOString(),
      }
    );
  }, [store, receptor]);

  const maskedSet = useMemo(() => new Set(receptorState.maskedSequenceHeaders), [receptorState.maskedSequenceHeaders]);

  const curatedCount = useMemo(() => Object.values(store).filter(r => r.curated).length, [store]);

  const updateCurrentReceptor = (next: Partial<PerReceptorCuration>) => {
    if (!receptor) return;
    setStore(prev => {
      const existing = prev[receptor.geneName] ?? {
        curated: false,
        maskedSequenceHeaders: [],
        curationNote: '',
        updatedAt: new Date(0).toISOString(),
      };
      return {
        ...prev,
        [receptor.geneName]: {
          ...existing,
          ...next,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  const setMasked = (header: string, checked: boolean) => {
    const next = new Set(maskedSet);
    if (checked) next.add(header);
    else next.delete(header);
    updateCurrentReceptor({ maskedSequenceHeaders: [...next] });
    if (receptor) {
      pendingSelectionBufferRef.current.push(`${receptor.geneName}:${header}`);
      const bufferedCount = pendingSelectionBufferRef.current.length;
      setPendingSelectionCount(bufferedCount);
      setUnsavedChangeCount(count => count + 1);
      setStatusMessage(`Buffered selections: ${bufferedCount}/20 (auto-save at 20)`);
    }
  };

  const toggleMaskedHeader = (header: string) => {
    setMasked(header, !maskedSet.has(header));
  };

  const buildPayload = useCallback(
    (): CurationPayload => ({
      generatedAt: new Date().toISOString(),
      totalReceptors,
      curatedCount,
      receptors: receptorList.map(r => ({
        geneName: r.geneName,
        class: r.class,
        curated: store[r.geneName]?.curated ?? false,
        maskedSequenceHeaders: store[r.geneName]?.maskedSequenceHeaders ?? [],
        curationNote: (store[r.geneName]?.curationNote ?? '').trim() || null,
        updatedAt: store[r.geneName]?.updatedAt ?? null,
      })),
    }),
    [curatedCount, receptorList, store, totalReceptors]
  );

  const downloadJson = () => {
    const payload = buildPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'manual_curation.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusMessage('Downloaded manual_curation.json');
  };

  const saveToProjectJson = useCallback(
    async (reason: 'manual' | 'threshold' | 'curated' | 'navigation' = 'manual'): Promise<boolean> => {
      setStatusMessage(reason === 'manual' ? 'Saving...' : 'Auto-saving...');
    try {
      const payload = buildPayload();
      const response = await fetch('/api/curation-masks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? 'Save failed.');
      }

      if (reason === 'threshold') {
        setStatusMessage('Auto-saved to public/manual_curation.json after 20 selections.');
      } else if (reason === 'curated') {
        setStatusMessage('Auto-saved to public/manual_curation.json (curated flag changed).');
      } else if (reason === 'navigation') {
        setStatusMessage('Auto-saved to public/manual_curation.json before navigation.');
      } else {
        setStatusMessage('Saved to public/manual_curation.json');
      }
      setUnsavedChangeCount(0);
      pendingSelectionBufferRef.current = [];
      setPendingSelectionCount(0);
      return true;
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Failed to save curation file.');
      return false;
    }
    },
    [buildPayload]
  );

  const flushIfUnsaved = useCallback(async (): Promise<boolean> => {
    if (unsavedChangeCount <= 0) return true;
    return await saveToProjectJson('navigation');
  }, [saveToProjectJson, unsavedChangeCount]);

  useEffect(() => {
    if (pendingSelectionCount < 20) return;
    void saveToProjectJson('threshold');
  }, [pendingSelectionCount, saveToProjectJson]);

  useEffect(() => {
    if (!saveAfterStoreUpdate) return;
    setSaveAfterStoreUpdate(false);
    void saveToProjectJson('curated');
  }, [saveAfterStoreUpdate, saveToProjectJson, store]);

  if (!receptor) {
    return (
      <RootContainer>
        <p className="text-muted-foreground">No receptor data found.</p>
      </RootContainer>
    );
  }

  return (
    <RootContainer>
      <div className="rounded-lg bg-card p-6 text-card-foreground shadow-md space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Link>
            <h1 className="text-2xl font-semibold mt-2">Receptor Database Curation</h1>
            <p className="text-sm text-muted-foreground">
              Receptor {currentIndex + 1} of {totalReceptors} | Curated: {curatedCount}/{totalReceptors}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              onClick={() => {
                void saveToProjectJson('manual');
              }}
            >
              <Save className="h-4 w-4" />
              Save to project JSON
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              onClick={downloadJson}
            >
              <Download className="h-4 w-4" />
              Export JSON
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
            onClick={async () => {
              const ok = await flushIfUnsaved();
              if (!ok) return;
              setCurrentIndex(i => Math.max(0, i - 1));
            }}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
            onClick={async () => {
              const ok = await flushIfUnsaved();
              if (!ok) return;
              setCurrentIndex(i => Math.min(totalReceptors - 1, i + 1));
            }}
            disabled={currentIndex === totalReceptors - 1}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
          <label className="ml-2 inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={receptorState.curated}
              onChange={e => {
                updateCurrentReceptor({ curated: e.target.checked });
                setUnsavedChangeCount(count => count + 1);
                setSaveAfterStoreUpdate(true);
              }}
            />
            Mark this receptor as curated
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="receptor-jump" className="text-sm text-muted-foreground">
            Jump to receptor
          </label>
          <select
            id="receptor-jump"
            className="rounded-md border bg-background px-3 py-1.5 text-sm min-w-[340px]"
            value={currentIndex}
            onChange={async e => {
              const nextIndex = Number(e.target.value);
              if (!Number.isFinite(nextIndex)) return;
              const ok = await flushIfUnsaved();
              if (!ok) return;
              setCurrentIndex(nextIndex);
            }}
          >
            {receptorList.map((r, idx) => {
              const done = store[r.geneName]?.curated ?? false;
              const hasNote = Boolean((store[r.geneName]?.curationNote ?? '').trim());
              const marker = done ? '[x]' : '[ ]';
              return (
                <option key={r.geneName} value={idx}>
                  {marker} {hasNote ? '[note]' : ''} {r.geneName} - {r.name}
                </option>
              );
            })}
          </select>
        </div>

        <div className="text-sm">
          <span className="font-medium">{receptor.geneName}</span> - {receptor.name} | class {receptor.class} | orthologs{' '}
          {receptor.numOrthologs}
        </div>
        {statusMessage ? <p className="text-xs text-muted-foreground">{statusMessage}</p> : null}
      </div>

      <div className="rounded-lg bg-card p-2 text-card-foreground shadow-md" style={{ height: 620 }}>
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-destructive">{error}</div>
        ) : newick ? (
          <CurationCombinedTreeAlignment
            newick={newick}
            alignmentFasta={alignmentFasta}
            receptor={receptor}
            maskedHeaders={receptorState.maskedSequenceHeaders}
            onToggleMaskedHeader={toggleMaskedHeader}
            height={600}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No tree/alignment found for this receptor.
          </div>
        )}
      </div>

      <div className="rounded-lg bg-card p-6 text-card-foreground shadow-md space-y-4">
        <h2 className="text-lg font-semibold">Interactive Masking</h2>
        <p className="text-sm text-muted-foreground">
          Click sequence rows directly in the MSA view to toggle masking. Masked rows are shown with transparent light red
          overlay and are auto-saved to <code>public/manual_curation.json</code> every 20 selections. Saving is also
          forced when you mark curated or navigate to the next/previous receptor with unsaved changes.
        </p>
        <p className="text-sm text-muted-foreground">
          Masked sequence count for this receptor: {receptorState.maskedSequenceHeaders.length}
        </p>

        <div className="space-y-2 pt-2">
          <label htmlFor="curation-note" className="text-sm font-medium">
            Quality / Curation Note
          </label>
          <textarea
            id="curation-note"
            className="w-full min-h-[96px] rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Optional note for this receptor (quality caveats, unusual tree behavior, sequence concerns, etc.)"
            value={receptorState.curationNote ?? ''}
            onChange={e => {
              updateCurrentReceptor({ curationNote: e.target.value });
              setUnsavedChangeCount(count => count + 1);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Optional. Saved to <code>public/manual_curation.json</code> only for receptors where you enter text.
          </p>
        </div>
      </div>
    </RootContainer>
  );
}
