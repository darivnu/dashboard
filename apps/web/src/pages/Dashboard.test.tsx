import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useDisconnectService } from '../components/dashboard/queries'
import { apiMock, fail, makeInstance, ok, resetApiMock } from '../test/apiMock'
import { renderHookWithQuery, renderWithQuery } from '../test/renderWithQuery'
import Dashboard from './Dashboard'

vi.mock('../api', async () => (await import('../test/apiMock')).apiModule)
vi.mock('../auth', () => ({
    useAuth: () => ({
        user: { id: 'u1', email: 'me@example.com', role: 'user' },
        logout: vi.fn(),
    }),
}))

type GridItem = { i: string; x: number; y: number; w: number; h: number }
type GridProps = {
    children: ReactNode
    layout: GridItem[]
    onDragStop: (layout: GridItem[]) => void
    onResizeStop: (layout: GridItem[]) => void
}

// The stand-in for the grid library used on wide screens (see
// WidgetGrid.test.tsx): it draws the cards and keeps the props it was given.
const grid = vi.hoisted(() => ({ props: null as GridProps | null }))

vi.mock('react-grid-layout', () => ({
    default: (props: GridProps) => {
        grid.props = props
        return <div>{props.children}</div>
    },
    useContainerWidth: () => ({
        width: 1200,
        mounted: true,
        containerRef: { current: null },
    }),
}))

// The top bar holds links and the page reads the address for the answer of an
// account connection (?connected= / ?oauth_error=), so it needs a router.
function renderDashboard() {
    return renderWithQuery(
        <MemoryRouter initialEntries={['/dashboard']}>
            <Dashboard />
        </MemoryRouter>,
    )
}

const services = [
    {
        id: 'mock',
        name: 'Mock',
        auth: { kind: 'none' },
        subscription: null,
        widgets: [
            {
                id: 'echo',
                name: 'Echo',
                description: 'Repeats a message',
                params: [
                    {
                        name: 'message',
                        label: 'Message',
                        type: 'string',
                        required: true,
                    },
                ],
                refresh: { default: 60, min: 5 },
            },
        ],
    },
]

function threeWidgets() {
    return [
        makeInstance({ title: 'A', x: 0, y: 0 }),
        makeInstance({ title: 'B', x: 4, y: 0 }),
        makeInstance({ title: 'C', x: 8, y: 0 }),
    ]
}

function titles() {
    return screen
        .getAllByRole('article')
        .map((card) => card.getAttribute('aria-label'))
}

function card(name: string) {
    return within(screen.getByRole('article', { name }))
}

// Each card has a <header> of its own. Inside an <article> a browser does not
// expose it as a banner, but Testing Library counts every <header>, so the
// ones of the cards are left out by hand.
function pageBanners() {
    return screen
        .getAllByRole('banner')
        .filter((header) => !header.closest('article'))
}

beforeEach(() => {
    resetApiMock()
    apiMock.catalog.mockResolvedValue(ok({ services }))
    apiMock.instanceData.mockResolvedValue(
        ok({
            ok: true,
            data: { message: 'hi' },
            fetchedAt: '2026-10-03T14:32:00.000Z',
        }),
    )
})

test('loads and shows the widgets of the user', async () => {
    apiMock.listInstances.mockResolvedValue(ok({ instances: threeWidgets() }))
    renderDashboard()

    expect(
        screen.getByRole('status', { name: 'Loading dashboard' }),
    ).toBeVisible()
    await screen.findByRole('article', { name: 'A' })
    expect(titles()).toEqual(['A', 'B', 'C'])
})

test('has one top bar with the app name, Add Widget and the account menu', async () => {
    apiMock.listInstances.mockResolvedValue(ok({ instances: threeWidgets() }))
    renderDashboard()
    await screen.findByRole('article', { name: 'A' })

    expect(pageBanners()).toHaveLength(1)
    const bar = within(pageBanners()[0])
    expect(bar.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    expect(bar.getByRole('button', { name: 'Add Widget' })).toBeVisible()
    expect(bar.getByRole('button', { name: 'Account menu' })).toBeVisible()
})

test('shows no logout button and no email outside the closed menu', async () => {
    apiMock.listInstances.mockResolvedValue(ok({ instances: threeWidgets() }))
    renderDashboard()
    await screen.findByRole('article', { name: 'A' })

    expect(
        screen.queryByRole('button', { name: /log ?out/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('me@example.com')).not.toBeInTheDocument()
})

test('keeps its title for screen readers only, outside the bar', async () => {
    apiMock.listInstances.mockResolvedValue(ok({ instances: threeWidgets() }))
    renderDashboard()

    const title = screen.getByRole('heading', { level: 1 })
    expect(title).toHaveTextContent('My Dashboard')
    expect(title).toHaveClass('sr-only')
    expect(screen.getByRole('main')).toContainElement(title)
})

test('says so when the list cannot be loaded, and can try again', async () => {
    apiMock.listInstances.mockRejectedValueOnce(new TypeError('x'))
    renderDashboard()

    expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't reach the dashboard server.",
    )
    apiMock.listInstances.mockResolvedValue(ok({ instances: threeWidgets() }))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('article', { name: 'A' })).toBeVisible()
})

test('moving a card reorders it at once and saves the new positions', async () => {
    const [a, b, c] = threeWidgets()
    apiMock.listInstances.mockResolvedValue(ok({ instances: [a, b, c] }))
    apiMock.saveLayout.mockResolvedValue(
        ok({ instances: [{ ...a, x: 4 }, { ...b, x: 0 }, c] }),
    )
    renderDashboard()
    await screen.findByRole('article', { name: 'A' })

    await userEvent.click(card('A').getByRole('button', { name: 'Move later' }))

    await waitFor(() => expect(titles()).toEqual(['B', 'A', 'C']))
    expect(apiMock.saveLayout).toHaveBeenCalledWith([
        { id: b.id, x: 0, y: 0, w: 4, h: 3 },
        { id: a.id, x: 4, y: 0, w: 4, h: 3 },
    ])
})

test('moving the first card earlier does nothing', async () => {
    apiMock.listInstances.mockResolvedValue(ok({ instances: threeWidgets() }))
    renderDashboard()
    await screen.findByRole('article', { name: 'A' })

    await userEvent.click(
        card('A').getByRole('button', { name: 'Move earlier' }),
    )
    expect(apiMock.saveLayout).not.toHaveBeenCalled()
    expect(titles()).toEqual(['A', 'B', 'C'])
})

test('a refused move puts the cards back and says so', async () => {
    apiMock.listInstances.mockResolvedValue(ok({ instances: threeWidgets() }))
    apiMock.saveLayout.mockResolvedValue(fail(400, 'VALIDATION', 'Bad layout'))
    renderDashboard()
    await screen.findByRole('article', { name: 'A' })

    await userEvent.click(card('A').getByRole('button', { name: 'Move later' }))

    expect(
        await screen.findByText(/The new layout couldn't be saved/),
    ).toBeVisible()
    expect(titles()).toEqual(['A', 'B', 'C'])
})

test('deleting asks first; Cancel keeps the widget', async () => {
    apiMock.listInstances.mockResolvedValue(ok({ instances: threeWidgets() }))
    renderDashboard()
    await screen.findByRole('article', { name: 'B' })

    await userEvent.click(card('B').getByRole('button', { name: 'Delete' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Delete widget' }))
    expect(dialog.getByText('Delete "B"? This cannot be undone.')).toBeVisible()
    expect(apiMock.deleteInstance).not.toHaveBeenCalled()

    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(titles()).toEqual(['A', 'B', 'C'])
    expect(apiMock.deleteInstance).not.toHaveBeenCalled()
})

test('confirming deletes the widget; cards beside it stay where they are', async () => {
    const [a, b, c] = threeWidgets()
    apiMock.listInstances.mockResolvedValue(ok({ instances: [a, b, c] }))
    apiMock.deleteInstance.mockResolvedValue(ok({ ok: true }))
    renderDashboard()
    await screen.findByRole('article', { name: 'B' })

    await userEvent.click(card('B').getByRole('button', { name: 'Delete' }))
    await userEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', {
            name: 'Delete',
        }),
    )

    await waitFor(() => expect(titles()).toEqual(['A', 'C']))
    expect(apiMock.instanceById).toHaveBeenCalledWith({ id: b.id })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(apiMock.saveLayout).not.toHaveBeenCalled()
})

test('deleting a widget lifts the cards under it, and only those', async () => {
    const [a, b, c] = threeWidgets()
    const under = makeInstance({ title: 'Under B', x: 4, y: 3 })
    apiMock.listInstances.mockResolvedValue(ok({ instances: [a, b, c, under] }))
    apiMock.deleteInstance.mockResolvedValue(ok({ ok: true }))
    apiMock.saveLayout.mockResolvedValue(
        ok({ instances: [a, c, { ...under, y: 0 }] }),
    )
    renderDashboard()
    await screen.findByRole('article', { name: 'B' })

    await userEvent.click(card('B').getByRole('button', { name: 'Delete' }))
    await userEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', {
            name: 'Delete',
        }),
    )

    await waitFor(() =>
        expect(apiMock.saveLayout).toHaveBeenCalledWith([
            { id: under.id, x: 4, y: 0, w: 4, h: 3 },
        ]),
    )
    expect(apiMock.saveLayout).toHaveBeenCalledTimes(1)
})

describe('on a wide screen', () => {
    beforeEach(() => {
        vi.stubGlobal(
            'matchMedia',
            vi.fn(() => ({
                matches: true,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            })),
        )
    })
    afterEach(() => vi.unstubAllGlobals())

    function swapped([a, b, c]: ReturnType<typeof threeWidgets>) {
        return [
            { i: a.id, x: 4, y: 0, w: 4, h: 3 },
            { i: b.id, x: 0, y: 0, w: 4, h: 3 },
            { i: c.id, x: 8, y: 0, w: 4, h: 3 },
        ]
    }

    test('loading the dashboard saves nothing', async () => {
        apiMock.listInstances.mockResolvedValue(
            ok({ instances: threeWidgets() }),
        )
        renderDashboard()
        await screen.findByRole('article', { name: 'A' })
        expect(apiMock.saveLayout).not.toHaveBeenCalled()
    })

    test('a drop sends one request with only the cards that moved', async () => {
        const widgets = threeWidgets()
        const [a, b, c] = widgets
        apiMock.listInstances.mockResolvedValue(ok({ instances: widgets }))
        apiMock.saveLayout.mockResolvedValue(
            ok({ instances: [{ ...a, x: 4 }, { ...b, x: 0 }, c] }),
        )
        renderDashboard()
        await screen.findByRole('article', { name: 'A' })

        act(() => grid.props?.onDragStop(swapped(widgets)))

        await waitFor(() =>
            expect(grid.props?.layout.map(({ i, x }) => [i, x])).toEqual([
                [a.id, 4],
                [b.id, 0],
                [c.id, 8],
            ]),
        )
        expect(apiMock.saveLayout).toHaveBeenCalledTimes(1)
        expect(apiMock.saveLayout).toHaveBeenCalledWith([
            { id: a.id, x: 4, y: 0, w: 4, h: 3 },
            { id: b.id, x: 0, y: 0, w: 4, h: 3 },
        ])
    })

    test('a resize sends one request with the new size', async () => {
        const widgets = threeWidgets()
        const [a, b, c] = widgets
        apiMock.listInstances.mockResolvedValue(ok({ instances: widgets }))
        apiMock.saveLayout.mockResolvedValue(
            ok({ instances: [{ ...a, h: 5 }, b, c] }),
        )
        renderDashboard()
        await screen.findByRole('article', { name: 'A' })

        act(() =>
            grid.props?.onResizeStop([
                { i: a.id, x: 0, y: 0, w: 4, h: 5 },
                { i: b.id, x: 4, y: 0, w: 4, h: 3 },
                { i: c.id, x: 8, y: 0, w: 4, h: 3 },
            ]),
        )

        await waitFor(() =>
            expect(apiMock.saveLayout).toHaveBeenCalledWith([
                { id: a.id, x: 0, y: 0, w: 4, h: 5 },
            ]),
        )
        expect(apiMock.saveLayout).toHaveBeenCalledTimes(1)
    })

    test('a refused drop puts the cards back and says so', async () => {
        const widgets = threeWidgets()
        const [a, b, c] = widgets
        apiMock.listInstances.mockResolvedValue(ok({ instances: widgets }))
        apiMock.saveLayout.mockResolvedValue(
            fail(400, 'VALIDATION', 'Bad layout'),
        )
        renderDashboard()
        await screen.findByRole('article', { name: 'A' })

        act(() => grid.props?.onDragStop(swapped(widgets)))

        expect(
            await screen.findByText(/The new layout couldn't be saved/),
        ).toBeVisible()
        // The stand-in keeps no positions of its own, so this shows that the
        // grid is handed the old layout again, not that the real one obeys.
        expect(grid.props?.layout.map(({ i, x }) => [i, x])).toEqual([
            [a.id, 0],
            [b.id, 4],
            [c.id, 8],
        ])
    })
})

test('a failed delete keeps the dialog open with the reason', async () => {
    apiMock.listInstances.mockResolvedValue(ok({ instances: threeWidgets() }))
    apiMock.deleteInstance.mockRejectedValue(new TypeError('x'))
    renderDashboard()
    await screen.findByRole('article', { name: 'B' })

    await userEvent.click(card('B').getByRole('button', { name: 'Delete' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Delete' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent(
        "Couldn't reach the dashboard server.",
    )
    expect(titles()).toEqual(['A', 'B', 'C'])
})

test('Edit opens the edit dialog for that widget', async () => {
    apiMock.listInstances.mockResolvedValue(ok({ instances: threeWidgets() }))
    renderDashboard()
    await screen.findByRole('article', { name: 'B' })

    await userEvent.click(card('B').getByRole('button', { name: 'Edit' }))
    const dialog = within(
        await screen.findByRole('dialog', { name: 'Edit widget' }),
    )
    expect(await dialog.findByRole('textbox', { name: 'Title' })).toHaveValue(
        'B',
    )
})

test('Add Widget opens the add dialog, and a created widget appears', async () => {
    const [a] = threeWidgets()
    apiMock.listInstances.mockResolvedValue(ok({ instances: [a] }))
    apiMock.createInstance.mockResolvedValue(
        ok(makeInstance({ title: 'New one', x: 0, y: 3 })),
    )
    renderDashboard()
    await screen.findByRole('article', { name: 'A' })

    await userEvent.click(screen.getByRole('button', { name: 'Add Widget' }))
    const dialog = within(
        await screen.findByRole('dialog', { name: 'Add widget' }),
    )
    await userEvent.click(await dialog.findByRole('button', { name: /Echo/ }))
    await userEvent.type(dialog.getByRole('textbox', { name: 'Message' }), 'hi')
    await userEvent.click(dialog.getByRole('button', { name: 'Add' }))

    expect(
        await screen.findByRole('article', { name: 'New one' }),
    ).toBeVisible()
    expect(apiMock.createInstance).toHaveBeenCalledWith(
        expect.objectContaining({ x: 0, y: 3, w: 4, h: 3 }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('API key on a card opens the key dialog for the service of that widget', async () => {
    apiMock.catalog.mockResolvedValue(
        ok({
            services: [
                ...services,
                {
                    id: 'nasa',
                    name: 'NASA',
                    auth: {
                        kind: 'apiKey',
                        fields: [
                            {
                                name: 'apiKey',
                                label: 'NASA API key',
                                type: 'string',
                                required: true,
                            },
                        ],
                    },
                    subscription: null,
                    widgets: [],
                },
            ],
        }),
    )
    apiMock.listInstances.mockResolvedValue(
        ok({
            instances: [
                makeInstance({ title: 'A' }),
                makeInstance({ title: 'Space', serviceId: 'nasa', x: 4 }),
            ],
        }),
    )
    apiMock.subscribe.mockResolvedValue(
        ok({ serviceId: 'nasa', status: 'active' }),
    )
    renderDashboard()
    await screen.findByRole('article', { name: 'Space' })

    expect(
        card('A').queryByRole('button', { name: 'API key' }),
    ).not.toBeInTheDocument()
    await userEvent.click(
        await card('Space').findByRole('button', { name: 'API key' }),
    )
    const dialog = within(
        await screen.findByRole('dialog', { name: 'API key' }),
    )
    expect(
        await dialog.findByText('This key is used by all your NASA widgets.'),
    ).toBeVisible()

    await userEvent.type(dialog.getByLabelText(/NASA API key/), 'my-key')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(apiMock.subscriptionByService).toHaveBeenCalledWith({
        service: 'nasa',
    })
    expect(apiMock.subscribe).toHaveBeenCalledWith({ apiKey: 'my-key' })
})

// The echo widget stands in for a widget of a service that needs credentials.
function credentialCatalog(auth: unknown, subscribed: boolean) {
    return ok({
        services: [
            {
                ...services[0],
                auth,
                subscription: subscribed ? { status: 'active' } : null,
            },
        ],
    })
}

test.each([
    [
        'an account',
        { kind: 'oauth2', provider: 'mock', available: true },
        'Connect your account to use this widget.',
        'Connect',
    ],
    [
        'a key',
        { kind: 'apiKey', fields: [] },
        'This service needs to be reconnected.',
        'Set API key',
    ],
])(
    'after disconnecting %s, its widgets ask for it again instead of showing their last data',
    async (_kind, auth, message, action) => {
        apiMock.catalog.mockResolvedValue(credentialCatalog(auth, true))
        apiMock.listInstances.mockResolvedValue(
            ok({ instances: [makeInstance({ title: 'A' })] }),
        )
        const { client } = renderDashboard()
        await screen.findByRole('article', { name: 'A' })
        expect(await card('A').findByText('hi')).toBeVisible()

        // What the server answers once the subscription is gone.
        apiMock.catalog.mockResolvedValue(credentialCatalog(auth, false))
        apiMock.instanceData.mockResolvedValue(
            ok({ ok: false, code: 'needs_reauth' }),
        )
        apiMock.unsubscribe.mockResolvedValue(ok({ ok: true }))
        const { result } = renderHookWithQuery(
            () => useDisconnectService(),
            client,
        )
        await act(() => result.current.mutateAsync('mock'))

        expect(await card('A').findByText(message)).toBeVisible()
        expect(
            within(card('A').getByRole('alert')).getByRole('button', {
                name: action,
            }),
        ).toBeVisible()
        expect(card('A').queryByText('hi')).not.toBeInTheDocument()
        expect(card('A').queryByText(/Refresh failed/)).not.toBeInTheDocument()
    },
)
