import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureGraph } from './fixtureGraph';

// End to end over fixtures/python-basic: the real indexer must draw exactly
// the import edges listed in that fixture's README, and none to the standard
// library.
let result: Awaited<ReturnType<typeof fixtureGraph>>;

beforeAll(async () => {
    result = await fixtureGraph('python-basic');
});

describe('fixtures/python-basic', () => {
    // Whole-module imports (`import a.b`) carry no symbol name, hence [].
    it('draws every import edge, with the imported names, and nothing else', () => {
        expect(result.edges).toEqual([
            'app/cli.py <- app/config.py []',
            'app/cli.py <- app/services/notify.py [notify_created]',
            'app/cli.py <- app/services/orders.py [OrderService]',
            'app/models/__init__.py <- app/models/order.py [Order]',
            'app/models/__init__.py <- app/models/user.py [User]',
            'app/models/order.py <- app/models/user.py [User]',
            'app/services/notify.py <- app/services/orders.py [OrderService]',
            'app/services/notify.py <- app/utils/formatting.py [money, today]',
            'app/services/orders.py <- app/models/__init__.py [Order, User]',
            'app/services/orders.py <- app/utils/formatting.py [formatting]',
            'app/utils/formatting.py <- app/config.py [CURRENCY]',
            'main.py <- app/cli.py [run]',
            'scripts/seed.py <- app/models/user.py []',
            'tests/test_orders.py <- app/services/orders.py [OrderService]',
        ]);
    });

    it('keeps the unused module as an isolated node', () => {
        expect(result.isolated).toContain('app/utils/legacy.py');
    });
});
