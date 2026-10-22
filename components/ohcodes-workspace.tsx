'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OhcodesManual } from '@/components/ohcodes-manual';
import styles from '@/app/ohcodes/ohcodes.module.css';
import {
  PARTS, NOTE_PARTS, INSTRUMENTS, PART_NAMES, STARTER, STEP_DIVISIONS, completeSoundbank, completeEffect, draftMeter, drumRows, effectCompletion, emptyRow, isDrumPart,
  gridLabel, namedSource, parsePassage, passageBarCount, preparedPassage, GROOVE_MODIFIERS, grooveCompletion, completeGroove, passageHits,
  readArrangement, readPassages, renameSongPassage, resizeRowSteps, rowEffects, setArrangement, setRowEffect, soundbankCompletion, stepLabel, stepModel, toggleRowStep,
  type Part, type PassageDraft, type QueuedPassage, type SoundbankCompletion, type EffectCompletion, type SongEntry, type GrooveCompletion, type GrooveId,
} from '@/lib/ohcodes-language';
import { SOUNDBANKS, searchSoundbanks, type SoundbankId } from '@/lib/ohcodes-soundbanks';
import { effectLabel, searchEffects, type Effect, type EffectId } from '@/lib/ohcodes-effects';
import { createTrackMixer } from '@/lib/ohcodes-tracks';
import { DEFAULT_PROJECT_NAME, DRAFT_KEY, PREVIOUS_KEY, MAX_CODE_LENGTH, MAX_PROJECT_BYTES, DraftConflict, createProject, parseProject, prepareProject, projectFilename, projectFingerprint, replaceDraft, saveDraft, serializeProject, type OhcodesProject } from '@/lib/ohcodes-project';
import { prepareSong, songFrame, updateSongPassage, type PreparedSong, type SongFrame } from '@/lib/ohcodes-song';
import { scanCode, activeBrackets, instrumentCompletion, completeInstrument, instrumentOptions, parameterHelp, diagnoseCode, type InstrumentCompletion, type Diagnostic } from '@/lib/ohcodes-editor';
import { scaleCompletion, completeScale, trackId, trackLabel, trackIsAudible, type ScaleCompletion } from '@/lib/ohcodes-language';
import { selectionCompletion, completeSelection, type SelectionCompletion } from '@/lib/ohcodes-editor';
import { searchScales } from '@/lib/ohcodes-scales';

type HintPosition = { left: number; top: number; width: number };
type EditorCompletion = (SoundbankCompletion & { kind: 'timbre' } | EffectCompletion & { kind: 'effect' } | GrooveCompletion & { kind: 'groove' } | ScaleCompletion & { kind: 'scale' } | InstrumentCompletion | SelectionCompletion) & { position: HintPosition };
type ParameterHint = NonNullable<ReturnType<typeof parameterHelp>> & { position: HintPosition };
type TransportMode = 'live' | 'song';
type SongUpdate = { song: PreparedSong; reset: boolean; kind?: 'effect' };
type LiveUpdate = QueuedPassage & { live?: boolean };

// Measure the textarea's real font/padding, including tabs and both scroll axes.
function completionPosition(editor: HTMLTextAreaElement, cursor: number, resultCount: number) {
  const parent = editor.parentElement!;
  const mirror = editor.ownerDocument.createElement('div');
  const computed = window.getComputedStyle(editor);
  for (const property of ['font', 'letter-spacing', 'line-height', 'tab-size', 'padding-top', 'padding-left', 'border-top-width', 'border-left-width']) {
    mirror.style.setProperty(property, computed.getPropertyValue(property));
  }
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre', top: '0', left: '0', pointerEvents: 'none' });
  mirror.textContent = editor.value.slice(0, cursor);
  const caret = editor.ownerDocument.createElement('span');
  caret.textContent = '|';
  mirror.appendChild(caret);
  parent.appendChild(mirror);
  const x = editor.offsetLeft + caret.offsetLeft - editor.scrollLeft;
  const y = editor.offsetTop + caret.offsetTop - editor.scrollTop;
  mirror.remove();
  const width = Math.min(300, parent.clientWidth - editor.offsetLeft - 16);
  const height = Math.min(196, Math.max(1, resultCount) * 42 + 30);
  const lineHeight = parseFloat(computed.lineHeight) || 28;
  // Inline spans report their glyph box, not the full line box. A caret on the
  // last visible line must still get help, even when its leading is clipped.
  if (y + lineHeight < 0 || y > parent.clientHeight || x < editor.offsetLeft || x > parent.clientWidth) return null;
  const below = y + lineHeight + 4;
  return { left: Math.max(editor.offsetLeft + 8, Math.min(x, parent.clientWidth - width - 8)), top: below + height < parent.clientHeight ? below : Math.max(4, y - height - 4), width };
}

export function OhcodesWorkspace() {
  const [workspaceView, setWorkspaceView] = useState<'studio' | 'manual'>('studio');
  const viewScrollRef = useRef({ studio: 0, manual: 0 });
  const initialScore = useMemo(() => parsePassage(STARTER, 'Passage 1'), []);
  const [code, setCode] = useState(STARTER);
  const [projectName, setProjectName] = useState(DEFAULT_PROJECT_NAME);
  const [projectReady, setProjectReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Loading browser draft…');
  const [saveWarning, setSaveWarning] = useState(false);
  const [projectNotice, setProjectNotice] = useState('');
  const [pendingProject, setPendingProject] = useState<{ project: OhcodesProject; label: string } | null>(null);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [recoveryRaw, setRecoveryRaw] = useState<string | null>(null);
  const [openingProject, setOpeningProject] = useState(false);
  const [score, setScore] = useState(initialScore);
  const [queuedScore, setQueuedScore] = useState<LiveUpdate | null>(null);
  const [mode, setMode] = useState<TransportMode>('live');
  const [queuedSong, setQueuedSong] = useState<SongUpdate | null>(null);
  const [songProgress, setSongProgress] = useState<(SongFrame & { totalBars: number; finished?: boolean }) | null>(null);
  const [songPart, setSongPart] = useState('Passage 1');
  const [message, setMessage] = useState('Ready — fill a beat, then press ⌘ / Ctrl + Enter.');
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const [currentHits, setCurrentHits] = useState('—');
  const [bar, setBar] = useState(1);
  const [passageBar, setPassageBar] = useState(1);
  const [selectedPassageName, setSelectedPassageName] = useState('Passage 1');
  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [editorScroll, setEditorScroll] = useState(0);
  const [editorScrollLeft, setEditorScrollLeft] = useState(0);
  const [editorCursor, setEditorCursor] = useState(-1);
  const [diagnosticState, setDiagnosticState] = useState<{ source: string; passage: string; issue: Diagnostic | null } | null>(null);
  const [selectedPart, setSelectedPart] = useState<Part>('bd');
  const [completion, setCompletion] = useState<EditorCompletion | null>(null);
  const [parameterHint, setParameterHint] = useState<ParameterHint | null>(null);
  const [effectRowKey, setEffectRowKey] = useState<string | null>(null);
  const [bankHighlight, setBankHighlight] = useState(0);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const stepsRef = useRef<HTMLElement | null>(null);
  const completionListRef = useRef<HTMLDivElement | null>(null);
  const songOrderRef = useRef<HTMLOListElement | null>(null);
  const dismissedCompletionRef = useRef('');
  const completionKeyRef = useRef('');
  const composingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const hydratedRef = useRef(false);
  const bootedRef = useRef(false);
  const autosaveAllowedRef = useRef(true);
  const storedRawRef = useRef<string | null>(null);
  const exportedRef = useRef('');
  const previousMemoryRef = useRef<OhcodesProject | null>(null);
  const fileReadRef = useRef(0);
  const snapshotRef = useRef({ name: projectName, code, editingPassage: selectedPassageName });
  snapshotRef.current = { name: projectName, code, editingPassage: selectedPassageName };

  const document = useMemo(() => readPassages(code), [code]);
  const arrangement = useMemo(() => readArrangement(code), [code]);
  const selectedPassage = document.passages.find((passage) => passage.name === selectedPassageName) ?? document.passages[0];
  const syntax = useMemo(() => scanCode(code), [code]);
  const bracketPositions = useMemo(() => activeBrackets(syntax, editorCursor), [syntax, editorCursor]);
  const diagnostic = diagnosticState?.source === code && diagnosticState.passage === selectedPassage.name ? diagnosticState.issue : null;
  const diagnosticLine = diagnostic ? code.slice(0, diagnostic.from).split('\n').length : null;
  useEffect(() => {
    const timer = window.setTimeout(() => setDiagnosticState({ source: code, passage: selectedPassage.name, issue: diagnoseCode(code, selectedPassage.name) }), 400);
    return () => window.clearTimeout(timer);
  }, [code, selectedPassage.name]);
  const activeBar = score.bars[(passageBar - 1) % score.bars.length];

  const rows = useMemo(() => drumRows(code), [code]);
  const bankResults = useMemo(() => completion?.kind === 'selection' ? completion.options : completion?.kind === 'scale' ? searchScales(completion.query) : completion?.kind === 'instrument' ? instrumentOptions(completion) : completion?.kind === 'effect'
    ? searchEffects(completion.query).map((effect) => ({ id: effect.id, name: effect.name, description: effect.description }))
    : completion?.kind === 'groove' ? GROOVE_MODIFIERS.filter((modifier) => completion.options.includes(modifier.id))
    : searchSoundbanks(completion?.query ?? '', completion?.row.part).map((bank) => ({ id: bank.id, name: bank.name, description: `${bank.id} · ${bank.family}` })), [completion]);
  const effectRow = rows.find((row) => row.key === effectRowKey && row.start >= selectedPassage.bodyStart && row.start <= selectedPassage.bodyEnd);
  const editableEffects = useMemo(() => { try { return effectRow ? rowEffects(effectRow) : []; } catch { return []; } }, [effectRow]);
  const selectedRow = rows.find((row) => row.key === selectedRowKey);
  const selectedSteps = useMemo(() => {
    if (!selectedRow) return null;
    try { return { model: stepModel(code, selectedRow), error: '' }; }
    catch (caught) { return { model: null, error: caught instanceof Error ? caught.message : 'Finish this row in text.' }; }
  }, [code, selectedRow]);

  useEffect(() => {
    if (selectedRowKey) stepsRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedRowKey]);

  useEffect(() => {
    const list = songOrderRef.current;
    const active = list?.querySelector<HTMLElement>('[data-applied="true"]');
    if (!list || !active) return;
    if (active.offsetTop < list.scrollTop) list.scrollTop = active.offsetTop;
    else if (active.offsetTop + active.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = active.offsetTop + active.offsetHeight - list.clientHeight;
  }, [songProgress?.index]);

  useEffect(() => {
    const list = completionListRef.current;
    const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !selected) return;
    if (selected.offsetTop < list.scrollTop) list.scrollTop = selected.offsetTop;
    else if (selected.offsetTop + selected.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = selected.offsetTop + selected.offsetHeight - list.clientHeight;
  }, [bankHighlight, completion]);

  const audioRef = useRef<AudioContext | null>(null);
  const scoreRef = useRef(score);
  const queuedRef = useRef<LiveUpdate | null>(null);
  const modeRef = useRef<TransportMode>('live');
  const songRef = useRef<PreparedSong | null>(null);
  const pendingSongRef = useRef<SongUpdate | null>(null);
  const songCursorRef = useRef(0);
  const endingSongRef = useRef(false);
  const playingRef = useRef(false);
  const startingRef = useRef(false);
  const startEpochRef = useRef(0);
  const barRef = useRef(0);
  const passageBarRef = useRef(0);
  const nextBarTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uiTimersRef = useRef<number[]>([]);
  const sourcesRef = useRef(new Set<AudioScheduledSourceNode>());
  const mixerRef = useRef<ReturnType<typeof createTrackMixer> | null>(null);

  const ensureAudio = useCallback(async () => {
    if (!audioRef.current || audioRef.current.state === 'closed') {
      const context = new AudioContext();
      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      master.gain.value = 0.74;
      compressor.threshold.value = -14;
      compressor.knee.value = 18;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.16;
      master.connect(compressor).connect(context.destination);
      mixerRef.current?.clear();
      mixerRef.current = createTrackMixer(context, master, sourcesRef.current);
      audioRef.current = context;
    }
    await audioRef.current.resume();
    return audioRef.current;
  }, []);

  const clearUiTimers = useCallback(() => {
    uiTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    uiTimersRef.current = [];
  }, []);

  const queueUiUpdate = useCallback((delay: number, update: () => void) => {
    const timer = window.setTimeout(() => {
      uiTimersRef.current = uiTimersRef.current.filter((activeTimer) => activeTimer !== timer);
      update();
    }, delay);
    uiTimersRef.current.push(timer);
  }, []);

  const stop = useCallback(() => {
    startEpochRef.current += 1;
    playingRef.current = false;
    setPlaying(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    clearUiTimers();
    sourcesRef.current.forEach((source) => { try { source.stop(); } catch { /* Already ended. */ } });
    sourcesRef.current.clear();
    mixerRef.current?.clear();
    queuedRef.current = null;
    setQueuedScore(null);
    pendingSongRef.current = null; setQueuedSong(null);
    songCursorRef.current = 0; endingSongRef.current = false; setSongProgress(null);
    setScore(scoreRef.current);
    barRef.current = 0;
    passageBarRef.current = 0;
    setPassageBar(1);
    setCurrentBeat(-1);
    setCurrentHits('—');
    setBar(1);
    setMessage('Stopped.');
  }, [clearUiTimers]);

  const snapshot = useCallback(() => {
    const current = snapshotRef.current;
    const passages = readPassages(current.code).passages;
    const selected = passages.find((passage) => passage.name === current.editingPassage) ?? passages[0];
    // A too-long/incomplete passage name must never prevent its source from being saved.
    return createProject(current.name, current.code, selected.name.length <= 48 && !/[\r\n\u0000]/.test(selected.name) ? selected.name : '');
  }, []);

  const loadProject = useCallback((project: OhcodesProject, label: string) => {
    stop();
    const prepared = prepareProject(project);
    snapshotRef.current = { name: project.name, code: project.code, editingPassage: prepared.selected };
    setProjectName(project.name); setCode(project.code); setSelectedPassageName(prepared.selected);
    modeRef.current = 'live'; setMode('live'); songRef.current = null;
    scoreRef.current = prepared.score; setScore(prepared.score);
    setSelectedRowKey(null); setEffectRowKey(null); setRenameDraft(null); setCompletion(null); setParameterHint(null);
    setPendingProject(null); setEditorScroll(0); setError(false);
    dismissedCompletionRef.current = ''; completionKeyRef.current = '';
    setMessage(prepared.unfinished ? `${label} — unfinished code preserved. Finish the passage before Play.` : `${label} — stopped, ready for Play.`);
    requestAnimationFrame(() => { if (editorRef.current) { editorRef.current.scrollTop = 0; editorRef.current.scrollLeft = 0; editorRef.current.setSelectionRange(0, 0); } });
  }, [stop]);

  const flushDraft = useCallback(() => {
    if (!hydratedRef.current || !autosaveAllowedRef.current) return;
    try {
      storedRawRef.current = saveDraft(window.localStorage, snapshot(), storedRawRef.current);
      setSaveStatus('Saved in this browser'); setSaveWarning(false);
    } catch (caught) {
      autosaveAllowedRef.current = false;
      setSaveWarning(true);
      setSaveStatus(caught instanceof DraftConflict ? 'Autosave paused · another tab changed the draft' : 'Local save unavailable · use Export');
      setProjectNotice(caught instanceof DraftConflict ? 'Your edits are still here. Export them, then refresh this tab to load the other draft.' : 'Browser storage could not save this draft. Export a .ohcodes file before closing.');
    }
  }, [snapshot]);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      storedRawRef.current = raw;
      setHasPrevious(window.localStorage.getItem(PREVIOUS_KEY) !== null);
      if (raw !== null) {
        try { loadProject(parseProject(raw), 'Browser draft restored'); setSaveStatus('Saved in this browser'); }
        catch {
          autosaveAllowedRef.current = false; setRecoveryRaw(raw); setSaveWarning(true);
          setSaveStatus('Unreadable draft · original kept');
          setProjectNotice('The stored draft could not be read. Export its recovery copy before New/Open; it will not be overwritten automatically.');
        }
      } else setSaveStatus('Ready · local autosave on');
    } catch {
      autosaveAllowedRef.current = false; setSaveWarning(true);
      setSaveStatus('Local save unavailable · use Export');
      setProjectNotice('Browser storage is unavailable. File export and opening still work.');
    }
    hydratedRef.current = true; setProjectReady(true);
  }, [loadProject]);

  useEffect(() => {
    if (!projectReady || !autosaveAllowedRef.current) return;
    setSaveStatus('Saving draft…');
    const timer = window.setTimeout(flushDraft, 400);
    return () => window.clearTimeout(timer);
  }, [code, projectName, selectedPassageName, projectReady, flushDraft]);

  useEffect(() => {
    const hide = () => { if (window.document.visibilityState === 'hidden') flushDraft(); };
    const otherTab = (event: StorageEvent) => {
      if ((event.key === DRAFT_KEY || event.key === null) && event.newValue !== storedRawRef.current) {
        autosaveAllowedRef.current = false; setSaveWarning(true);
        setSaveStatus('Autosave paused · another tab changed the draft');
        setProjectNotice('Your edits are still here. Export them, then refresh this tab to load the other draft.');
      }
    };
    window.addEventListener('pagehide', flushDraft);
    window.document.addEventListener('visibilitychange', hide);
    window.addEventListener('storage', otherTab);
    return () => {
      flushDraft(); fileReadRef.current += 1;
      window.removeEventListener('pagehide', flushDraft);
      window.document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('storage', otherTab);
    };
  }, [flushDraft]);

  const downloadProject = useCallback((raw: string, filename: string) => {
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const link = window.document.createElement('a');
    link.href = url; link.download = filename; window.document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, []);

  const exportProject = useCallback(() => {
    try {
      const current = snapshot();
      downloadProject(serializeProject(current), projectFilename(current.name));
      exportedRef.current = projectFingerprint(current);
      setProjectNotice(`Download started: ${projectFilename(current.name)}. Keep this file as your portable backup.`);
      return true;
    } catch (caught) { setProjectNotice(caught instanceof Error ? caught.message : 'This project could not be exported.'); return false; }
  }, [snapshot, downloadProject]);

  useEffect(() => {
    const saveKey = (event: KeyboardEvent) => {
      if (hydratedRef.current && !event.repeat && (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's') { event.preventDefault(); exportProject(); }
    };
    window.addEventListener('keydown', saveKey);
    return () => window.removeEventListener('keydown', saveKey);
  }, [exportProject]);

  const applyProject = (project: OhcodesProject, label: string) => {
    const previous = snapshot();
    try {
      storedRawRef.current = replaceDraft(window.localStorage, project, previous, storedRawRef.current);
      autosaveAllowedRef.current = true; setSaveWarning(false); setSaveStatus('Saved in this browser');
    } catch (caught) {
      autosaveAllowedRef.current = false; setSaveWarning(true);
      if (caught instanceof DraftConflict) {
        setSaveStatus('Autosave paused · another tab changed the draft');
        setProjectNotice('Another tab changed the draft. Export your edits and refresh before replacing it.');
        return;
      }
      setSaveStatus('Local save unavailable · use Export');
    }
    previousMemoryRef.current = previous; setHasPrevious(true); setRecoveryRaw(null);
    exportedRef.current = label === 'Project opened' ? projectFingerprint(project) : '';
    loadProject(project, label);
    setProjectNotice(autosaveAllowedRef.current ? `${label}. Previous draft retained. Browser saving is local to this site and browser.` : `${label}, but browser saving failed. Previous draft is recoverable here until this tab closes. Export before closing.`);
  };

  const requestProject = (project: OhcodesProject, label: string) => {
    fileReadRef.current += 1;
    const current = snapshot();
    const blank = current.code === STARTER && current.name === DEFAULT_PROJECT_NAME;
    if ((!blank && exportedRef.current !== projectFingerprint(current)) || recoveryRaw !== null) setPendingProject({ project, label });
    else applyProject(project, label);
  };

  const openProjectFile = async (file: File) => {
    const generation = ++fileReadRef.current;
    setOpeningProject(true);
    try {
      if (file.size > MAX_PROJECT_BYTES) throw new Error('Choose an ohcodes project smaller than 2 MB.');
      const project = parseProject(await file.text());
      if (generation !== fileReadRef.current) return;
      requestProject(project, 'Project opened');
    } catch (caught) {
      if (generation === fileReadRef.current) setProjectNotice(caught instanceof Error ? caught.message : 'Could not open this file. Current code unchanged.');
    } finally { setOpeningProject(false); }
  };

  const recoverPrevious = () => {
    try {
      if (previousMemoryRef.current && !autosaveAllowedRef.current) { requestProject(previousMemoryRef.current, 'Previous draft restored'); return; }
      const raw = window.localStorage.getItem(PREVIOUS_KEY);
      if (raw !== null) {
        try { requestProject(parseProject(raw), 'Previous draft restored'); }
        catch { setRecoveryRaw(raw); setProjectNotice('Previous draft is unreadable. Export its recovery copy; your current code is unchanged.'); }
      } else if (previousMemoryRef.current) requestProject(previousMemoryRef.current, 'Previous draft restored');
      else setProjectNotice('No previous draft is available in this browser.');
    } catch {
      if (previousMemoryRef.current) requestProject(previousMemoryRef.current, 'Previous draft restored');
      else setProjectNotice('Previous draft could not be read. Current code unchanged.');
    }
  };

  const scheduler = useCallback(() => {
    const context = audioRef.current;
    if (!context || !playingRef.current) return;
    if (endingSongRef.current) return;
    mixerRef.current?.collect(context.currentTime);
    while (nextBarTimeRef.current < context.currentTime + 0.06) {
      let applied: LiveUpdate | null = null;
      let appliedSong: SongUpdate | null = null;
      if (barRef.current > 0 && pendingSongRef.current) {
        appliedSong = pendingSongRef.current;
        songRef.current = appliedSong.song; modeRef.current = 'song';
        if (appliedSong.reset) songCursorRef.current = 0;
        pendingSongRef.current = null;
      } else if (barRef.current > 0 && queuedRef.current) {
        const next = queuedRef.current;
        scoreRef.current = next.score;
        if (next.restart) passageBarRef.current = 0;
        if (next.live) { modeRef.current = 'live'; songRef.current = null; }
        queuedRef.current = null;
        applied = next;
      }

      const frame = modeRef.current === 'song' && songRef.current ? songFrame(songRef.current, songCursorRef.current) : null;
      if (modeRef.current === 'song' && songRef.current && !frame) {
        const finished = songRef.current;
        const last = songFrame(finished, finished.totalBars - 1)!;
        endingSongRef.current = true;
        queueUiUpdate(Math.max(0, (nextBarTimeRef.current - context.currentTime) * 1000), () => {
          // A last-moment explicit queue still wins over automatic completion.
          if (queuedRef.current || pendingSongRef.current) { endingSongRef.current = false; return; }
          stop(); setSongProgress({ ...last, totalBars: finished.totalBars, finished: true });
          scoreRef.current = last.entry.score; setScore(last.entry.score);
          barRef.current = finished.totalBars; setBar(finished.totalBars); setPassageBar(last.bar);
          setMessage(`Song finished — ${finished.totalBars} bars. Play starts the song again.`);
        });
        break;
      }
      if (frame) { scoreRef.current = frame.entry.score; passageBarRef.current = frame.bar - 1; }
      const activePassage = scoreRef.current;
      const activePassageBar = passageBarRef.current;
      const activeScore = activePassage.bars[activePassageBar % activePassage.bars.length];
      const activeMode = modeRef.current;
      const songTotal = songRef.current?.totalBars ?? 0;
      const barStart = nextBarTimeRef.current;
      const barNumber = barRef.current + 1;
      const beatDuration = 60 / activeScore.tempo;
      mixerRef.current?.prepare(activeScore, barStart);
      const events = new Map<string, { offset: number; beat: number; hits: Set<string> }>();

      for (let beatIndex = 0; beatIndex < activeScore.beats; beatIndex += 1) {
        const offset = beatIndex * beatDuration;
        events.set(offset.toFixed(9), { offset, beat: beatIndex + 1, hits: new Set<string>() });
      }

      for (const hit of passageHits(activePassage, activePassageBar)) {
        const offset = hit.offset * activeScore.beats * beatDuration;
        const beat = Math.min(activeScore.beats, Math.floor(hit.offset * activeScore.beats + 1e-9) + 1);
        const key = offset.toFixed(9);
        const event = events.get(key) || { offset, beat, hits: new Set<string>() };
        event.hits.add(trackLabel(hit));
        events.set(key, event);
        mixerRef.current?.schedule(hit, activeScore, barStart + offset, beatDuration);
      }

      [...events.values()].sort((a, b) => a.offset - b.offset).forEach((event) => {
        const delay = Math.max(0, (barStart + event.offset - context.currentTime) * 1000);
        queueUiUpdate(delay, () => {
          if (event.offset === 0) {
            setScore(activePassage);
            setPassageBar(activePassageBar + 1);
            setMode(activeMode);
            setSongProgress(frame ? { ...frame, totalBars: songTotal } : null);
          }
          if (event.offset === 0 && appliedSong) {
            setQueuedSong((queued) => queued === appliedSong ? null : queued);
            setMessage(appliedSong.reset ? 'Song started — sections switch automatically.' : 'Song updated — elapsed song bars preserved.');
          }
          if (event.offset === 0 && applied) {
            setQueuedScore((queued) => queued === applied ? null : queued);
            setMessage(`${activePassage.name} entered — playback continued without restarting.`);
          }
          setBar(barNumber);
          setCurrentBeat(event.beat);
          setCurrentHits([...event.hits].join('  ') || '—');
        });
      });

      nextBarTimeRef.current += activeScore.beats * beatDuration;
      // Keep elapsed bars, not a wrapped cursor: changing a loop's length must not reset its phase.
      passageBarRef.current = activePassageBar + 1;
      barRef.current += 1;
      if (frame) songCursorRef.current += 1;
    }
  }, [queueUiUpdate, stop]);

  const play = useCallback(async () => {
    if (playingRef.current || startingRef.current) return;
    const epoch = startEpochRef.current;
    startingRef.current = true;
    try {
      const context = await ensureAudio();
      if (epoch !== startEpochRef.current) return;
      playingRef.current = true;
      setPlaying(true);
      barRef.current = 0;
      passageBarRef.current = 0;
      songCursorRef.current = 0; endingSongRef.current = false;
      nextBarTimeRef.current = context.currentTime + 0.06;
      setMessage(`Playing ${scoreRef.current.name}.`);
      timerRef.current = setInterval(scheduler, 25);
      scheduler();
    } catch {
      if (epoch !== startEpochRef.current) return;
      setError(true);
      setMessage('Audio could not start. Try Play again.');
    } finally { startingRef.current = false; }
  }, [ensureAudio, scheduler]);

  useEffect(() => () => {
    startEpochRef.current += 1;
    if (timerRef.current) clearInterval(timerRef.current);
    uiTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    playingRef.current = false;
    sourcesRef.current.clear();
    mixerRef.current?.clear(); mixerRef.current = null;
    const context = audioRef.current;
    audioRef.current = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }, []);

  const reevaluate = useCallback(() => {
    try {
      if (modeRef.current === 'song') {
        const song = prepareSong(code);
        if (song.source !== code) setCode(song.source);
        setError(false);
        queuedRef.current = null; setQueuedScore(null);
        if (playingRef.current) {
          const update = { song, reset: false };
          pendingSongRef.current = update; setQueuedSong(update);
          setMessage('Song update queued — next bar, keeping elapsed song bars.');
        } else {
          songRef.current = song; scoreRef.current = song.entries[0].score;
          setScore(scoreRef.current); setPassageBar(1); setSongProgress(null);
          setMessage(`Song ready — ${song.entries.length} sections, ${song.totalBars} bars.`);
        }
        return;
      }
      const cursor = editorRef.current?.selectionStart ?? 0;
      const target = editorRef.current?.matches(':focus') ? document.passages.find((passage) => cursor >= passage.start && cursor <= passage.end) ?? selectedPassage : selectedPassage;
      const prepared = preparedPassage(code, target.name);
      setSelectedPassageName(target.name);
      const parsed = prepared.score;
      if (prepared.source !== code) setCode(prepared.source);
      setError(false);
      if (playingRef.current) {
        const queued = { score: parsed, restart: parsed.name !== scoreRef.current.name };
        pendingSongRef.current = null; setQueuedSong(null);
        queuedRef.current = queued;
        setQueuedScore(queued);
        setMessage(`${parsed.name} queued — changes enter on the next bar.`);
      } else {
        scoreRef.current = parsed;
        setScore(parsed);
        setPassageBar(1);
        setMessage(`${parsed.name} ready — instruments loop independently; each has up to 4 written bars.`);
      }
    } catch (caught) {
      setError(true);
      setMessage(caught instanceof Error ? caught.message : 'The drum code could not run.');
    }
  }, [code, selectedPassage, document.passages]);

  const launchPassage = useCallback((name: string) => {
    try {
      const prepared = preparedPassage(code, name);
      if (prepared.source !== code) setCode(prepared.source);
      setError(false);
      if (playingRef.current) {
        const queued = { score: prepared.score, restart: true, live: true };
        pendingSongRef.current = null; setQueuedSong(null);
        queuedRef.current = queued;
        setQueuedScore(queued);
        setMessage(`${name} queued — enters on the next bar in Live mode.`);
      } else {
        modeRef.current = 'live'; setMode('live'); songRef.current = null;
        scoreRef.current = prepared.score;
        setScore(prepared.score);
        setPassageBar(1);
        void play();
      }
    } catch (caught) {
      setError(true);
      setMessage(caught instanceof Error ? caught.message : 'This passage could not play.');
    }
  }, [code, play]);

  const changeMode = (next: TransportMode) => {
    try {
      if (startingRef.current && !playingRef.current) stop();
      setError(false);
      if (!playingRef.current) {
        modeRef.current = next; setMode(next); setSongProgress(null);
        setMessage(next === 'song' ? 'Song mode — Play follows the song order, then stops.' : 'Live mode — launch passages with the mouse or shortcuts.');
        return;
      }
      if (next === 'song') {
        const song = prepareSong(code);
        if (song.source !== code) setCode(song.source);
        const update = { song, reset: true };
        pendingSongRef.current = update; setQueuedSong(update);
        queuedRef.current = null; setQueuedScore(null);
        setMessage('Song queued — first section starts on the next bar.');
      } else {
        const queued = { score: scoreRef.current, restart: false, live: true };
        queuedRef.current = queued; setQueuedScore(queued);
        pendingSongRef.current = null; setQueuedSong(null);
        setMessage('Live mode queued — the current passage keeps its loop position.');
      }
    } catch (caught) { setError(true); setMessage(caught instanceof Error ? caught.message : 'Finish the song order first.'); }
  };

  const startTransport = () => {
    if (playingRef.current || startingRef.current) return;
    if (modeRef.current === 'live') { launchPassage(selectedPassage.name); return; }
    try {
      const song = prepareSong(code);
      if (song.source !== code) setCode(song.source);
      songRef.current = song; scoreRef.current = song.entries[0].score;
      songCursorRef.current = 0; setSongProgress(null);
      setScore(scoreRef.current); setPassageBar(1); setError(false);
      void play();
    } catch (caught) { setError(true); setMessage(caught instanceof Error ? caught.message : 'Could not start the song.'); }
  };

  const editArrangement = (entries: SongEntry[]) => {
    try {
      setCode(setArrangement(code, entries)); setError(false);
      setMessage(`Song order written in code.${playingRef.current ? ' Re-evaluate in Song mode to apply on the next bar.' : ' Choose Song mode and Play.'}`);
      return true;
    } catch (caught) { setError(true); setMessage(caught instanceof Error ? caught.message : 'Finish the song order in text.'); return false; }
  };

  const cancelQueued = () => {
    if (pendingSongRef.current) { pendingSongRef.current = null; setQueuedSong(null); setMessage('Song change cancelled. Playback continues.'); return; }
    if (!queuedRef.current) { setMessage('This change is already entering at the bar boundary.'); return; }
    queuedRef.current = null; setQueuedScore(null); setMessage('Queued change cancelled. Playback continues.');
  };

  useEffect(() => {
    const handleReevaluate = (event: KeyboardEvent) => {
      if (workspaceView !== 'studio') return;
      const digit = event.code.match(/^Digit([1-9])$/)?.[1] ?? event.key;
      if (!event.repeat && (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && /^[1-9]$/.test(digit)) {
        const passage = document.passages[Number(digit) - 1];
        if (passage) { event.preventDefault(); launchPassage(passage.name); }
        return;
      }
      if (event.repeat || (!event.metaKey && !event.ctrlKey) || event.key !== 'Enter') return;
      event.preventDefault();
      reevaluate();
    };
    window.addEventListener('keydown', handleReevaluate);
    return () => window.removeEventListener('keydown', handleReevaluate);
  }, [reevaluate, launchPassage, document.passages, workspaceView]);

  const addInstrument = () => {
    const meter = draftMeter(`${document.globals}\n${selectedPassage.body}`);
    const existing = rows.find((row) => row.part === selectedPart && row.track === undefined && row.start >= selectedPassage.bodyStart && row.start <= selectedPassage.bodyEnd);
    let rowStart: number;
    let rowLength: number;

    if (existing) {
      rowStart = existing.start;
      rowLength = existing.text.length;
      setMessage(`${selectedPart} is already here — edit the selected row${isDrumPart(selectedPart) ? ' or open its steps' : ''}.`);
    } else {
      const row = `${selectedPassage.legacy ? '' : '  '}${emptyRow(selectedPart, meter.beats, meter.unit)}`;
      const prefix = `${code.slice(0, selectedPassage.bodyEnd).trimEnd()}\n`;
      rowStart = prefix.length;
      rowLength = row.length;
      setCode(`${prefix}${row}\n${code.slice(selectedPassage.bodyEnd)}`);
      setMessage(`${selectedPart} added, silent — write your ${isDrumPart(selectedPart) ? 'rhythm' : 'notes'}, then re-evaluate.`);
    }

    requestAnimationFrame(() => {
      editorRef.current?.setSelectionRange(rowStart, rowStart + rowLength);
      editorRef.current?.focus();
    });
  };

  const focusPassage = (passage: PassageDraft, source = code) => {
    setSelectedPassageName(passage.name);
    setSelectedRowKey(null);
    setRenameDraft(null);
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.setSelectionRange(passage.bodyStart, passage.bodyStart);
      editor.focus();
      editor.scrollTop = Math.max(0, source.slice(0, passage.start).split('\n').length - 2) * 28;
    });
  };

  const updateCompletion = useCallback((editor: HTMLTextAreaElement) => {
    const source = editor.value;
    const cursor = editor.selectionStart;
    setEditorCursor(editor.selectionEnd === cursor ? cursor : -1);
    const passage = readPassages(source).passages.find((item) => cursor >= item.start && cursor <= item.end);
    if (passage) setSelectedPassageName(passage.name);
    const row = drumRows(source).find((item) => cursor >= item.start && cursor <= item.start + item.text.length);
    if (row) setEffectRowKey(row.key);
    if (composingRef.current || editor.selectionEnd !== cursor || dismissedCompletionRef.current === `${cursor}:${source}`) {
      setCompletion(null);
      setParameterHint(null);
      return;
    }
    const scale = scaleCompletion(source, cursor);
    const effect = scale ? null : effectCompletion(source, cursor);
    const timbre = scale || effect ? null : soundbankCompletion(source, cursor);
    const groove = scale || effect || timbre ? null : grooveCompletion(source, cursor);
    const instrument = scale || effect || timbre || groove ? null : instrumentCompletion(source, cursor);
    const context = selectionCompletion(source, cursor) ?? (scale ? { ...scale, kind: 'scale' as const } : effect ? { ...effect, kind: 'effect' as const } : timbre ? { ...timbre, kind: 'timbre' as const } : groove ? { ...groove, kind: 'groove' as const } : instrument);
    const position = context && completionPosition(editor, cursor, context.kind === 'scale' ? searchScales(context.query).length : context.kind === 'effect' ? searchEffects(context.query).length : context.kind === 'selection' || context.kind === 'groove' || context.kind === 'instrument' ? context.options.length : searchSoundbanks(context.query, context.row.part).length);
    const key = context ? `${context.kind}:${context.from}:${context.query}` : '';
    if (completionKeyRef.current !== key) setBankHighlight(0);
    completionKeyRef.current = key;
    setCompletion(context && position ? { ...context, position } : null);
    const hint = context ? null : parameterHelp(source, cursor);
    const hintPosition = hint && completionPosition(editor, cursor, 4);
    setParameterHint(hint && hintPosition ? { ...hint, position: hintPosition } : null);
  }, []);

  useEffect(() => {
    const reposition = () => { if (editorRef.current && window.document.activeElement === editorRef.current) updateCompletion(editorRef.current); };
    window.addEventListener('resize', reposition);
    return () => window.removeEventListener('resize', reposition);
  }, [updateCompletion]);

  const trackCursor = () => { if (editorRef.current) updateCompletion(editorRef.current); };

  const chooseBank = (id: string) => {
    if (!completion) return;
    try {
      const next = completion.kind === 'selection' ? completeSelection(code, completion, id) : completion.kind === 'scale' ? completeScale(code, completion, id) : completion.kind === 'instrument' ? completeInstrument(code, completion, id as Part) : completion.kind === 'effect' ? completeEffect(code, completion, id as EffectId) : completion.kind === 'groove' ? completeGroove(code, completion, id as GrooveId) : completeSoundbank(code, completion, id as SoundbankId);
      setCode(next.source);
      setCompletion(null);
      setParameterHint(null);
      setError(false);
      setMessage(`${completion.kind === 'selection' ? `${completion.command} → ${id}` : completion.kind === 'instrument' ? `${id} · empty beats` : `${trackLabel(completion.row)} → ${id}`} written in code. Press ⌘ / Ctrl + Enter to apply${playing ? ' on the next bar' : ''}.`);
      requestAnimationFrame(() => {
        editorRef.current?.setSelectionRange(next.cursor, next.cursor);
        editorRef.current?.focus();
        setEditorCursor(next.cursor);
      });
    } catch (caught) {
      setCompletion(null);
      setError(true);
      setMessage(caught instanceof Error ? caught.message : 'Finish this instrument in text before selecting a soundbank.');
    }
  };

  const changeEffect = (index: number, effect: Effect) => {
    if (!effectRow) return;
    try {
      const next = setRowEffect(code, effectRow.key, index, effect);
      // Compile first: an unfinished row elsewhere must not be silently repaired by a slider.
      const parsed = parsePassage(next, selectedPassage.name);
      setCode(next);
      setCompletion(null);
      setError(false);
      if (playingRef.current && parsed.name === scoreRef.current.name) {
        // Do not overwrite a passage launch that is already queued.
        if (queuedRef.current?.restart || queuedRef.current?.live || (pendingSongRef.current && pendingSongRef.current.kind !== 'effect')) {
          setMessage('Effect written in code. A transport change is queued; re-evaluate after it enters to apply this edit.');
          return;
        }
        if (modeRef.current === 'song' && songRef.current) {
          const update: SongUpdate = { song: updateSongPassage(pendingSongRef.current?.song ?? songRef.current, parsed), reset: false, kind: 'effect' };
          pendingSongRef.current = update; setQueuedSong(update);
          setMessage(`${trackLabel(effectRow)} ${effectLabel(effect)} — next bar, song order preserved.`);
          return;
        }
        const queued = { score: parsed, restart: false };
        queuedRef.current = queued; setQueuedScore(queued);
        setMessage(`${trackLabel(effectRow)} ${effectLabel(effect)} — enters on the next bar.`);
      } else if (playingRef.current) {
        setMessage(`${selectedPassage.name} effect saved in the draft. ${scoreRef.current.name} keeps playing.`);
      } else {
        scoreRef.current = parsed; setScore(parsed); setPassageBar(1);
        setMessage(`${trackLabel(effectRow)} ${effectLabel(effect)} — ready to play.`);
      }
    } catch (caught) {
      setError(true);
      setMessage(caught instanceof Error ? caught.message : 'Finish this passage before moving its effect controls.');
    }
  };

  const editorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (composingRef.current || event.nativeEvent.isComposing) return;
    if (event.metaKey || event.ctrlKey || event.altKey) { setCompletion(null); setParameterHint(null); return; }
    if (!completion && !parameterHint) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      dismissedCompletionRef.current = `${event.currentTarget.selectionStart}:${event.currentTarget.value}`;
      setCompletion(null);
      setParameterHint(null);
    } else if (completion && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && bankResults.length) {
      event.preventDefault();
      setBankHighlight((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + bankResults.length) % bankResults.length);
    } else if (!event.shiftKey && completion && (event.key === 'Enter' || event.key === 'Tab') && bankResults[bankHighlight]) {
      event.preventDefault();
      chooseBank(bankResults[bankHighlight].id);
    }
  };

  const locateDiagnostic = () => {
    const editor = editorRef.current;
    if (!editor || !diagnostic) return;
    editor.focus();
    editor.setSelectionRange(diagnostic.from, diagnostic.to);
    const lineHeight = parseFloat(window.getComputedStyle(editor).lineHeight) || 28;
    const token = syntax.tokens.find((item) => item.to > diagnostic.from);
    const marker = token && editor.parentElement?.querySelector<HTMLElement>(`[data-source-start="${token.from}"]`);
    const contentX = marker ? marker.getBoundingClientRect().left - editor.getBoundingClientRect().left + editor.scrollLeft : 0;
    editor.scrollTop = Math.max(0, (diagnosticLine! - 3) * lineHeight);
    editor.scrollLeft = Math.max(0, contentX - editor.clientWidth / 3);
    setEditorScroll(editor.scrollTop);
    setEditorScrollLeft(editor.scrollLeft);
    setEditorCursor(-1);
    setCompletion(null); setParameterHint(null);
  };

  const addPassage = (duplicate = false) => {
    const source = namedSource(code);
    const current = readPassages(source);
    if (current.passages.length >= 32) { setError(true); setMessage('This session already has 32 passages.'); return; }
    if (current.passages.some((passage) => !passage.closed)) { setError(true); setMessage('Close each passage with } before adding another. Your code is unchanged.'); return; }
    const original = current.passages.find((passage) => passage.name === selectedPassage.name) ?? current.passages[0];
    const base = duplicate ? `${original.name.slice(0, 36)} copy` : 'Passage';
    let suffix = duplicate ? 1 : current.passages.length + 1;
    let name = duplicate ? base : `${base} ${suffix}`;
    while (current.passages.some((passage) => passage.name === name)) name = `${base} ${++suffix}`;
    const meter = draftMeter(`${current.globals}\n${original.body}`);
    const body = duplicate ? original.body.trimEnd() : `  ${emptyRow('bd', meter.beats, meter.unit)}`;
    const next = `${source.trimEnd()}\n\npassage"${name}"{\n${body.replace(/^\n/, '')}\n}`;
    setCode(next);
    setError(false);
    setMessage(`${name} ${duplicate ? 'copied' : 'added, silent'}. Opening it does not change playback.`);
    focusPassage(readPassages(next).passages.at(-1)!, next);
  };

  const renamePassage = () => {
    if (playingRef.current) return;
    const name = renameDraft?.trim() ?? '';
    if (!name || name.length > 48 || /["'{}\r\n]/.test(name)) { setError(true); setMessage('Use 1–48 characters without quotes or braces.'); return; }
    if (document.passages.some((passage) => passage !== selectedPassage && passage.name === name)) { setError(true); setMessage('Another passage already uses that name.'); return; }
    const source = namedSource(code);
    const passage = readPassages(source).passages.find((item) => item.name === selectedPassage.name)!;
    const headerEnd = source.indexOf('\n', passage.start) < 0 ? source.length : source.indexOf('\n', passage.start);
    let next: string;
    try { next = renameSongPassage(`${source.slice(0, passage.start)}passage"${name}"{${source.slice(headerEnd)}`, passage.name, name); }
    catch (caught) { setError(true); setMessage(caught instanceof Error ? caught.message : 'Finish the song order before renaming.'); return; }
    setCode(next);
    if (scoreRef.current.name === passage.name) { scoreRef.current = { ...scoreRef.current, name }; setScore((active) => ({ ...active, name })); }
    if (queuedRef.current?.score.name === passage.name) {
      const renamed = { ...queuedRef.current, score: { ...queuedRef.current.score, name } };
      queuedRef.current = renamed;
      setQueuedScore(renamed);
    }
    setError(false);
    setMessage(`Renamed to ${name}.`);
    focusPassage(readPassages(next).passages.find((item) => item.name === name)!, next);
  };

  const toggleStep = (beat: number, step: number) => {
    if (!selectedRow || !selectedSteps?.model) return;
    const wasBinary = selectedSteps.model.directBrackets;
    try {
      const next = toggleRowStep(code, selectedRow.key, beat, step);
      setCode(next); setError(false);
      setMessage(wasBinary
        ? `${trackLabel(selectedRow)} updated in text — press ⌘ / Ctrl + Enter to apply.`
        : `${trackLabel(selectedRow)} expanded to editable beat brackets; other parameters kept — press ⌘ / Ctrl + Enter to apply.`);
    } catch (caught) {
      setError(true);
      setMessage(caught instanceof Error ? caught.message : 'This step would change the existing rhythm. Your code is unchanged.');
    }
  };

  const resizeSteps = (subdivision: number) => {
    if (!selectedRow || !selectedSteps?.model) return;
    try {
      setCode(resizeRowSteps(code, selectedRow.key, subdivision));
      setMessage(`${trackLabel(selectedRow)}: ${gridLabel(subdivision, selectedSteps.model.unit)} — existing hits kept in place. Re-evaluate to apply.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'This note length could not be applied.');
    }
  };

  const lineCount = code.split('\n').length;
  const changeView = (next: 'studio' | 'manual', focusEditor = false) => {
    if (next === workspaceView) return;
    viewScrollRef.current[workspaceView] = window.scrollY;
    setCompletion(null); setParameterHint(null);
    setWorkspaceView(next);
    requestAnimationFrame(() => {
      window.scrollTo({ top: viewScrollRef.current[next], behavior: 'instant' });
      if (focusEditor) editorRef.current?.focus({ preventScroll: true });
    });
  };

  return (
    <main className={styles.app}>
      <header className={styles.topbar}>
        <div className={styles.identity}>
          <a href="#" aria-label="ohcodes — back to top">ohcodes</a>
          <div><strong>ohcodes</strong><span>LIVE CODING · V0.20</span></div>
        </div>
        <div className={styles.transport}>
          <button className={styles.stop} onClick={stop} aria-label="Stop playback">■</button>
          <button className={`${styles.play} ${playing ? styles.isPlaying : ''}`} onClick={startTransport} disabled={playing || !projectReady}>{playing ? 'PLAYING' : '▶ PLAY'}</button>
          <div className={styles.position}><span>BAR {bar}</span><b>{currentBeat < 0 ? '—' : String(currentBeat).padStart(2, '0')} / {String(activeBar.beats).padStart(2, '0')}</b></div>
        </div>
        <div className={styles.sessionMeta}>
          <div><span>TEMPO</span><strong>{activeBar.tempo}</strong></div>
          <div><span>TIME</span><strong>{activeBar.beats}/{activeBar.unit}</strong></div>
          <div><span>ENGINE</span><strong className={styles.ready}>{playing ? 'LIVE' : 'READY'}</strong></div>
        </div>
      </header>

      <div className={styles.workspaceTabs} role="tablist" aria-label="Workspace view">
        {(['studio', 'manual'] as const).map((view) => <button key={view} id={`tab-${view}`} role="tab" aria-selected={workspaceView === view} aria-controls={`panel-${view}`} tabIndex={workspaceView === view ? 0 : -1} onClick={() => changeView(view)} onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'studio' : event.key === 'End' ? 'manual' : view === 'studio' ? 'manual' : 'studio';
          changeView(next);
          window.document.getElementById(`tab-${next}`)?.focus();
        }}>{view === 'studio' ? 'Studio' : 'Manual'}{view === 'manual' && <span>START HERE</span>}</button>)}
      </div>

      <div id="panel-manual" role="tabpanel" aria-labelledby="tab-manual" hidden={workspaceView !== 'manual'}>
        <div className={styles.manualTransportStatus}>{playing ? `Studio playing · ${score.name} · bar ${bar}` : 'Studio stopped'}{error && <span role="status"> · {message}</span>}</div>
        <OhcodesManual onStudio={() => changeView('studio', true)} />
      </div>

      <div id="panel-studio" role="tabpanel" aria-labelledby="tab-studio" hidden={workspaceView !== 'studio'}>

      <section className={styles.modeBar} aria-label="Playback mode">
        <div><button aria-pressed={mode === 'live'} disabled={!projectReady} onClick={() => changeMode('live')}>Live</button><button aria-pressed={mode === 'song'} disabled={!projectReady} onClick={() => changeMode('song')}>Song</button></div>
        <span>{mode === 'song' ? 'Song · automatic section changes · stops at the end' : 'Live · launch passages yourself · keeps looping'}</span>
        {songProgress && <strong>{songProgress.finished ? 'Finished' : `Section ${songProgress.index + 1} · ${songProgress.entry.name}`} · song bar {songProgress.songBar}/{songProgress.totalBars}</strong>}
        {(queuedScore || queuedSong) && <div className={styles.queueStatus}><span>{queuedSong ? `Next bar: ${queuedSong.reset ? 'start Song' : 'update Song'}` : `Next bar: ${queuedScore!.score.name}${queuedScore?.live ? ' · Live' : ''}`}</span><button onClick={cancelQueued}>Cancel</button></div>}
      </section>

      <section className={styles.projectBar} aria-label="Song project">
        <label><span>SONG</span><input aria-label="Song name" value={projectName} maxLength={80} disabled={!projectReady} onChange={(event) => setProjectName(event.target.value)} onBlur={(event) => setProjectName(event.target.value.trim() || DEFAULT_PROJECT_NAME)} /></label>
        <div className={styles.projectButtons}>
          <button disabled={!projectReady || openingProject} onClick={() => requestProject(createProject(DEFAULT_PROJECT_NAME, STARTER, 'Passage 1'), 'New project')}>New song</button>
          <button disabled={!projectReady || openingProject} onClick={() => fileRef.current?.click()}>{openingProject ? 'Opening…' : 'Open'}</button>
          <button disabled={!projectReady} onClick={exportProject} title="Download a .ohcodes backup · Cmd/Ctrl + S">Export .ohcodes</button>
          {hasPrevious && <button disabled={!projectReady || openingProject} onClick={recoverPrevious}>Previous draft</button>}
          <input ref={fileRef} type="file" accept=".ohcodes,.ohsounds" hidden aria-label="Open ohcodes project file" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void openProjectFile(file); }} />
        </div>
        <div className={`${styles.saveState} ${saveWarning ? styles.saveWarning : ''}`} role="status"><span>{saveStatus}</span><small>This browser only · Export for a portable backup</small></div>
      </section>
      {pendingProject && <section className={styles.projectConfirm} aria-label="Replace current project">
        <p>{pendingProject.label === 'New project' ? 'Start a new song?' : `Open “${pendingProject.project.name}”?`} Your current draft has not been exported, or has a recovery copy. Replacing it stops playback and keeps one previous draft when storage works.</p>
        <button onClick={() => { if (exportProject()) applyProject(pendingProject.project, pendingProject.label); }}>Export current & replace</button>
        <button onClick={() => applyProject(pendingProject.project, pendingProject.label)}>Replace project</button>
        <button onClick={() => setPendingProject(null)}>Cancel</button>
      </section>}
      {projectNotice && <div className={styles.projectNotice} role="status"><span>{projectNotice}</span>{recoveryRaw !== null && <button onClick={() => downloadProject(recoveryRaw, 'ohcodes-recovery.ohcodes')}>Export recovery copy</button>}<button aria-label="Dismiss project notice" onClick={() => setProjectNotice('')}>×</button></div>}

      <section className={styles.workspace}>
        <section className={styles.editorPanel}>
          <div className={styles.panelHead}>
            <div><i /> LANGUAGE</div>
            <button onClick={reevaluate} title="Update the pattern without restarting playback">RE-EVALUATE <kbd>⌘↵</kbd></button>
          </div>
          <div className={styles.writingTools}>
            <span>EDITING · {selectedPassage.name}</span>
            <details className={styles.instrumentLibrary}><summary>Add instrument</summary><div className={styles.addDrum}>
              <select aria-label="Instrument to add" value={selectedPart} onChange={(event) => setSelectedPart(event.target.value as Part)}>
                {INSTRUMENTS.map((part) => <option value={part} key={part}>{part} · {PART_NAMES[part]}</option>)}
              </select>
              <button onClick={addInstrument}>+ ADD</button>
            </div><p>{SOUNDBANKS.filter((bank) => bank.kind === 'drum').length} drum kits · {SOUNDBANKS.filter((bank) => bank.kind === 'pitched').length} melodic sounds. All built-in synthesis; no sample downloads.</p></details>
            <p id="drum-writing-help">Drums: [] = one beat · Notes: [] groups divide a bar · ~ = rest · , = next bar · []*4 = four groups · Numeric parameters accept + − * / and ( )</p>
          </div>
          <div className={styles.editorBody}>
            <div className={styles.lineNumbers}>
              <div className={styles.lineNumbersInner} style={{ transform: `translateY(-${editorScroll}px)` }}>
                {Array.from({ length: lineCount }, (_, index) => {
                  const row = rows.find((item) => item.lineIndex === index);
                  return <div className={styles.lineGutter} key={index}>
                    {diagnosticLine === index + 1 ? <button className={styles.errorLine} onClick={locateDiagnostic} aria-label={`Go to issue on line ${index + 1}`} title={diagnostic?.message}>{index + 1}</button> : <span aria-hidden="true">{index + 1}</span>}
                    {row && isDrumPart(row.part) && <button
                      aria-label={`Open ${trackLabel(row)} steps on line ${index + 1}`}
                      aria-expanded={selectedRowKey === row.key}
                      aria-controls="drum-steps-editor"
                      onClick={() => {
                        const passage = document.passages.find((item) => row.start >= item.bodyStart && row.start <= item.bodyEnd);
                        if (passage) setSelectedPassageName(passage.name);
                        setSelectedRowKey((current) => current === row.key ? null : row.key);
                      }}
                    >steps</button>}
                  </div>;
                })}
              </div>
            </div>
            <div className={styles.codeSurface}>
            <div className={styles.highlightViewport} aria-hidden="true">
              <pre className={styles.syntaxCode} style={{ transform: `translate(${-editorScrollLeft}px, ${-editorScroll}px)` }}>
                {syntax.tokens.map((token) => <span key={token.from} data-source-start={token.from} className={`${styles[`syntax_${token.kind}`]} ${bracketPositions.includes(token.from) ? styles.matchedBracket : ''} ${diagnostic && token.from < diagnostic.to && token.to > diagnostic.from ? styles.codeIssue : ''}`}>{code.slice(token.from, token.to)}</span>)}{'\n'}
              </pre>
            </div>
            <textarea
              ref={editorRef}
              value={code}
              maxLength={MAX_CODE_LENGTH}
              onChange={(event) => { setCode(event.target.value); updateCompletion(event.currentTarget); }}
              onClick={trackCursor}
              onFocus={trackCursor}
              onSelect={trackCursor}
              onBlur={() => { setCompletion(null); setParameterHint(null); setEditorCursor(-1); }}
              onKeyDown={editorKeyDown}
              onKeyUp={(event) => { if (!['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(event.key)) trackCursor(); }}
              onCompositionStart={() => { composingRef.current = true; setCompletion(null); setParameterHint(null); }}
              onCompositionEnd={(event) => { composingRef.current = false; updateCompletion(event.currentTarget); }}
              onScroll={(event) => { setEditorScroll(event.currentTarget.scrollTop); setEditorScrollLeft(event.currentTarget.scrollLeft); if (completion || parameterHint) updateCompletion(event.currentTarget); }}
              wrap="off"
              spellCheck={false}
              aria-label="ohcodes music code"
              aria-describedby={`drum-writing-help${parameterHint ? ' groove-parameter-help' : ''}${diagnostic ? ' code-diagnostic' : ''}`}
              aria-invalid={!!diagnostic}
              aria-autocomplete="list"
              aria-controls={completion ? 'code-suggestions' : undefined}
              aria-activedescendant={completion && bankResults[bankHighlight] ? `suggestion-${bankResults[bankHighlight].id}` : undefined}
            />
            {completion && <div className={styles.timbreSuggestions} style={completion.position}>
              <div ref={completionListRef} id="code-suggestions" role="listbox" aria-label={completion.kind === 'selection' ? `Tracks to ${completion.command}` : completion.kind === 'instrument' ? 'Instruments' : `${completion.kind === 'scale' ? 'Scales' : completion.kind === 'effect' ? 'Effects' : completion.kind === 'groove' ? 'Musical modifiers' : 'Timbres'} for ${PART_NAMES[completion.row.part]}`}>
                {bankResults.map((bank, index) => <button key={bank.id} id={`suggestion-${bank.id}`} role="option" aria-selected={index === bankHighlight} tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setBankHighlight(index)} onClick={() => chooseBank(bank.id)}>
                  <strong>{bank.name}</strong><span>{bank.description}</span>
                </button>)}
                {!bankResults.length && <p role="status">{completion.kind === 'selection' ? 'No matching unused track in this passage. Use comma-separated names; empty () clears this filter.' : completion.kind === 'scale' ? 'Type a root with octave, then a mode: C3 major, C2 minor, D4 dorian.' : `No matching ${completion.kind === 'effect' ? 'effect' : completion.kind === 'groove' ? 'musical modifier' : 'timbre'}`}</p>}
              </div>
              <small>↑↓ choose · Enter / Tab insert · Esc hide</small>
            </div>}
            {parameterHint && <div id="groove-parameter-help" role="note" className={styles.grooveHint} style={parameterHint.position}>
              <strong>{parameterHint.modifier.name} · {parameterHint.modifier.description}</strong>
              <p>{parameterHint.modifier.help}</p>
              <small>Draft only · ⌘ / Ctrl + Enter applies · Esc hides</small>
            </div>}
            {diagnostic && <div id="code-diagnostic" className={styles.diagnostic} role="status">
              <button onClick={locateDiagnostic}>Line {diagnosticLine} · {diagnostic.message}</button>
              <span>Draft only{playing ? ' · last valid music keeps playing' : ''}</span>
            </div>}
            </div>
          </div>
          {effectRow && editableEffects.length > 0 && <section className={styles.effectsEditor} aria-label={`${trackLabel(effectRow)} effect controls`}>
            <div className={styles.effectsHead}><strong>{trackLabel(effectRow).toUpperCase()} · EFFECTS</strong><span>Sliders write your code · playing passage updates next bar</span><button onClick={() => setEffectRowKey(null)}>Hide</button></div>
            <div className={styles.effectCards}>{editableEffects.map((effect, index) => <div className={styles.effectCard} key={`${effect.id}:${index}`}>
              <strong>{index + 1} · {effect.id.toUpperCase()}</strong>
              {effect.id === 'filter' ? <label><span>Cutoff <output>{effect.frequency} Hz</output></span><input type="range" aria-label={`${trackLabel(effectRow)} filter cutoff`} aria-valuetext={`${effect.frequency} Hz`} min={0} max={1000} step={1} value={Math.round(Math.log(effect.frequency / 20) / Math.log(1000) * 1000)} onChange={(event) => changeEffect(index, { ...effect, frequency: Math.round(20 * Math.pow(1000, Number(event.target.value) / 1000)) })} /></label> : <>
                <label><span>Mix <output>{effect.mix}%</output></span><input type="range" aria-label={`${trackLabel(effectRow)} ${effect.id} mix`} min={0} max={100} step={1} value={effect.mix} onChange={(event) => changeEffect(index, { ...effect, mix: Number(event.target.value) })} /></label>
                {effect.id === 'reverb' ? <label><span>Decay <output>{effect.decay}s</output></span><input type="range" aria-label={`${trackLabel(effectRow)} reverb decay`} min={.1} max={8} step={.1} value={effect.decay} onChange={(event) => changeEffect(index, { ...effect, decay: Number(event.target.value) })} /></label> : <>
                  <label><span>Feedback <output>{effect.feedback}%</output></span><input type="range" aria-label={`${trackLabel(effectRow)} delay feedback`} min={0} max={80} step={1} value={effect.feedback} onChange={(event) => changeEffect(index, { ...effect, feedback: Number(event.target.value) })} /></label>
                  <label className={styles.effectRate}><span>Note length</span><select aria-label={`${trackLabel(effectRow)} delay note length`} value={effect.rate} onChange={(event) => changeEffect(index, { ...effect, rate: event.target.value })}>{['1/2', '1/4', '1/8', '1/16', '1/32'].flatMap((rate) => [rate, `${rate}.`, `${rate}t`]).map((rate) => <option value={rate} key={rate}>{rate.endsWith('.') ? `${rate.slice(0, -1)} dotted` : rate.endsWith('t') ? `${rate.slice(0, -1)} triplet` : rate}</option>)}</select></label>
                </>}
              </>}
            </div>)}</div>
          </section>}
          {selectedRow && selectedSteps && <section ref={stepsRef} id="drum-steps-editor" className={styles.stepsEditor} aria-label={`${trackLabel(selectedRow)} step editor`}>
            <div className={styles.stepsHead}>
              <div><strong>{trackLabel(selectedRow).toUpperCase()}</strong><span>{PART_NAMES[selectedRow.part]}</span></div>
              {selectedSteps.model && <label className={styles.gridSelect}>
                <span>Grid</span>
                <select
                  aria-label={`Note length for ${trackLabel(selectedRow)}`}
                  value={selectedSteps.model.groups.every((group) => group.length === selectedSteps.model?.groups[0].length) ? selectedSteps.model.groups[0].length : 'mixed'}
                  onChange={(event) => resizeSteps(Number(event.target.value))}
                >
                  {!selectedSteps.model.groups.every((group) => group.length === selectedSteps.model?.groups[0].length) && <option value="mixed" disabled>Mixed · from text</option>}
                  {selectedSteps.model.groups.every((group) => group.length === selectedSteps.model?.groups[0].length) && !STEP_DIVISIONS.some((amount) => amount === selectedSteps.model?.groups[0].length) && <option value={selectedSteps.model.groups[0].length} disabled>{selectedSteps.model.groups[0].length}/beat · from text</option>}
                  {STEP_DIVISIONS.map((amount) => <option key={amount} value={amount}>{gridLabel(amount, selectedSteps.model!.unit)}</option>)}
                </select>
              </label>}
              <button onClick={() => {
                setSelectedRowKey(null);
                editorRef.current?.setSelectionRange(selectedRow.start, selectedRow.start);
                editorRef.current?.focus();
              }}>Close steps</button>
            </div>
            {selectedSteps.model ? <>
              {!selectedSteps.model.directBrackets && <p>Editing a step expands this row’s rhythm to explicit brackets. Your other parameter expressions stay unchanged.</p>}
              <div className={styles.stepBeats}>
                {selectedSteps.model.groups.map((group, beatIndex) => <div
                  key={beatIndex}
                  className={`${styles.stepBeat} ${playing && currentBeat === beatIndex % selectedSteps.model!.beats + 1 && activeBar.beats === selectedSteps.model?.beats && activeBar.unit === selectedSteps.model?.unit && document.passages.find((passage) => selectedRow.start >= passage.bodyStart && selectedRow.start <= passage.bodyEnd)?.name === score.name && (passageBar - 1) % selectedSteps.model!.barCount === Math.floor(beatIndex / selectedSteps.model!.beats) ? styles.activeBeat : ''}`}
                >
                  <div className={styles.beatHeading}><span>{selectedSteps.model!.groups.length > selectedSteps.model!.beats ? `BAR ${Math.floor(beatIndex / selectedSteps.model!.beats) + 1} · ` : ''}BEAT {beatIndex % selectedSteps.model!.beats + 1}</span><small>{group.length} {group.length === 1 ? 'step' : 'steps'}</small></div>
                  <div className={styles.stepCells} style={{ gridTemplateColumns: `repeat(${group.length}, minmax(32px, 1fr))` }}>
                    {[...group].map((value, stepIndex) => <div className={styles.stepCell} key={stepIndex}>
                      <span aria-hidden="true">{stepLabel(beatIndex % selectedSteps.model!.beats, stepIndex, group.length)}</span>
                      <button
                        aria-label={`${trackLabel(selectedRow)} ${selectedSteps.model!.groups.length > selectedSteps.model!.beats ? `bar ${Math.floor(beatIndex / selectedSteps.model!.beats) + 1} ` : ''}beat ${beatIndex % selectedSteps.model!.beats + 1} step ${stepIndex + 1}`}
                        aria-pressed={value === '1'}
                        onClick={() => toggleStep(beatIndex, stepIndex)}
                      >{value}</button>
                    </div>)}
                  </div>
                </div>)}
              </div>
              <code className={styles.stepSource}>{selectedRow.text}</code>
              <p>Changes appear in your text. ⌘ / Ctrl + Enter applies them on the next bar while playing.</p>
            </> : <p className={styles.stepError} role="status">{selectedSteps.error}</p>}
          </section>}
          <div role="status" className={`${styles.console} ${error ? styles.consoleError : ''}`}><span>{error ? '!' : queuedScore ? '↻' : '✓'}</span>{message}</div>
        </section>

        <aside className={styles.passagePanel} aria-label="Passages">
          <div className={styles.panelHead}><div>PASSAGES</div><span>{document.passages.length}</span></div>
          <div className={styles.passageTools}>
            <button onClick={() => addPassage()}>+ New</button>
            <button onClick={() => addPassage(true)}>Duplicate</button>
            <button onClick={() => setRenameDraft(selectedPassage.name)} disabled={playing} title={playing ? 'Stop playback to rename a passage' : 'Rename the editing passage'}>Rename</button>
          </div>
          <section className={styles.songOrder} aria-label="Song order">
            <div className={styles.songOrderHead}><strong>SONG ORDER</strong><span>{arrangement.entries.reduce((total, entry) => total + entry.bars, 0)} bars · draft</span></div>
            {arrangement.error ? <p role="status" className={styles.songError}>{arrangement.error} Finish it in the code; playback keeps its last valid version.</p> : <>
              {!arrangement.entries.length && <p>Arrange the whole song. Names and bar counts also live in your code.</p>}
              <ol ref={songOrderRef}>{arrangement.entries.map((entry, index) => <li key={`${index}:${entry.name}`} data-applied={mode === 'song' && songProgress?.index === index && songProgress.entry.name === entry.name} className={mode === 'song' && songProgress?.index === index && songProgress.entry.name === entry.name ? styles.songActive : ''}>
                <div><span>{index + 1}</span><select aria-label={`Song section ${index + 1} passage`} value={entry.name} onChange={(event) => editArrangement(arrangement.entries.map((item, position) => position === index ? { ...item, name: event.target.value } : item))}>
                  {!document.passages.some((passage) => passage.name === entry.name) && <option value={entry.name}>{entry.name} · missing</option>}
                  {document.passages.map((passage, position) => <option key={`${position}:${passage.name}`} value={passage.name}>{passage.name}</option>)}
                </select><input key={`bars:${entry.bars}`} type="number" min={1} max={256} step={1} defaultValue={entry.bars} aria-label={`Song section ${index + 1} bars`} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} onBlur={(event) => { if (!editArrangement(arrangement.entries.map((item, position) => position === index ? { ...item, bars: event.target.value ? Number(event.target.value) : 0 } : item))) event.currentTarget.value = String(entry.bars); }} /><small>bars</small></div>
                <div className={styles.songOrderActions}>
                  <button aria-label={`Move song section ${index + 1} up`} disabled={index === 0} onClick={() => { const entries = [...arrangement.entries]; [entries[index - 1], entries[index]] = [entries[index], entries[index - 1]]; editArrangement(entries); }}>↑</button>
                  <button aria-label={`Move song section ${index + 1} down`} disabled={index === arrangement.entries.length - 1} onClick={() => { const entries = [...arrangement.entries]; [entries[index + 1], entries[index]] = [entries[index], entries[index + 1]]; editArrangement(entries); }}>↓</button>
                  <button aria-label={`Remove song section ${index + 1}`} onClick={() => editArrangement(arrangement.entries.filter((_, position) => position !== index))}>Remove</button>
                </div>
              </li>)}</ol>
              <div className={styles.songOrderAdd}>
                <select aria-label="Passage to add to song" value={document.passages.some((passage) => passage.name === songPart) ? songPart : selectedPassage.name} onChange={(event) => setSongPart(event.target.value)}>{document.passages.map((passage, index) => <option key={`${index}:${passage.name}`} value={passage.name}>{passage.name}</option>)}</select>
                <button disabled={arrangement.entries.length >= 128} onClick={() => editArrangement([...arrangement.entries, { name: document.passages.some((passage) => passage.name === songPart) ? songPart : selectedPassage.name, bars: 4 }])}>+ Section</button>
              </div>
              <p>{playing && mode === 'song' ? 'Playing the applied order. Draft edits need Re-evaluate.' : 'Each section starts its passage from bar 1.'}</p>
            </>}
          </section>
          {renameDraft !== null && <form className={styles.renameForm} onSubmit={(event) => { event.preventDefault(); renamePassage(); }}>
            <input aria-label="Passage name" value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} maxLength={48} autoFocus />
            <button type="submit">Save name</button><button type="button" onClick={() => setRenameDraft(null)}>Cancel</button>
          </form>}
          <div className={styles.passageList}>
            {document.passages.map((passage, index) => <div key={`${passage.name}:${index}`} className={`${styles.passageCard} ${selectedPassage === passage ? styles.editingPassage : ''} ${playing && score.name === passage.name ? styles.playingPassage : ''} ${queuedScore?.score.name === passage.name ? styles.queuedPassage : ''}`}>
              <button className={styles.passageName} aria-label={`Edit ${passage.name}`} aria-pressed={selectedPassage === passage} onClick={() => focusPassage(passage)}>
                {passage.name}
                <small>{[playing && score.name === passage.name ? 'PLAYING' : '', queuedScore?.score.name === passage.name ? 'NEXT BAR' : '', selectedPassage === passage ? 'EDITING' : ''].filter(Boolean).join(' · ') || `${passageBarCount(passage.body)} ${passageBarCount(passage.body) === 1 ? 'bar' : 'bars'}`}</small>
                {index < 9 && <kbd>⌘ / Ctrl ⇧ {index + 1}</kbd>}
              </button>
              <button className={styles.launchPassage} aria-label={`Launch ${passage.name}`} title="Enter on the next bar" onClick={() => launchPassage(passage.name)}>▶</button>
            </div>)}
          </div>
          <div className={styles.performanceStatus}><span>{playing ? 'PLAYING' : 'READY'}</span><strong>{score.name}</strong><code>passage bar {passageBar}</code><code>{score.trackBars.map((track) => `${trackLabel(track)} ${(passageBar - 1) % track.length + 1}/${track.length}`).join(' · ') || 'silent passage'}</code><code aria-label="Applied soundbanks">{score.trackBars.map((track) => `${trackLabel(track)}: ${activeBar.timbres[trackId(track)]}`).join(' · ')}</code><code aria-label="Applied volumes">{score.trackBars.map((track) => `${trackLabel(track)}: ${activeBar.volumes[trackId(track)]} dB`).join(' · ')}</code><code aria-label="Applied effects">{score.trackBars.filter((track) => activeBar.effects[trackId(track)].length).map((track) => `${trackLabel(track)}: ${activeBar.effects[trackId(track)].map(effectLabel).join(' → ')}`).join(' · ') || 'No effects'}</code><code aria-label="Applied groove">{score.trackBars.filter((track) => activeBar.swings[trackId(track)] !== 50 || activeBar.velocities[trackId(track)].join(',') !== '127').map((track) => `${trackLabel(track)}: velocity ${activeBar.velocities[trackId(track)].join('/')} · swing ${activeBar.swings[trackId(track)]}%`).join(' · ') || 'Straight timing · original strength'}</code><code>beat {currentBeat < 0 ? '—' : currentBeat}/{activeBar.beats} · {currentHits}</code>
          </div>
          <p className={styles.performanceStatus} aria-label="Applied playback selection">
            <code>PLAY: {[...new Set(score.trackBars.filter((track) => trackIsAudible(activeBar, track)).map(trackLabel))].join(' · ') || 'none — silent passage'}</code>
            {!!activeBar.selection?.solo.length && <code>solo({activeBar.selection.solo.map((id) => trackLabel(activeBar.trackParts![id])).join(', ')})</code>}
            {!!activeBar.selection?.mute.length && <code>mute({activeBar.selection.mute.map((id) => trackLabel(activeBar.trackParts![id])).join(', ')})</code>}
          </p>
          <details className={styles.reference}>
            <summary>Language & sound library</summary>
            <button className={styles.manualStudio} onClick={() => changeView('manual')}>New here? Open the step-by-step Manual →</button>
            <code>tempo 60*2<br />bd([]*4)<br />hh([1 0]*(2+2)).velocity(10*8).volume(-3*2)</code>
            <p>Numbers accept +, −, *, / and parentheses. [] followed by * repeats that group within the bar; note * still sets its time weight. Use parentheses for calculated scale degrees, such as [(1+2)]. Expressions calculate when applied, not automatically over time. Re-evaluate applies at the next bar; invalid calculations keep the last valid music.</p>
            <code>chords = keys([C3&amp;E3&amp;G3]).volume(-12)<br />melody = keys([C4][E4][G4][E4]).volume(-6)</code>
            <p>Optional track names let several rows use the same instrument independently. Write name = instrument(...). Use letters, digits and underscores, starting with a letter or underscore; names are case-sensitive, up to 48 characters and unique within a passage. Other passages may use the same name. Names are not shared pattern variables. Unnamed rows still work. All edits apply on re-evaluation.</p>
            <code>solo(melody, kick)<br />mute(chords)</code>
            <p>Write mute(...) or solo(...) on its own line inside a passage, below the instruments. Use comma-separated track names without quotes; unnamed instruments use their part name, such as bd. Type inside the parentheses for inline track suggestions. Solo selects tracks, then mute excludes tracks. Empty () or removing the line clears that filter; with neither filter, all tracks play. Each passage keeps its own selection. Cmd/Ctrl+Enter applies on the next bar without resetting loops. Mute silences the whole track, including effects, with a short click-free fade.</p>
            <p>Drums: each [] is one beat of a looping groove; 1 triggers a hit.<br />Notes: bracket groups divide the whole bar equally. Empty groups and ~ are rests.<br />In 4/4: [C3maj] = four beats; [C3maj][Dm] = two beats each; [C3maj][][][] = one beat, then three silent beats.<br />[C4 D4 E4] divides its group into three equal notes; * changes shares within that group.<br />[C3&E3&G3] or [C3maj] = chord</p>
            <code>bass([C2][G2]).timbre("sub").volume(-6)<br />keys([C3maj7]).timbre("piano").volume(-9)</code>
            <p>.volume(-6) lowers one instrument by 6 dB. Default 0; range −60 to +6 dB. It works before or after .timbre(). Changes enter on the next bar.</p>
            <code>hh([1 1][1 1][1 1][1 1]).velocity(90, 45).swing(60)<br />keys([C3maj D3min][][][]).velocity(100, 70).swing(60)</code>
            <p>.velocity() repeats MIDI strengths (1–127) across actual hits; rests do not advance, and a chord uses one value. 127 is the original level. .volume() still controls the whole instrument. .swing(50) is straight; 60 divides each beat 60:40; range 50–75%. Straight subdivisions move, triplets and * weights stay as written. Notes' gates follow their swung timing; bar lengths stay fixed.</p>
            <p>Type .v or .s for inline groove suggestions, then edit the numbers in the parentheses with parameter hints. No bare-dot menu, no popup. Modifiers may continue on separate lines. Re-evaluation keeps elapsed bars and velocity phase under the new pattern; a passage launch or Song section starts from its first hit.</p>
            <p>Use note names with an octave, sharps or flats: C4, F#3, Bb3. Without an octave, notes use octave 4. Named chords: maj, min, maj7, min7, dom7, dim, sus2, sus4. C7 means the note in octave 7; write Cdom7 for a dominant chord.</p>
            <code>keys([1&amp;3&amp;5]).scale("C3 major")<br />bass([1][3][5][8]).scale("C1 minor")</code>
            <p>Scale belongs after each melodic instrument, never before a passage. Root + octave + mode: major/ionian, minor/aeolian, dorian, phrygian, lydian, mixolydian, locrian, chromatic. 1 is the root; 8 is always the next octave. 0 and ~ rest. Chromatic uses 1 #1 2 … or 7 b7 6 …, with major-degree positions; b3 is flat third, B3 is a named note. Other modes use their own scale degrees without #/b prefixes. Type .sc to insert .scale(), then C3 m inside it to search. Changes apply only on re-evaluation.</p>
            <p>A comma adds a bar, up to 4 per instrument. One bar loops on its own; different lengths loop independently. In 6/8, each [] is one eighth-note beat. Spaces are ordinary spaces.</p>
            <p>Drums: {PARTS.join(' · ')}<br />Melodic instruments: {NOTE_PARTS.join(' · ')}</p>
            <code>bd("x ~ x ~")<br />hh("x*8")</code>
            <p>Older drum 0/1 rows and | bar separators still work. Steps edits drums only; melodic notes stay in text.</p>
            <p>Drum kits: {SOUNDBANKS.filter((bank) => bank.kind === 'drum').map((bank) => bank.id).join(' · ')}</p>
            <p>Melodic sounds: {SOUNDBANKS.filter((bank) => bank.kind === 'pitched').map((bank) => bank.id).join(' · ')}</p>
            <p>All sounds are original browser synthesis. Piano, strings and guitar are synthesized approximations, not recorded acoustic instruments. The electronic drum names describe styles, not exact hardware emulations.</p>
            <p>Type a name inside .timbre() for compatible sounds. ↑↓ chooses; Enter / Tab completes; Esc hides. No popup. ⌘ / Ctrl + Enter applies edits on the next bar without restarting playback.</p>
            <code>keys([C3maj]).effects("reverb", 25)<br />hh("x*8").effects("delay", 20, "1/8", 35)<br />synth([C3]).effects("filter", 1800)</code>
            <p>Type a name inside .effects() to search Reverb, Delay or Filter. Mix and feedback use percentages; reverb decay uses seconds; filter is low-pass, in Hz. Delay follows the tempo and note length (dotted . / triplet t supported). Effects process left to right; volume is before the effects.</p>
            <p>Select a row with effects to reveal its sliders below the editor. Sliders update the code and apply on the next bar for the playing passage; another passage stays a draft. Removing an effect in code bypasses it after re-evaluation. Natural effect tails continue across edits; Stop clears them.</p>
            <p>Your code, song name and editing passage auto-save in this browser, including unfinished drafts. Open/New stop playback; restored projects never auto-play. Export .ohcodes or ⌘ / Ctrl + S makes a portable file. Older .ohsounds files and browser drafts still open. This is not cloud sync; clearing browser data or switching browsers/sites does not carry your draft over. Previous draft recovers the last replaced local project.</p>
            <code>song{'{'}<br />  "Verse" 8<br />  "Chorus" 8<br />{'}'}</code>
            <p>Song mode follows this order once and stops. Numbers count bars, not repetitions of the instrument pattern. Every section starts its passage at bar 1. Its controls edit the same code; save/export includes the order. Song re-evaluation compiles all referenced passages and applies on the next bar, preserving elapsed song bars. Live mode loops; manually launching a passage leaves Song mode on the next bar. Switching back to Song starts at its first section. Restored projects open stopped in Live mode.</p>
            <p>Click a passage name to edit without changing playback. ▶ or ⌘ / Ctrl + Shift + 1–9 launches it on the next bar. Imported samples, audio recording and audio export are not connected yet.</p>
          </details>
        </aside>
      </section>

      </div>

      <footer className={styles.footer}>
        <span>OHCODES · DESIGNED BY HAORAN HOU</span>
        <span>TYPE → RE-EVALUATE → KEEP PLAYING</span>
      </footer>
    </main>
  );
}
