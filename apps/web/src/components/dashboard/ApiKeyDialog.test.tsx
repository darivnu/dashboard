import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import {
    apiMock,
    fail,
    makeInstance,
    ok,
    resetApiMock,
} from '../../test/apiMock'
import { renderWithQuery } from '../../test/renderWithQuery'
import ApiKeyDialog from './ApiKeyDialog'
import { queryKeys } from './queries'

vi.mock('../../api', async () => (await import('../../test/apiMock')).apiModule)

function makeServices(subscription: { status: string } | null = null) {
    return [
        {
            id: 'mock',
            name: 'Mock',
            auth: { kind: 'none' },
            subscription: null,
            widgets: [],
        },
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
            subscription,
            widgets: [],
        },
    ]
}

const keyField = () => screen.getByLabelText(/NASA API key/)

function setup(
    instance: ReturnType<typeof makeInstance> | null,
    instances: ReturnType<typeof makeInstance>[] = instance ? [instance] : [],
) {
    const onClose = vi.fn()
    const view = renderWithQuery(
        <ApiKeyDialog instance={instance} onClose={onClose} />,
    )
    view.client.setQueryData(queryKeys.instances, instances)
    return { onClose, user: userEvent.setup(), ...view }
}

function nasaWidget(overrides: Record<string, unknown> = {}) {
    return makeInstance({ serviceId: 'nasa', widgetId: 'apod', ...overrides })
}

beforeEach(() => {
    resetApiMock()
    apiMock.catalog.mockResolvedValue(ok({ services: makeServices() }))
})

test('stays closed while there is no widget', () => {
    setup(null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(apiMock.catalog).not.toHaveBeenCalled()
})

test('asks for the fields of the service, hidden as typed', async () => {
    setup(nasaWidget())

    expect(await screen.findByRole('dialog', { name: 'API key' })).toBeVisible()
    expect(
        await screen.findByText('This key is used by all your NASA widgets.'),
    ).toBeVisible()
    expect(screen.getByText('No key is set yet.')).toBeVisible()
    expect(keyField()).toHaveAttribute('type', 'password')
    expect(keyField()).toHaveValue('')
})

test.each([
    ['active', 'A key is already set. Saving a new one replaces it.'],
    ['needs_reauth', 'The saved key was rejected. Enter a new one.'],
])('a %s subscription says so', async (status, message) => {
    apiMock.catalog.mockResolvedValue(
        ok({ services: makeServices({ status }) }),
    )
    setup(nasaWidget())
    expect(await screen.findByText(message)).toBeVisible()
})

test('saves the key for the service and closes', async () => {
    apiMock.subscribe.mockResolvedValue(
        ok({ serviceId: 'nasa', status: 'active' }),
    )
    const { user, onClose } = setup(nasaWidget())

    await user.type(await screen.findByLabelText(/NASA API key/), ' my-key ')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(apiMock.subscriptionByService).toHaveBeenCalledWith({
        service: 'nasa',
    })
    expect(apiMock.subscribe).toHaveBeenCalledWith({ apiKey: 'my-key' })
})

test('after saving, every widget of the service fetches its data again', async () => {
    apiMock.subscribe.mockResolvedValue(
        ok({ serviceId: 'nasa', status: 'active' }),
    )
    const first = nasaWidget()
    const second = nasaWidget()
    const other = makeInstance()
    const { user, onClose, client } = setup(first, [first, second, other])
    for (const instance of [first, second, other]) {
        client.setQueryData(queryKeys.widgetData(instance.id), {})
    }

    await user.type(await screen.findByLabelText(/NASA API key/), 'my-key')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())

    const stale = (id: string) =>
        client.getQueryState(queryKeys.widgetData(id))?.isInvalidated
    expect(stale(first.id)).toBe(true)
    expect(stale(second.id)).toBe(true)
    expect(stale(other.id)).toBe(false)
    // The catalog is on screen, so it is fetched again for the new status.
    await waitFor(() => expect(apiMock.catalog).toHaveBeenCalledTimes(2))
})

test('does not call the API while the key is empty', async () => {
    const { user } = setup(nasaWidget())

    await user.click(await screen.findByRole('button', { name: 'Save' }))

    expect(screen.getByText('This field is required.')).toBeVisible()
    expect(apiMock.subscribe).not.toHaveBeenCalled()
})

test('a server rejection is shown in the form and the dialog stays open', async () => {
    apiMock.subscribe.mockResolvedValue(
        fail(400, 'INVALID_CREDENTIALS', 'apiKey is required'),
    )
    const { user, onClose } = setup(nasaWidget())

    await user.type(await screen.findByLabelText(/NASA API key/), 'my-key')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
        'apiKey is required',
    )
    expect(onClose).not.toHaveBeenCalled()
})

test('says so when the service does not use an API key', async () => {
    setup(makeInstance())

    expect(
        await screen.findByText("This service doesn't use an API key."),
    ).toBeVisible()
    expect(
        screen.queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument()
})

test('Cancel closes without saving', async () => {
    const { user, onClose } = setup(nasaWidget())
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(apiMock.subscribe).not.toHaveBeenCalled()
})
