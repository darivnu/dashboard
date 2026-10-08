import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../components/dashboard/queries'
import { apiMock, fail, makeInstance, ok, resetApiMock } from '../test/apiMock'
import { renderWithQuery } from '../test/renderWithQuery'
import Profile from './Profile'

const createdAt = new Date('2026-09-15T10:00:00Z')

// A stable mock across renders, so a test can script deleteAccount and assert
// on it. vi.hoisted makes it exist before the hoisted vi.mock factory runs.
const { deleteAccountMock } = vi.hoisted(() => ({ deleteAccountMock: vi.fn() }))

vi.mock('../api', async () => (await import('../test/apiMock')).apiModule)
vi.mock('../auth', () => ({
    useAuth: () => ({
        user: { id: 'u1', email: 'me@example.com', role: 'user', createdAt },
        logout: vi.fn(),
        deleteAccount: deleteAccountMock,
    }),
}))

type Status = 'active' | 'needs_reauth' | 'revoked'

function subscriptionOf(status: Status | null) {
    return status ? { status } : null
}

function keyService(status: Status | null = null, overrides = {}) {
    return {
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
        subscription: subscriptionOf(status),
        widgets: [],
        ...overrides,
    }
}

function oauthService(status: Status | null = null, available = true) {
    return {
        id: 'github',
        name: 'GitHub',
        auth: { kind: 'oauth2', provider: 'github', available },
        subscription: subscriptionOf(status),
        widgets: [],
    }
}

const openService = {
    id: 'mock',
    name: 'Mock',
    auth: { kind: 'none' },
    subscription: null,
    widgets: [],
}

function serveCatalog(...services: unknown[]) {
    apiMock.catalog.mockResolvedValue(ok({ services }))
}

// The top bar holds links, so the page needs a router.
function renderProfile() {
    return renderWithQuery(
        <MemoryRouter initialEntries={['/profile']}>
            <Profile />
        </MemoryRouter>,
    )
}

function section(name: string) {
    return within(screen.getByRole('region', { name }))
}

/** The row of one service, once the catalog has loaded. */
async function row(name: string) {
    const title = await section('Services').findByText(name)
    const item = title.closest('li')
    if (!item) throw new Error(`${name} is not in a row`)
    return within(item)
}

function buttonNames(scope: ReturnType<typeof within>) {
    return scope
        .queryAllByRole('button')
        .map((button: HTMLElement) => button.getAttribute('aria-label'))
}

beforeEach(() => {
    resetApiMock()
    deleteAccountMock.mockReset()
    deleteAccountMock.mockResolvedValue(undefined)
    serveCatalog(openService, keyService(), oauthService())
    apiMock.listInstances.mockResolvedValue(ok({ instances: [] }))
})

describe('the page', () => {
    test('is inside the shared top bar, without a page action', () => {
        renderProfile()

        const bar = within(screen.getByRole('banner'))
        expect(bar.getByRole('link', { name: 'Dashboard' })).toBeVisible()
        expect(
            bar.getAllByRole('button').map((b) => b.getAttribute('aria-label')),
        ).toEqual(['Account menu'])
        expect(screen.getByRole('main')).toContainElement(
            screen.getByRole('heading', { level: 1, name: 'Profile' }),
        )
    })

    test('has the two sections, Services last', () => {
        renderProfile()

        expect(
            screen
                .getAllByRole('heading', { level: 2 })
                .map((h) => h.textContent),
        ).toEqual(['Account', 'Services'])
        const services = screen.getByRole('region', { name: 'Services' })
        expect(services.parentElement?.lastElementChild).toBe(services)
    })
})

describe('Account', () => {
    test('shows the email and the date the account was created, day first', () => {
        renderProfile()

        expect(section('Account').getByText('me@example.com')).toBeVisible()
        expect(
            section('Account').getByText('Member since 15/09/2026'),
        ).toBeVisible()
    })
})

describe('Account: deleting the account', () => {
    // The trigger lives in the Account section; the confirmation dialog is
    // rendered apart, so this only ever finds the trigger.
    function deleteButton() {
        return section('Account').getByRole('button', {
            name: 'Delete account',
        })
    }

    async function askToDelete() {
        await userEvent.click(deleteButton())
        return within(screen.getByRole('dialog'))
    }

    test('the Account section has a Delete account button', () => {
        renderProfile()

        expect(deleteButton()).toBeVisible()
    })

    test('clicking it asks for confirmation, warning it cannot be undone', async () => {
        renderProfile()

        const dialog = await askToDelete()

        expect(
            screen.getByRole('dialog', { name: 'Delete account' }),
        ).toBeVisible()
        expect(dialog.getByText(/cannot be undone/i)).toBeVisible()
        expect(deleteAccountMock).not.toHaveBeenCalled()
    })

    test('Cancel closes the dialog and deletes nothing', async () => {
        renderProfile()
        const dialog = await askToDelete()

        await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(deleteAccountMock).not.toHaveBeenCalled()
    })

    test('confirming calls deleteAccount once', async () => {
        renderProfile()
        const dialog = await askToDelete()

        await userEvent.click(
            dialog.getByRole('button', { name: 'Delete account' }),
        )

        await waitFor(() => expect(deleteAccountMock).toHaveBeenCalledTimes(1))
    })

    test('the confirm button is disabled while the request runs', async () => {
        let respond: () => void = () => {}
        deleteAccountMock.mockReturnValue(
            new Promise<void>((resolve) => {
                respond = resolve
            }),
        )
        renderProfile()
        const dialog = await askToDelete()

        await userEvent.click(
            dialog.getByRole('button', { name: 'Delete account' }),
        )

        expect(
            dialog.getByRole('button', { name: 'Delete account' }),
        ).toBeDisabled()
        expect(screen.getByRole('dialog')).toBeVisible()

        respond()
    })

    test('a refusal keeps the dialog open with the reason', async () => {
        deleteAccountMock.mockRejectedValue(
            new ApiError(500, 'INTERNAL', 'Something went wrong.'),
        )
        renderProfile()
        const dialog = await askToDelete()

        await userEvent.click(
            dialog.getByRole('button', { name: 'Delete account' }),
        )

        expect(await dialog.findByRole('alert')).toHaveTextContent(
            'Something went wrong.',
        )
        expect(
            screen.getByRole('dialog', { name: 'Delete account' }),
        ).toBeVisible()
        expect(
            dialog.getByRole('button', { name: 'Delete account' }),
        ).toBeEnabled()
    })

    test('a network failure keeps the dialog open and says the server was not reached', async () => {
        deleteAccountMock.mockRejectedValue(new TypeError('Failed to fetch'))
        renderProfile()
        const dialog = await askToDelete()

        await userEvent.click(
            dialog.getByRole('button', { name: 'Delete account' }),
        )

        expect(await dialog.findByRole('alert')).toHaveTextContent(
            "Couldn't reach the dashboard server.",
        )
    })
})

describe('Services: which ones are listed', () => {
    test('lists the services that need a key or an account, in catalog order', async () => {
        serveCatalog(
            oauthService(),
            openService,
            keyService(),
            keyService(null, { id: 'stocks', name: 'Stocks' }),
        )
        renderProfile()

        await row('GitHub')
        expect(
            section('Services')
                .getAllByRole('listitem')
                .map((item) => within(item).getByRole('heading').textContent),
        ).toEqual(['GitHub', 'NASA', 'Stocks'])
    })

    test('leaves out a service that needs neither', async () => {
        renderProfile()

        await row('NASA')
        expect(section('Services').queryByText('Mock')).not.toBeInTheDocument()
    })

    test('says so when no service needs credentials', async () => {
        serveCatalog(openService)
        renderProfile()

        expect(
            await section('Services').findByText(
                'No service needs an account or a key.',
            ),
        ).toBeVisible()
        expect(
            section('Services').queryByRole('listitem'),
        ).not.toBeInTheDocument()
    })

    test('shows a spinner while the catalog loads', () => {
        apiMock.catalog.mockReturnValue(new Promise(() => {}))
        renderProfile()

        expect(section('Services').getByRole('status')).toBeVisible()
    })

    test('says so when the catalog cannot be loaded, and can try again', async () => {
        apiMock.catalog.mockRejectedValueOnce(new TypeError('x'))
        renderProfile()

        expect(await section('Services').findByRole('alert')).toHaveTextContent(
            "Couldn't reach the dashboard server.",
        )
        serveCatalog(keyService())
        await userEvent.click(
            section('Services').getByRole('button', { name: 'Try again' }),
        )
        expect(await row('NASA')).toBeTruthy()
    })
})

describe('Services: status and actions of a row', () => {
    test.each([
        [null, 'No key', ['Set key for NASA']],
        ['active', 'Key set', ['Replace key for NASA', 'Remove key for NASA']],
        [
            'needs_reauth',
            'Key rejected',
            ['Replace key for NASA', 'Remove key for NASA'],
        ],
        [
            'revoked',
            'Key rejected',
            ['Replace key for NASA', 'Remove key for NASA'],
        ],
    ] as const)(
        'an API key service with a %s subscription',
        async (status, label, actions) => {
            serveCatalog(keyService(status))
            renderProfile()

            const nasa = await row('NASA')
            expect(nasa.getByText(label)).toBeVisible()
            expect(buttonNames(nasa)).toEqual(actions)
        },
    )

    test.each([
        [null, 'Not connected', ['Connect GitHub']],
        ['active', 'Connected', ['Reconnect GitHub', 'Disconnect GitHub']],
        [
            'needs_reauth',
            'Needs reconnecting',
            ['Reconnect GitHub', 'Disconnect GitHub'],
        ],
        [
            'revoked',
            'Needs reconnecting',
            ['Reconnect GitHub', 'Disconnect GitHub'],
        ],
    ] as const)(
        'an account service with a %s subscription',
        async (status, label, actions) => {
            serveCatalog(oauthService(status))
            renderProfile()

            const github = await row('GitHub')
            expect(github.getByText(label)).toBeVisible()
            expect(buttonNames(github)).toEqual(actions)
        },
    )

    test('the buttons show a short text and carry the service in their name', async () => {
        serveCatalog(keyService('active'), oauthService('active'))
        renderProfile()

        const nasa = await row('NASA')
        expect(
            nasa.getByRole('button', { name: 'Replace key for NASA' }),
        ).toHaveTextContent(/^Replace key$/)
        expect(
            nasa.getByRole('button', { name: 'Remove key for NASA' }),
        ).toHaveTextContent(/^Remove key$/)
        const github = await row('GitHub')
        expect(
            github.getByRole('button', { name: 'Reconnect GitHub' }),
        ).toHaveTextContent(/^Reconnect$/)
        expect(
            github.getByRole('button', { name: 'Disconnect GitHub' }),
        ).toHaveTextContent(/^Disconnect$/)
    })
})

describe('Services: connecting an account', () => {
    test('a provider the server is not set up for cannot be connected, and says why', async () => {
        serveCatalog(oauthService(null, false))
        renderProfile()

        const connect = (await row('GitHub')).getByRole('button', {
            name: 'Connect GitHub',
        })
        expect(connect).toBeDisabled()
        expect(connect.parentElement).toHaveAttribute(
            'title',
            "Connecting this service isn't set up on the server yet.",
        )
    })

    test('with such a provider, Reconnect is disabled but Disconnect is not', async () => {
        serveCatalog(oauthService('active', false))
        renderProfile()

        const github = await row('GitHub')
        expect(
            github.getByRole('button', { name: 'Reconnect GitHub' }),
        ).toBeDisabled()
        expect(
            github.getByRole('button', { name: 'Disconnect GitHub' }),
        ).toBeEnabled()
    })

    test('with such a provider, Disconnect still goes through', async () => {
        serveCatalog(oauthService('active', false))
        apiMock.unsubscribe.mockImplementation(async () => {
            serveCatalog(oauthService(null, false))
            return ok({ ok: true })
        })
        renderProfile()
        await userEvent.click(
            (await row('GitHub')).getByRole('button', {
                name: 'Disconnect GitHub',
            }),
        )

        await userEvent.click(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Disconnect',
            }),
        )

        expect(
            await (await row('GitHub')).findByText('Not connected'),
        ).toBeVisible()
        expect(apiMock.subscriptionByService).toHaveBeenCalledWith({
            service: 'github',
        })
    })

    test('an available provider can be connected', async () => {
        renderProfile()

        expect(
            (await row('GitHub')).getByRole('button', {
                name: 'Connect GitHub',
            }),
        ).toBeEnabled()
    })
})

describe('Services: setting a key', () => {
    test('Set key opens the key dialog of that service', async () => {
        renderProfile()

        await userEvent.click(
            (await row('NASA')).getByRole('button', {
                name: 'Set key for NASA',
            }),
        )

        const dialog = within(
            await screen.findByRole('dialog', { name: 'API key' }),
        )
        expect(
            await dialog.findByText(
                'This key is used by all your NASA widgets.',
            ),
        ).toBeVisible()
        expect(dialog.getByText('No key is set yet.')).toBeVisible()
    })

    test('a saved key closes the dialog and the row says "Key set" without a reload', async () => {
        apiMock.subscribe.mockImplementation(async () => {
            serveCatalog(openService, keyService('active'), oauthService())
            return ok({ serviceId: 'nasa', status: 'active' })
        })
        renderProfile()
        await userEvent.click(
            (await row('NASA')).getByRole('button', {
                name: 'Set key for NASA',
            }),
        )
        const dialog = within(await screen.findByRole('dialog'))

        await userEvent.type(
            await dialog.findByLabelText(/NASA API key/),
            'my-key',
        )
        await userEvent.click(dialog.getByRole('button', { name: 'Save' }))

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        )
        expect(apiMock.subscriptionByService).toHaveBeenCalledWith({
            service: 'nasa',
        })
        expect(apiMock.subscribe).toHaveBeenCalledWith({ apiKey: 'my-key' })
        expect(await (await row('NASA')).findByText('Key set')).toBeVisible()
        expect(buttonNames(await row('NASA'))).toEqual([
            'Replace key for NASA',
            'Remove key for NASA',
        ])
    })

    test('Replace key opens the same dialog, saying a key is already set', async () => {
        serveCatalog(keyService('active'))
        renderProfile()

        await userEvent.click(
            (await row('NASA')).getByRole('button', {
                name: 'Replace key for NASA',
            }),
        )

        expect(
            await within(await screen.findByRole('dialog')).findByText(
                'A key is already set. Saving a new one replaces it.',
            ),
        ).toBeVisible()
    })

    test('closing the key dialog without saving changes nothing', async () => {
        renderProfile()
        await userEvent.click(
            (await row('NASA')).getByRole('button', {
                name: 'Set key for NASA',
            }),
        )
        const dialog = within(await screen.findByRole('dialog'))

        await userEvent.click(
            await dialog.findByRole('button', { name: 'Cancel' }),
        )

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(apiMock.subscribe).not.toHaveBeenCalled()
        expect((await row('NASA')).getByText('No key')).toBeVisible()
    })
})

function githubWidgets(count: number) {
    return Array.from({ length: count }, () =>
        makeInstance({ serviceId: 'github', widgetId: 'notifications' }),
    )
}

async function askToDisconnect(service = 'GitHub') {
    const name =
        service === 'GitHub' ? 'Disconnect GitHub' : `Remove key for ${service}`
    await userEvent.click((await row(service)).getByRole('button', { name }))
    return within(screen.getByRole('dialog'))
}

describe('Services: the confirmation', () => {
    beforeEach(() => {
        serveCatalog(openService, keyService('active'), oauthService('active'))
    })

    test('Disconnect asks first, naming the service', async () => {
        renderProfile()

        await askToDisconnect()

        expect(
            screen.getByRole('dialog', { name: 'Disconnect GitHub' }),
        ).toBeVisible()
        expect(apiMock.unsubscribe).not.toHaveBeenCalled()
    })

    test('Remove key asks first, naming the service', async () => {
        renderProfile()

        const dialog = await askToDisconnect('NASA')

        expect(
            screen.getByRole('dialog', { name: 'Remove NASA key' }),
        ).toBeVisible()
        expect(dialog.getByRole('button', { name: 'Remove key' })).toBeVisible()
        expect(apiMock.unsubscribe).not.toHaveBeenCalled()
    })

    test.each([
        [
            2,
            'Your 2 GitHub widgets will stop updating until you reconnect. The widgets themselves are kept.',
        ],
        [
            1,
            'Your 1 GitHub widget will stop updating until you reconnect. The widget itself is kept.',
        ],
        [
            0,
            'GitHub will be disconnected. You can connect it again at any time.',
        ],
    ])(
        'with %i widgets of the service, the message says so',
        async (count, message) => {
            apiMock.listInstances.mockResolvedValue(
                ok({
                    instances: [
                        ...githubWidgets(count),
                        makeInstance({ serviceId: 'nasa' }),
                    ],
                }),
            )
            const { client } = renderProfile()
            await waitFor(() =>
                expect(client.getQueryState(['instances'])?.status).toBe(
                    'success',
                ),
            )

            const dialog = await askToDisconnect()

            expect(dialog.getByText(message)).toBeVisible()
        },
    )

    test.each([
        [
            2,
            'Your 2 NASA widgets will stop updating until you set a new key. The widgets themselves are kept.',
        ],
        [
            1,
            'Your 1 NASA widget will stop updating until you set a new key. The widget itself is kept.',
        ],
        [0, 'The NASA key will be removed. You can set a new one at any time.'],
    ])(
        'with %i widgets of a key service, the message says so',
        async (count, message) => {
            apiMock.listInstances.mockResolvedValue(
                ok({
                    instances: [
                        ...Array.from({ length: count }, () =>
                            makeInstance({ serviceId: 'nasa' }),
                        ),
                        ...githubWidgets(3),
                    ],
                }),
            )
            const { client } = renderProfile()
            await waitFor(() =>
                expect(client.getQueryState(['instances'])?.status).toBe(
                    'success',
                ),
            )

            const dialog = await askToDisconnect('NASA')

            expect(dialog.getByText(message)).toBeVisible()
        },
    )

    test('while the widgets are still loading, the dialog opens without a count', async () => {
        apiMock.listInstances.mockReturnValue(new Promise(() => {}))
        renderProfile()

        const dialog = await askToDisconnect()

        expect(
            dialog.getByText(
                'GitHub will be disconnected. You can connect it again at any time.',
            ),
        ).toBeVisible()
        expect(dialog.getByRole('button', { name: 'Disconnect' })).toBeEnabled()
    })

    test('when the widgets cannot be loaded, the dialog opens without a count', async () => {
        apiMock.listInstances.mockRejectedValue(new TypeError('x'))
        const { client } = renderProfile()
        await waitFor(() =>
            expect(client.getQueryState(['instances'])?.status).toBe('error'),
        )

        const dialog = await askToDisconnect()

        expect(
            dialog.getByText(
                'GitHub will be disconnected. You can connect it again at any time.',
            ),
        ).toBeVisible()
        expect(dialog.queryByRole('alert')).not.toBeInTheDocument()
        expect(dialog.getByRole('button', { name: 'Disconnect' })).toBeEnabled()
    })

    test('Cancel closes the dialog and disconnects nothing', async () => {
        renderProfile()
        const dialog = await askToDisconnect()

        await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(apiMock.unsubscribe).not.toHaveBeenCalled()
        expect((await row('GitHub')).getByText('Connected')).toBeVisible()
    })
})

describe('Services: disconnecting', () => {
    beforeEach(() => {
        serveCatalog(openService, keyService('active'), oauthService('active'))
    })

    test('confirming disconnects that service; the row then says "Not connected"', async () => {
        apiMock.unsubscribe.mockImplementation(async () => {
            serveCatalog(openService, keyService('active'), oauthService())
            return ok({ ok: true })
        })
        renderProfile()
        const dialog = await askToDisconnect()

        await userEvent.click(
            dialog.getByRole('button', { name: 'Disconnect' }),
        )

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        )
        expect(apiMock.subscriptionByService).toHaveBeenCalledWith({
            service: 'github',
        })
        expect(apiMock.unsubscribe).toHaveBeenCalledTimes(1)
        expect(
            await (await row('GitHub')).findByText('Not connected'),
        ).toBeVisible()
        expect(buttonNames(await row('GitHub'))).toEqual(['Connect GitHub'])
        // The other service is untouched.
        expect((await row('NASA')).getByText('Key set')).toBeVisible()
    })

    test('confirming removes the key; the row then says "No key"', async () => {
        apiMock.unsubscribe.mockImplementation(async () => {
            serveCatalog(openService, keyService(), oauthService('active'))
            return ok({ ok: true })
        })
        renderProfile()
        const dialog = await askToDisconnect('NASA')

        await userEvent.click(
            dialog.getByRole('button', { name: 'Remove key' }),
        )

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        )
        expect(apiMock.subscriptionByService).toHaveBeenCalledWith({
            service: 'nasa',
        })
        expect(await (await row('NASA')).findByText('No key')).toBeVisible()
        expect(buttonNames(await row('NASA'))).toEqual(['Set key for NASA'])
    })

    test('the widgets of the service lose their cached data, the widgets stay', async () => {
        const [first, second] = githubWidgets(2)
        const other = makeInstance({ serviceId: 'nasa' })
        apiMock.listInstances.mockResolvedValue(
            ok({ instances: [first, second, other] }),
        )
        apiMock.unsubscribe.mockResolvedValue(ok({ ok: true }))
        const { client } = renderProfile()
        await waitFor(() =>
            expect(client.getQueryState(['instances'])?.status).toBe('success'),
        )
        for (const instance of [first, second, other]) {
            client.setQueryData(['widget-data', instance.id], { some: 'data' })
        }
        const dialog = await askToDisconnect()

        await userEvent.click(
            dialog.getByRole('button', { name: 'Disconnect' }),
        )
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        )

        expect(client.getQueryData(['widget-data', first.id])).toBeUndefined()
        expect(client.getQueryData(['widget-data', second.id])).toBeUndefined()
        expect(client.getQueryData(['widget-data', other.id])).toEqual({
            some: 'data',
        })
        expect(client.getQueryData(['instances'])).toHaveLength(3)
        expect(apiMock.deleteInstance).not.toHaveBeenCalled()
    })

    test('the confirm button is disabled while the request runs', async () => {
        let respond: (value: unknown) => void = () => {}
        apiMock.unsubscribe.mockReturnValue(
            new Promise((resolve) => {
                respond = resolve
            }),
        )
        renderProfile()
        const dialog = await askToDisconnect()

        await userEvent.click(
            dialog.getByRole('button', { name: 'Disconnect' }),
        )

        expect(
            dialog.getByRole('button', { name: 'Disconnect' }),
        ).toBeDisabled()
        expect(screen.getByRole('dialog')).toBeVisible()

        respond(ok({ ok: true }))
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        )
        expect(apiMock.unsubscribe).toHaveBeenCalledTimes(1)
    })

    test('a 404 closes the dialog and refreshes the row like a success', async () => {
        apiMock.unsubscribe.mockImplementation(async () => {
            serveCatalog(openService, keyService('active'), oauthService())
            return fail(404, 'NOT_FOUND', 'This subscription does not exist.')
        })
        renderProfile()
        const dialog = await askToDisconnect()

        await userEvent.click(
            dialog.getByRole('button', { name: 'Disconnect' }),
        )

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        )
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(
            await (await row('GitHub')).findByText('Not connected'),
        ).toBeVisible()
    })

    test('a refusal keeps the dialog open with the reason', async () => {
        apiMock.unsubscribe.mockResolvedValue(
            fail(500, 'INTERNAL', 'Something went wrong.'),
        )
        renderProfile()
        const dialog = await askToDisconnect()

        await userEvent.click(
            dialog.getByRole('button', { name: 'Disconnect' }),
        )

        expect(await dialog.findByRole('alert')).toHaveTextContent(
            'Something went wrong.',
        )
        expect(
            screen.getByRole('dialog', { name: 'Disconnect GitHub' }),
        ).toBeVisible()
        expect(dialog.getByRole('button', { name: 'Disconnect' })).toBeEnabled()
        expect((await row('GitHub')).getByText('Connected')).toBeVisible()
    })

    test('a network failure keeps the dialog open and says the server was not reached', async () => {
        apiMock.unsubscribe.mockRejectedValue(new TypeError('Failed to fetch'))
        renderProfile()
        const dialog = await askToDisconnect()

        await userEvent.click(
            dialog.getByRole('button', { name: 'Disconnect' }),
        )

        expect(await dialog.findByRole('alert')).toHaveTextContent(
            "Couldn't reach the dashboard server.",
        )
    })

    test('after a failure, trying again can succeed', async () => {
        apiMock.unsubscribe
            .mockResolvedValueOnce(
                fail(500, 'INTERNAL', 'Something went wrong.'),
            )
            .mockResolvedValue(ok({ ok: true }))
        renderProfile()
        const dialog = await askToDisconnect()
        await userEvent.click(
            dialog.getByRole('button', { name: 'Disconnect' }),
        )
        await dialog.findByRole('alert')

        await userEvent.click(
            dialog.getByRole('button', { name: 'Disconnect' }),
        )

        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        )
        expect(apiMock.unsubscribe).toHaveBeenCalledTimes(2)
    })

    test('an error does not follow the user into the next confirmation', async () => {
        apiMock.unsubscribe.mockResolvedValue(
            fail(500, 'INTERNAL', 'Something went wrong.'),
        )
        renderProfile()
        const first = await askToDisconnect()
        await userEvent.click(first.getByRole('button', { name: 'Disconnect' }))
        await first.findByRole('alert')
        await userEvent.click(first.getByRole('button', { name: 'Cancel' }))

        const second = await askToDisconnect('NASA')

        expect(second.queryByRole('alert')).not.toBeInTheDocument()
        expect(second.getByRole('button', { name: 'Remove key' })).toBeEnabled()
    })
})

describe('Services: where the keyboard focus goes', () => {
    test('after a disconnect it lands on the Connect button of that row', async () => {
        serveCatalog(openService, keyService('active'), oauthService('active'))
        apiMock.unsubscribe.mockImplementation(async () => {
            serveCatalog(openService, keyService('active'), oauthService())
            return ok({ ok: true })
        })
        renderProfile()
        const dialog = await askToDisconnect()

        await userEvent.click(
            dialog.getByRole('button', { name: 'Disconnect' }),
        )

        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Connect GitHub' }),
            ).toHaveFocus(),
        )
    })

    test('after removing a key it lands on the Set key button of that row', async () => {
        serveCatalog(openService, keyService('active'), oauthService('active'))
        apiMock.unsubscribe.mockImplementation(async () => {
            serveCatalog(openService, keyService(), oauthService('active'))
            return ok({ ok: true })
        })
        renderProfile()
        const dialog = await askToDisconnect('NASA')

        await userEvent.click(
            dialog.getByRole('button', { name: 'Remove key' }),
        )

        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Set key for NASA' }),
            ).toHaveFocus(),
        )
    })

    test('the dialog stays busy until the row is up to date', async () => {
        serveCatalog(oauthService('active'))
        let deliver: (value: unknown) => void = () => {}
        apiMock.unsubscribe.mockImplementation(async () => {
            apiMock.catalog.mockReturnValue(
                new Promise((resolve) => {
                    deliver = resolve
                }),
            )
            return ok({ ok: true })
        })
        renderProfile()
        const dialog = await askToDisconnect()

        await userEvent.click(
            dialog.getByRole('button', { name: 'Disconnect' }),
        )
        await waitFor(() => expect(apiMock.catalog).toHaveBeenCalledTimes(2))

        // Disconnected on the server, but the row behind still says Connected.
        expect(screen.getByRole('dialog')).toBeVisible()
        expect(
            dialog.getByRole('button', { name: 'Disconnect' }),
        ).toBeDisabled()

        deliver(ok({ services: [oauthService()] }))
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        )
        expect((await row('GitHub')).getByText('Not connected')).toBeVisible()
    })
})
