import { beforeEach, describe, expect, test } from 'bun:test'
import { AppError } from '../../lib/errors'
import { __resetRegistryForTests, registry } from '../../services/registry'
import { createFakeRepo, fakeService } from './dashboard.fakes'
import { createDashboardService } from './dashboard.service'

const ALICE = 'user-alice'
const BOB = 'user-bob'

let repo: ReturnType<typeof createFakeRepo>
let service: ReturnType<typeof createDashboardService>

beforeEach(() => {
    __resetRegistryForTests()
    registry.register(fakeService())

    repo = createFakeRepo()
    service = createDashboardService(repo)
})

async function expectAppError(promise: Promise<unknown>, status: number, code: string) {
    try {
        await promise
    } catch (error) {
        expect(error).toBeInstanceOf(AppError)
        expect((error as AppError).status).toBe(status)
        expect((error as AppError).code).toBe(code)
        return
    }
    throw new Error(`expected AppError ${status} ${code}, but nothing was thrown`)
}

function createParis(userId = ALICE) {
    return service.create(userId, {
        serviceId: 'weather',
        widgetId: 'forecast',
        params: { city: 'Paris' },
    })
}

describe('create', () => {
    test('persists param defaults, the refresh default and the layout defaults', async () => {
        const created = await createParis()

        expect(repo.rows).toHaveLength(1)
        expect(repo.rows[0]).toBe(created)
        expect(created).toMatchObject({
            userId: ALICE,
            serviceId: 'weather',
            widgetId: 'forecast',
            title: null,
            params: { city: 'Paris', days: 5 },
            refreshSeconds: 3600,
            x: 0,
            y: 0,
            w: 4,
            h: 3,
            enabled: true,
        })
    })

    test('keeps the values the user chose', async () => {
        const created = await service.create(ALICE, {
            serviceId: 'weather',
            widgetId: 'forecast',
            title: 'Home',
            params: { city: 'Rome', days: 2 },
            refreshSeconds: 300,
            x: 4,
            y: 2,
            w: 6,
            h: 5,
            enabled: false,
        })

        expect(created).toMatchObject({
            title: 'Home',
            params: { city: 'Rome', days: 2 },
            refreshSeconds: 300,
            x: 4,
            y: 2,
            w: 6,
            h: 5,
            enabled: false,
        })
    })

    test('stores integers as numbers and drops params the widget does not declare', async () => {
        const created = await service.create(ALICE, {
            serviceId: 'weather',
            widgetId: 'forecast',
            params: { city: 'Paris', days: '7', junk: 'x' },
        })

        expect(created.params).toEqual({ city: 'Paris', days: 7 })
    })

    test('rejects an unknown service', async () => {
        await expectAppError(
            service.create(ALICE, { serviceId: 'nope', widgetId: 'forecast', params: { city: 'Paris' } }),
            400,
            'UNKNOWN_WIDGET',
        )
        expect(repo.rows).toHaveLength(0)
    })

    test('rejects an unknown widget of a known service', async () => {
        await expectAppError(
            service.create(ALICE, { serviceId: 'weather', widgetId: 'nope', params: { city: 'Paris' } }),
            400,
            'UNKNOWN_WIDGET',
        )
        expect(repo.rows).toHaveLength(0)
    })

    test('rejects a missing required param', async () => {
        await expectAppError(
            service.create(ALICE, { serviceId: 'weather', widgetId: 'forecast', params: {} }),
            400,
            'INVALID_PARAMS',
        )
        await expectAppError(
            service.create(ALICE, { serviceId: 'weather', widgetId: 'forecast' }),
            400,
            'INVALID_PARAMS',
        )
        expect(repo.rows).toHaveLength(0)
    })

    test('rejects a param of the wrong type', async () => {
        await expectAppError(
            service.create(ALICE, {
                serviceId: 'weather',
                widgetId: 'forecast',
                params: { city: 'Paris', days: 'many' },
            }),
            400,
            'INVALID_PARAMS',
        )
        expect(repo.rows).toHaveLength(0)
    })

    test('rejects refreshSeconds below the widget minimum and accepts the minimum itself', async () => {
        await expectAppError(
            service.create(ALICE, {
                serviceId: 'weather',
                widgetId: 'forecast',
                params: { city: 'Paris' },
                refreshSeconds: 299,
            }),
            400,
            'REFRESH_TOO_LOW',
        )
        expect(repo.rows).toHaveLength(0)

        const created = await service.create(ALICE, {
            serviceId: 'weather',
            widgetId: 'forecast',
            params: { city: 'Paris' },
            refreshSeconds: 300,
        })
        expect(created.refreshSeconds).toBe(300)
    })

    test('allows instances of services that need credentials', async () => {
        registry.register(fakeService({
            id: 'github',
            auth: { kind: 'oauth2', provider: 'github', scopes: [] },
        }))

        const created = await service.create(ALICE, {
            serviceId: 'github',
            widgetId: 'forecast',
            params: { city: 'Paris' },
        })

        expect(created.serviceId).toBe('github')
    })
})

describe('list', () => {
    test('returns only the instances of the asking user', async () => {
        const mine = await createParis(ALICE)
        await createParis(BOB)

        expect(await service.list(ALICE)).toEqual([mine])
    })
})

describe('update', () => {
    test('changes only the fields that were sent', async () => {
        const created = await createParis()

        const updated = await service.update(ALICE, created.id, { title: 'Home', w: 6 })

        expect(updated).toMatchObject({
            title: 'Home',
            w: 6,
            h: 3,
            params: { city: 'Paris', days: 5 },
            refreshSeconds: 3600,
        })
    })

    test('can clear the title with null', async () => {
        const created = await service.create(ALICE, {
            serviceId: 'weather',
            widgetId: 'forecast',
            title: 'Home',
            params: { city: 'Paris' },
        })

        const updated = await service.update(ALICE, created.id, { title: null })

        expect(updated.title).toBeNull()
    })

    test('validates new params and applies defaults again', async () => {
        const created = await createParis()

        const updated = await service.update(ALICE, created.id, { params: { city: 'Rome' } })
        expect(updated.params).toEqual({ city: 'Rome', days: 5 })

        await expectAppError(service.update(ALICE, created.id, { params: {} }), 400, 'INVALID_PARAMS')
        expect(repo.rows[0]!.params).toEqual({ city: 'Rome', days: 5 })
    })

    test('rejects refreshSeconds below the widget minimum', async () => {
        const created = await createParis()

        await expectAppError(service.update(ALICE, created.id, { refreshSeconds: 60 }), 400, 'REFRESH_TOO_LOW')
        expect(repo.rows[0]!.refreshSeconds).toBe(3600)
    })

    test('still allows layout changes when the widget is no longer registered', async () => {
        const created = await createParis()
        __resetRegistryForTests()

        const moved = await service.update(ALICE, created.id, { x: 8 })
        expect(moved.x).toBe(8)

        await expectAppError(
            service.update(ALICE, created.id, { params: { city: 'Rome' } }),
            400,
            'UNKNOWN_WIDGET',
        )
    })
})

describe('ownership', () => {
    test('updating another user\'s instance is a 404 and changes nothing', async () => {
        const created = await createParis(ALICE)

        await expectAppError(service.update(BOB, created.id, { title: 'hacked' }), 404, 'NOT_FOUND')

        expect(repo.rows[0]!.title).toBeNull()
    })

    test('deleting another user\'s instance is a 404 and deletes nothing', async () => {
        const created = await createParis(ALICE)

        await expectAppError(service.remove(BOB, created.id), 404, 'NOT_FOUND')

        expect(repo.rows).toHaveLength(1)
    })

    test('an id that does not exist gets the same 404', async () => {
        const missing = crypto.randomUUID()

        await expectAppError(service.update(ALICE, missing, { title: 'x' }), 404, 'NOT_FOUND')
        await expectAppError(service.remove(ALICE, missing), 404, 'NOT_FOUND')
    })

    test('the owner can delete', async () => {
        const created = await createParis(ALICE)

        await service.remove(ALICE, created.id)

        expect(repo.rows).toHaveLength(0)
    })
})

describe('updateLayout', () => {
    test('moves several instances and returns the fresh list', async () => {
        const first = await createParis()
        const second = await createParis()

        const result = await service.updateLayout(ALICE, [
            { id: first.id, x: 1, y: 2, w: 3, h: 4 },
            { id: second.id, x: 5, y: 6, w: 7, h: 8 },
        ])

        expect(result).toHaveLength(2)
        expect(result[0]).toMatchObject({ id: first.id, x: 1, y: 2, w: 3, h: 4 })
        expect(result[1]).toMatchObject({ id: second.id, x: 5, y: 6, w: 7, h: 8 })
    })

    test('any foreign id makes the whole update a 404 and changes nothing', async () => {
        const mine = await createParis(ALICE)
        const theirs = await createParis(BOB)

        await expectAppError(
            service.updateLayout(ALICE, [
                { id: mine.id, x: 9, y: 9, w: 9, h: 9 },
                { id: theirs.id, x: 9, y: 9, w: 9, h: 9 },
            ]),
            404,
            'NOT_FOUND',
        )

        expect(repo.rows[0]).toMatchObject({ x: 0, y: 0, w: 4, h: 3 })
        expect(repo.rows[1]).toMatchObject({ x: 0, y: 0, w: 4, h: 3 })
    })

    test('an id that does not exist makes the whole update a 404', async () => {
        const mine = await createParis(ALICE)

        await expectAppError(
            service.updateLayout(ALICE, [
                { id: mine.id, x: 9, y: 9, w: 9, h: 9 },
                { id: crypto.randomUUID(), x: 1, y: 1, w: 1, h: 1 },
            ]),
            404,
            'NOT_FOUND',
        )

        expect(repo.rows[0]).toMatchObject({ x: 0, y: 0, w: 4, h: 3 })
    })

    test('rejects the same id twice', async () => {
        const mine = await createParis(ALICE)

        await expectAppError(
            service.updateLayout(ALICE, [
                { id: mine.id, x: 1, y: 1, w: 1, h: 1 },
                { id: mine.id, x: 2, y: 2, w: 2, h: 2 },
            ]),
            400,
            'DUPLICATE_ID',
        )

        expect(repo.rows[0]).toMatchObject({ x: 0, y: 0, w: 4, h: 3 })
    })
})
