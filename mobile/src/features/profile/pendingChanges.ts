import type { Me, ProfilePatch } from './types';

// Profile edits are saved on the phone first and sent to the API when there is a connection.
// Until Phase 2's sync engine arrives, unsent edits are kept as one merged patch per user.

export function isEmptyPatch(patch: ProfilePatch): boolean {
  return Object.keys(patch).length === 0;
}

// Combines an older unsent patch with a newer one. The newer value wins for each field.
export function mergePatches(older: ProfilePatch, newer: ProfilePatch): ProfilePatch {
  return { ...older, ...newer };
}

// What the app shows: the last profile the server confirmed, with unsent edits laid on top.
export function applyPatch(me: Me, patch: ProfilePatch): Me {
  const { displayName, ...profileFields } = patch;
  return {
    user: displayName === undefined ? me.user : { ...me.user, displayName },
    profile: { ...me.profile, ...profileFields },
  };
}

// After a patch reaches the server, removes the fields it carried from the queue. A field edited
// again while the request was on its way keeps its newer value and is sent next time.
export function remainingAfterSend(sent: ProfilePatch, queued: ProfilePatch): ProfilePatch {
  const remaining: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(queued)) {
    if (!(key in sent) || (sent as Record<string, unknown>)[key] !== value) remaining[key] = value;
  }
  return remaining as ProfilePatch;
}

// Reads a stored patch, treating anything unreadable as no changes.
export function parsePatch(raw: string | null): ProfilePatch {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as ProfilePatch) : {};
  } catch {
    return {};
  }
}
