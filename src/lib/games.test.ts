import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllCategories,
    getAllGames,
    getAllGameIds,
    getAllPublishers,
    getGameById,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

async function seedFilteredCatalog(db: Database): Promise<{
    strategyId: number;
    puzzleId: number;
    publisherOneId: number;
    publisherTwoId: number;
}> {
    const [strategy] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [puzzle] = await db
        .insert(categories)
        .values({ name: 'Puzzle', description: 'cat' })
        .returning({ id: categories.id });
    const [publisherOne] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });
    const [publisherTwo] = await db
        .insert(publishers)
        .values({ name: 'Pub Two', description: 'pub' })
        .returning({ id: publishers.id });

    await db.insert(games).values([
        {
            title: 'Alpha',
            description: 'Alpha strategy title',
            starRating: 4.5,
            categoryId: strategy.id,
            publisherId: publisherOne.id,
        },
        {
            title: 'Bravo',
            description: 'Bravo strategy title',
            starRating: 4.1,
            categoryId: strategy.id,
            publisherId: publisherTwo.id,
        },
        {
            title: 'Charlie',
            description: 'Charlie puzzle title',
            starRating: 4.3,
            categoryId: puzzle.id,
            publisherId: publisherOne.id,
        },
    ]);

    return {
        strategyId: strategy.id,
        puzzleId: puzzle.id,
        publisherOneId: publisherOne.id,
        publisherTwoId: publisherTwo.id,
    };
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('filters games by category', async () => {
        const ids = await seedFilteredCatalog(db);
        const all = await getAllGames(db, [ids.strategyId]);
        expect(all.map((g) => g.title)).toEqual(['Alpha', 'Bravo']);
    });

    it('filters games by publisher', async () => {
        const ids = await seedFilteredCatalog(db);
        const all = await getAllGames(db, [], [ids.publisherOneId]);
        expect(all.map((g) => g.title)).toEqual(['Alpha', 'Charlie']);
    });

    it('combines category and publisher filters', async () => {
        const ids = await seedFilteredCatalog(db);
        const all = await getAllGames(db, [ids.strategyId], [ids.publisherOneId]);
        expect(all.map((g) => g.title)).toEqual(['Alpha']);
    });

    it('lists categories and publishers in alphabetical order', async () => {
        await seedFilteredCatalog(db);
        const categoriesList = await getAllCategories(db);
        const publishersList = await getAllPublishers(db);
        expect(categoriesList.map((category) => category.name)).toEqual(['Puzzle', 'Strategy']);
        expect(publishersList.map((publisher) => publisher.name)).toEqual(['Pub One', 'Pub Two']);
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });
});
