import { STARTER, parsePassage, readPassages } from './ohcodes-language';

// Keep the existing storage namespace so the rename never strands browser drafts.
export const DRAFT_KEY = 'ohsounds.project.v1';
export const PREVIOUS_KEY = 'ohsounds.project.previous.v1';
export const MAX_PROJECT_BYTES = 2 * 1024 * 1024;
export const MAX_CODE_LENGTH = 250000;
export const DEFAULT_PROJECT_NAME = 'Untitled';
export type OhcodesProject = {
  format: 'ohcodes'; version: 1; name: string; code: string;
  editingPassage: string; updatedAt: string;
};
export type ProjectStorage = Pick<Storage, 'getItem' | 'setItem'>;
export class DraftConflict extends Error {
  constructor() { super('Another tab changed the browser draft. Export your work before replacing it.'); }
}

function projectName(name: string) {
  if (name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('Use a song name of up to 80 characters on one line.');
  return name.trim() || DEFAULT_PROJECT_NAME;
}
export function createProject(name: string, code: string, editingPassage: string, updatedAt = new Date().toISOString()): OhcodesProject {
  if (typeof code !== 'string' || code.length > MAX_CODE_LENGTH) throw new Error(`Project code is too large (maximum ${MAX_CODE_LENGTH} characters).`);
  if (typeof editingPassage !== 'string' || editingPassage.length > 48 || /[\r\n\u0000]/.test(editingPassage)) throw new Error('Invalid editing passage in this project.');
  if (typeof updatedAt !== 'string' || updatedAt.length > 40 || !Number.isFinite(Date.parse(updatedAt))) throw new Error('Invalid project save date.');
  return { format: 'ohcodes', version: 1, name: projectName(name), code, editingPassage, updatedAt };
}
export function parseProject(raw: string): OhcodesProject {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_PROJECT_BYTES) throw new Error('Choose an ohcodes project smaller than 2 MB.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('This is not a readable ohcodes project. Your current code is unchanged.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose an ohcodes project exported from this app.');
  const project = value as Record<string, unknown>;
  if (project.format !== 'ohcodes' && project.format !== 'ohsounds') throw new Error('Choose an ohcodes project exported from this app.');
  if (project.version !== 1) throw new Error('This project uses an unsupported file version. Your current code is unchanged.');
  if (typeof project.name !== 'string' || typeof project.code !== 'string' || typeof project.editingPassage !== 'string' || typeof project.updatedAt !== 'string') throw new Error('This project is missing its name, code, editing passage, or save date.');
  // Validate only the file shape. Musical drafts, including incomplete passages, are valuable data.
  return createProject(project.name, project.code, project.editingPassage, project.updatedAt);
}
export function serializeProject(project: OhcodesProject) { return `${JSON.stringify(createProject(project.name, project.code, project.editingPassage, project.updatedAt), null, 2)}\n`; }
export function projectFingerprint(project: Pick<OhcodesProject, 'name' | 'code'>) { return JSON.stringify([project.name.trim() || DEFAULT_PROJECT_NAME, project.code]); }
export function projectFilename(name: string) {
  const safe = projectName(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 80) || 'Untitled';
  return `${/^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i.test(safe) ? `song-${safe}` : safe}.ohcodes`;
}

export function prepareProject(project: OhcodesProject) {
  const passages = readPassages(project.code).passages;
  const selected = passages.find((passage) => passage.name === project.editingPassage) ?? passages[0];
  try { return { selected: selected.name, score: parsePassage(project.code, selected.name), unfinished: false }; }
  catch {
    const silent = parsePassage(STARTER, 'Passage 1');
    return { selected: selected.name, score: { ...silent, name: selected.name, trackBars: [] }, unfinished: true };
  }
}

// Refuse stale writes instead of silently overwriting another tab's work.
export function saveDraft(storage: ProjectStorage, project: OhcodesProject, expectedRaw: string | null) {
  const current = storage.getItem(DRAFT_KEY);
  if (current !== expectedRaw) throw new DraftConflict();
  if (current !== null) {
    const stored = parseProject(current);
    if (projectFingerprint(stored) === projectFingerprint(project) && stored.editingPassage === project.editingPassage) return current;
  }
  const raw = serializeProject(project);
  storage.setItem(DRAFT_KEY, raw);
  return raw;
}
// The previous slot retains the replaced draft, not audio/runtime state or browser credentials.
export function replaceDraft(storage: ProjectStorage, project: OhcodesProject, previous: OhcodesProject, expectedRaw: string | null) {
  const current = storage.getItem(DRAFT_KEY);
  if (current !== expectedRaw) throw new DraftConflict();
  let backup = serializeProject(previous); // Include edits still waiting for the debounce.
  if (current !== null) { try { parseProject(current); } catch { backup = current; } }
  storage.setItem(PREVIOUS_KEY, backup);
  const raw = serializeProject(project);
  storage.setItem(DRAFT_KEY, raw);
  return raw;
}
