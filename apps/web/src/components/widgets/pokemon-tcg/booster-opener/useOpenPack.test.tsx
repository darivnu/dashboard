import { act, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { apiMock, fail, ok, resetApiMock } from '../../../../test/apiMock'
import { renderHookWithQuery } from '../../../../test/renderWithQuery'
import { useOpenPack } from './useOpenPack'

vi.mock(
    '../../../../api',
    async () => (await import('../../../../test/apiMock')).apiModule,
)

const card = {
    id: 'sv01-001',
    name: 'Pineco',
    rarity: 'Common',
    image: null,
    slot: 'common',
    kind: 'common',
    reverseHolo: false,
    pattern: null,
}

function packOf(...names: string[]) {
    return {
        set: { id: 'sv01', name: 'Scarlet & Violet' },
        booster: null,
        variant: null,
        cards: names.map((name) => ({ ...card, id: name, name })),
        extras: [],
    }
}

/** The API's 429, with the header saying how long to wait. */
function tooMany(retryAfter?: string) {
    return {
        ...fail(429, 'RATE_LIMITED', 'Too many requests, try again later'),
        response: new Response(null, {
            status: 429,
            headers: retryAfter ? { 'Retry-After': retryAfter } : {},
        }),
    }
}

beforeEach(() => {
    resetApiMock()
})

async function openWith(reply: unknown) {
    apiMock.runAction.mockResolvedValue(reply)
    const { result } = renderHookWithQuery(() => useOpenPack())
    act(() => result.current.open('sv01'))
    await waitFor(() => expect(result.current.isOpening).toBe(false))
    return result
}

describe('useOpenPack', () => {
    test('starts with no pack, no error and nothing in progress', () => {
        const { result } = renderHookWithQuery(() => useOpenPack())

        expect(result.current.pack).toBeNull()
        expect(result.current.error).toBeNull()
        expect(result.current.isOpening).toBe(false)
    })

    test('calls the open_pack action of pokemon_tcg with the collection', async () => {
        await openWith(ok({ ok: true, data: packOf('Pineco') }))

        expect(apiMock.actionTarget).toHaveBeenCalledWith({
            serviceId: 'pokemon_tcg',
            actionId: 'open_pack',
        })
        expect(apiMock.runAction).toHaveBeenCalledWith({
            params: { set: 'sv01' },
        })
    })

    test('sends the booster when one is chosen', async () => {
        apiMock.runAction.mockResolvedValue(
            ok({ ok: true, data: packOf('Mewtwo') }),
        )
        const { result } = renderHookWithQuery(() => useOpenPack())

        act(() => result.current.open('A1', 'boo_A1-mewtwo'))
        await waitFor(() => expect(result.current.pack).not.toBeNull())

        expect(apiMock.runAction).toHaveBeenCalledWith({
            params: { set: 'A1', booster: 'boo_A1-mewtwo' },
        })
    })

    test('gives the opened pack', async () => {
        const result = await openWith(
            ok({ ok: true, data: packOf('Pineco', 'Heracross') }),
        )

        expect(result.current.pack).toEqual(packOf('Pineco', 'Heracross'))
        expect(result.current.error).toBeNull()
    })

    test('is opening while the request is on its way', async () => {
        let answer: (value: unknown) => void = () => {}
        apiMock.runAction.mockReturnValue(
            new Promise((resolve) => {
                answer = resolve
            }),
        )
        const { result } = renderHookWithQuery(() => useOpenPack())

        act(() => result.current.open('sv01'))
        await waitFor(() => expect(result.current.isOpening).toBe(true))

        act(() => answer(ok({ ok: true, data: packOf('Pineco') })))
        await waitFor(() => expect(result.current.isOpening).toBe(false))
    })

    test.each([
        ['30', 'Too many packs, try again in 30 seconds'],
        ['1', 'Too many packs, try again in 1 second'],
        [undefined, 'Too many packs, try again in a moment'],
        ['soon', 'Too many packs, try again in a moment'],
    ])('a 429 with Retry-After %j says "%s"', async (retryAfter, message) => {
        const result = await openWith(tooMany(retryAfter))

        expect(result.current.error).toBe(message)
    })

    test('an upstream rate limit says the card database is busy', async () => {
        const result = await openWith(ok({ ok: false, code: 'rate_limited' }))

        expect(result.current.error).toBe(
            'The card database is busy, try again in a moment',
        )
    })

    test.each([
        ['an upstream error', ok({ ok: false, code: 'upstream_error' })],
        ['invalid params', fail(400, 'INVALID_PARAMS', 'unknown collection')],
        ['a signed-out user', fail(401, 'UNAUTHORIZED', 'Sign in first')],
        ['a pack the widget cannot read', ok({ ok: true, data: { cards: 3 } })],
        ['an empty answer', { data: null, error: null, status: 200 }],
    ])('%s says the pack could not be opened', async (_label, reply) => {
        const result = await openWith(reply)

        expect(result.current.error).toBe('Could not open the pack')
        expect(result.current.pack).toBeNull()
    })

    test('a request that never reaches the server says the same', async () => {
        apiMock.runAction.mockRejectedValue(new TypeError('Failed to fetch'))
        const { result } = renderHookWithQuery(() => useOpenPack())

        act(() => result.current.open('sv01'))

        await waitFor(() =>
            expect(result.current.error).toBe('Could not open the pack'),
        )
    })

    test('keeps the previous pack when the next one is refused', async () => {
        const result = await openWith(ok({ ok: true, data: packOf('Pineco') }))

        apiMock.runAction.mockResolvedValue(tooMany('12'))
        act(() => result.current.open('sv01'))
        await waitFor(() => expect(result.current.error).not.toBeNull())

        expect(result.current.pack).toEqual(packOf('Pineco'))
        expect(result.current.error).toBe(
            'Too many packs, try again in 12 seconds',
        )
    })

    test('a pack that opens clears the previous error and replaces the pack', async () => {
        const result = await openWith(tooMany('5'))

        apiMock.runAction.mockResolvedValue(
            ok({ ok: true, data: packOf('Heracross') }),
        )
        act(() => result.current.open('sv01'))
        await waitFor(() => expect(result.current.pack).not.toBeNull())

        expect(result.current.pack).toEqual(packOf('Heracross'))
        expect(result.current.error).toBeNull()
    })

    test('clear forgets the pack and the error', async () => {
        const result = await openWith(ok({ ok: true, data: packOf('Pineco') }))
        apiMock.runAction.mockResolvedValue(tooMany('5'))
        act(() => result.current.open('sv01'))
        await waitFor(() => expect(result.current.error).not.toBeNull())

        act(() => result.current.clear())

        await waitFor(() => expect(result.current.pack).toBeNull())
        expect(result.current.error).toBeNull()
    })
})
