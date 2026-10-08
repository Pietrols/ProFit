import { describe, expect, it } from 'vitest';
import { testDatabase } from '../../../lib/db/__tests__/nodeDriver';
import { syncedCollections } from '../../sync/collections';
import { createSyncEngine } from '../../sync/engine';
import { fakeSyncServer } from '../../sync/__tests__/fakeSyncServer';
import { deleteCustomExercise, getCustomExercise, listCustomExercises, saveCustomExercise, validateCustomExercise, type CustomExerciseInput } from '../customExercises';
import { favouriteId, listFavouriteIds, setFavourite } from '../favourites';

const PETER = '0b9f3c2e-1d2a-4c5b-8e9f-0a1b2c3d4e5f';
const at = (minute: number) => new Date(Date.UTC(2026, 9, 7, 10, minute));

const sandbag: CustomExerciseInput = {
  name: '  Sandbag Carry ',
  category: 'strongman',
  equipment: 'other',
  primary: ['traps', 'forearms'],
  secondary: ['abdominals', 'traps'],
  tracking: 'distance_time',
  instructions: 'Hug the bag high.\n\n  Walk tall. ',
  photoId: null,
};

describe('custom exercises', () => {
  it('saves, lists and reads back in the library shape', async () => {
    const db = await testDatabase();
    const id = await saveCustomExercise(db, PETER, sandbag, at(0));
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const saved = await getCustomExercise(db, PETER, id);
    expect(saved).toMatchObject({
      name: 'Sandbag Carry',
      primary: ['traps', 'forearms'],
      secondary: ['abdominals'], // a muscle already listed as main is not repeated
      instructions: ['Hug the bag high.', 'Walk tall.'],
      origin: 'custom',
      common: false,
    });
    expect(await listCustomExercises(db, PETER)).toHaveLength(1);
  });

  it('updates in place and deletes as a tombstone', async () => {
    const db = await testDatabase();
    const id = await saveCustomExercise(db, PETER, sandbag, at(0));
    await saveCustomExercise(db, PETER, { ...sandbag, name: 'Sandbag Bear Hug Carry' }, at(1), id);
    expect((await listCustomExercises(db, PETER)).map((x) => x.name)).toEqual(['Sandbag Bear Hug Carry']);
    await deleteCustomExercise(db, PETER, id, at(2));
    expect(await listCustomExercises(db, PETER)).toEqual([]);
    expect(await db.first('SELECT dirty, deleted_at FROM custom_exercises')).toEqual({ dirty: 1, deleted_at: at(2).toISOString() });
  });

  it('checks the form with the API limits', () => {
    expect(validateCustomExercise(sandbag)).toEqual({});
    expect(validateCustomExercise({ ...sandbag, name: ' ', primary: [] })).toEqual({
      name: 'Give the exercise a name.',
      primary: 'Pick the main muscle it works.',
    });
  });

  it('syncs to a second phone with its muscle lists intact', async () => {
    const server = fakeSyncServer();
    const a = await testDatabase();
    const b = await testDatabase();
    const engineA = createSyncEngine({ db: a, api: server.clientFor(PETER), collections: syncedCollections });
    const engineB = createSyncEngine({ db: b, api: server.clientFor(PETER), collections: syncedCollections });
    await engineA.setUser(PETER);
    await engineB.setUser(PETER);

    const id = await saveCustomExercise(a, PETER, sandbag, at(0));
    await setFavourite(a, PETER, id, true, at(1));
    await setFavourite(a, PETER, 'Barbell_Squat', true, at(1));
    await engineA.sync();
    await engineB.sync();

    expect(await getCustomExercise(b, PETER, id)).toMatchObject({ name: 'Sandbag Carry', primary: ['traps', 'forearms'], secondary: ['abdominals'] });
    expect(await listFavouriteIds(b, PETER)).toEqual(new Set([id, 'Barbell_Squat']));
  });
});

describe('favourites', () => {
  it('keeps one row per exercise and un-stars as a delete', async () => {
    const db = await testDatabase();
    await setFavourite(db, PETER, 'Plank', true, at(0));
    await setFavourite(db, PETER, 'Plank', true, at(1));
    await setFavourite(db, PETER, 'Pullups', true, at(1));
    expect(await listFavouriteIds(db, PETER)).toEqual(new Set(['Plank', 'Pullups']));
    await setFavourite(db, PETER, 'Plank', false, at(2));
    expect(await listFavouriteIds(db, PETER)).toEqual(new Set(['Pullups']));
    expect(await db.first('SELECT COUNT(*) AS n FROM exercise_favourites')).toEqual({ n: 2 });
  });

  it('gives every phone the same id for the same star', () => {
    expect(favouriteId(PETER, 'Plank')).toBe(favouriteId(PETER, 'Plank'));
    expect(favouriteId(PETER, 'Plank')).not.toBe(favouriteId(PETER, 'Pullups'));
  });
});
