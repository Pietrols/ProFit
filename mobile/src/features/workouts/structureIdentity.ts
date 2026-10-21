import { uuidv5 } from '../../lib/uuid';
import { setLogId } from './identity';
import { validUuid } from './model';
import type { SessionItem } from './structureTypes';

const index = (value: number) => Number.isInteger(value) && value >= 0 && value <= 99;
export function plannedItemId(session: string, originalPosition: number): string {
  if (!validUuid(session) || !index(originalPosition))
    throw new Error('Invalid planned item identity.');
  return uuidv5(`item:${originalPosition}`, session);
}

export function sessionSlotId(
  item: Pick<SessionItem, 'id' | 'sessionId' | 'origin' | 'originalPosition'>,
  setIndex: number,
): string {
  if (!validUuid(item.id) || !validUuid(item.sessionId) || !index(setIndex))
    throw new Error('Invalid session slot identity.');
  if (item.origin === 'planned') {
    if (
      item.originalPosition === null ||
      plannedItemId(item.sessionId, item.originalPosition) !== item.id
    )
      throw new Error('The planned item no longer matches its original identity.');
    return setLogId(item.sessionId, item.originalPosition, setIndex);
  }
  if (!['added', 'replacement'].includes(item.origin) || item.originalPosition !== null)
    throw new Error('Invalid added item identity.');
  return uuidv5(`set:${setIndex}`, item.id);
}
