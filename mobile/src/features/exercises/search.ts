import { CATEGORY_LABELS, EQUIPMENT_LABELS, MUSCLE_LABELS } from './labels';
import type { Category, Equipment, Exercise, Muscle } from './types';

// Library search and filters. Runs on the phone over the whole library (under a thousand
// exercises), so it works offline and needs no index.

export type Filters = {
  category?: Category | null;
  muscle?: Muscle | null;
  equipment?: Equipment | null;
  favouritesOnly?: boolean;
};

// Gym shorthand people type, expanded before matching.
const SHORTHAND: Record<string, string> = {
  db: 'dumbbell',
  dbs: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  ez: 'ez bar',
  bw: 'bodyweight',
  rdl: 'romanian deadlift',
  ohp: 'military press',
  abs: 'abdominals',
  quads: 'quadriceps',
  hams: 'hamstrings',
  pecs: 'chest',
};

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function queryWords(query: string): string[] {
  return normalise(query)
    .split(' ')
    .filter(Boolean)
    .flatMap((word) => (SHORTHAND[word] ?? word).split(' '));
}

// Everything a word may match, with and without spaces so "pushup" finds "Push-Up".
function haystack(x: Exercise): { text: string; compact: string; name: string; nameCompact: string } {
  const name = normalise(x.name);
  const extras = [
    ...x.primary,
    ...x.primary.map((m) => MUSCLE_LABELS[m]),
    ...x.secondary,
    x.equipment ?? '',
    x.equipment ? EQUIPMENT_LABELS[x.equipment] : '',
    CATEGORY_LABELS[x.category],
  ];
  const text = normalise([name, ...extras].join(' '));
  return { text, compact: text.replace(/ /g, ''), name, nameCompact: name.replace(/ /g, '') };
}

const contains = (h: { text: string; compact: string }, word: string) => h.text.includes(word) || h.compact.includes(word);

export function matchesFilters(x: Exercise, filters: Filters, favourites: ReadonlySet<string>): boolean {
  if (filters.category && x.category !== filters.category) return false;
  if (filters.equipment && x.equipment !== filters.equipment) return false;
  if (filters.muscle && !x.primary.includes(filters.muscle)) return false;
  if (filters.favouritesOnly && !favourites.has(x.id)) return false;
  return true;
}

const UNRANKED = 10_000;

// Filters, then (when there is a query) matches every word and ranks: every word in the name, then
// common exercises by popularity, then names starting with the query, then the user's own, then
// shorter names (the plainer match), then A to Z. With no query: the user's own and common
// exercises first.
export function searchExercises(exercises: Exercise[], query: string, filters: Filters = {}, favourites: ReadonlySet<string> = new Set()): Exercise[] {
  const words = queryWords(query);
  const phrase = words.join(' ');
  const scored: { x: Exercise; rank: number[] }[] = [];

  for (const x of exercises) {
    if (!matchesFilters(x, filters, favourites)) continue;
    const h = haystack(x);
    if (!words.every((w) => contains(h, w))) continue;
    const startsWith = phrase && (h.name.startsWith(phrase) || h.nameCompact.startsWith(phrase.replace(/ /g, ''))) ? 0 : 1;
    const allInName = words.length && words.every((w) => h.name.includes(w) || h.nameCompact.includes(w)) ? 0 : 1;
    scored.push({
      x,
      rank: words.length
        ? [allInName, x.popularity ?? UNRANKED, startsWith, x.origin === 'custom' ? 0 : 1, x.name.length]
        : [x.origin === 'custom' ? 0 : 1, x.popularity ?? UNRANKED],
    });
  }

  return scored
    .sort((a, b) => {
      for (let i = 0; i < a.rank.length; i += 1) if (a.rank[i] !== b.rank[i]) return a.rank[i]! - b.rank[i]!;
      return a.x.name.localeCompare(b.x.name, 'en');
    })
    .map((s) => s.x);
}
