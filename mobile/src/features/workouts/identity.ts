import { uuidv5 } from '../../lib/uuid';

// One id per session slot, shared by storage and pure workout calculations.
export const setLogId = (sessionId: string, exercisePosition: number, setIndex: number) =>
  uuidv5(`${exercisePosition}:${setIndex}`, sessionId);
