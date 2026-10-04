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
import AddWidgetDialog from './AddWidgetDialog'
import { queryKeys } from './queries'

vi.mock('../../api', async () => (await import('../../test/apiMock')).apiModule)

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
                    {
                        name: 'count',
                        label: 'Count',
                        type: 'integer',
                        required: false,
                        default: 1,
                        min: 1,
                        max: 10,
                    },
                ],
                refresh: { default: 60, min: 5 },
            },
        ],
    },
    {
        id: 'advice_slip',
        name: 'Advice Slip',
        auth: { kind: 'none' },
        subscription: null,
        widgets: [
            {
                id: 'random_advice',
                name: 'Random advice',
                description: 'A piece of advice',
                params: [],
                refresh: { default: 60, min: 10 },
            },
        ],
    },
]

function setup(instances = [makeInstance()]) {
    const onClose = vi.fn()
    const view = renderWithQuery(
        <AddWidgetDialog open onClose={onClose} instances={instances} />,
    )
    return { onClose, user: userEvent.setup(), ...view }
}

beforeEach(() => {
    resetApiMock()
    apiMock.catalog.mockResolvedValue(ok({ services }))
})

test('shows nothing and asks for nothing while closed', () => {
    renderWithQuery(
        <AddWidgetDialog open={false} onClose={() => {}} instances={[]} />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(apiMock.catalog).not.toHaveBeenCalled()
})

test('lists every widget of the catalog under its service', async () => {
    setup()
    expect(
        screen.getByRole('status', { name: 'Loading widgets' }),
    ).toBeVisible()

    expect(await screen.findByRole('button', { name: /Echo/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /Random advice/ })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Mock' })).toBeVisible()
    expect(screen.getByText('Repeats a message')).toBeVisible()
})

test('picking a widget shows its form, generated from the catalog', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: /Echo/ }))

    expect(screen.getByRole('textbox', { name: 'Message' })).toBeVisible()
    expect(screen.getByRole('spinbutton', { name: 'Count' })).toHaveValue(1)
    expect(
        screen.getByRole('spinbutton', { name: 'Refresh every (seconds)' }),
    ).toHaveValue(60)
    // the registry's default size for echo
    expect(
        screen.getByRole('spinbutton', { name: 'Width (columns)' }),
    ).toHaveValue(4)
    expect(
        screen.getByRole('spinbutton', { name: 'Height (rows)' }),
    ).toHaveValue(3)
})

test('Back returns to the list', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: /Echo/ }))
    await user.click(screen.getByRole('button', { name: '← Back' }))
    expect(screen.getByRole('button', { name: /Random advice/ })).toBeVisible()
})

test('creates the widget in the next free place and closes', async () => {
    const existing = [
        makeInstance({ x: 0, y: 0 }),
        makeInstance({ x: 4, y: 0 }),
    ]
    const created = makeInstance({ x: 8, y: 0, params: { message: 'hi' } })
    apiMock.createInstance.mockResolvedValue(ok(created))
    const { user, onClose, client } = setup(existing)
    client.setQueryData(queryKeys.instances, existing)

    await user.click(await screen.findByRole('button', { name: /Echo/ }))
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'hi')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(apiMock.createInstance).toHaveBeenCalledWith({
        serviceId: 'mock',
        widgetId: 'echo',
        title: null,
        params: { message: 'hi', count: 1 },
        refreshSeconds: 60,
        x: 8,
        y: 0,
        w: 4,
        h: 3,
    })
    expect(client.getQueryData(queryKeys.instances)).toEqual([
        ...existing,
        created,
    ])
})

test('does not call the API while the form is invalid', async () => {
    const { user, onClose } = setup()
    await user.click(await screen.findByRole('button', { name: /Echo/ }))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('This field is required.')).toBeVisible()
    expect(apiMock.createInstance).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
})

test('a server rejection is shown in the form and the dialog stays open', async () => {
    apiMock.createInstance.mockResolvedValue(
        fail(400, 'INVALID_PARAMS', '/count: must be <= 10'),
    )
    const { user, onClose } = setup()
    await user.click(await screen.findByRole('button', { name: /Echo/ }))
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'hi')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
        '/count: must be <= 10',
    )
    expect(onClose).not.toHaveBeenCalled()
})

test('a widget without settings can be added straight away', async () => {
    apiMock.createInstance.mockResolvedValue(
        ok(
            makeInstance({
                serviceId: 'advice_slip',
                widgetId: 'random_advice',
            }),
        ),
    )
    const { user, onClose } = setup([])
    await user.click(
        await screen.findByRole('button', { name: /Random advice/ }),
    )
    expect(screen.getByText('This widget has no settings.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(apiMock.createInstance).toHaveBeenCalledWith(
        expect.objectContaining({
            serviceId: 'advice_slip',
            widgetId: 'random_advice',
            params: {},
            x: 0,
            y: 0,
        }),
    )
})

test('when the catalog cannot be loaded, says why and offers to try again', async () => {
    apiMock.catalog.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { user } = setup()

    expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't reach the dashboard server.",
    )
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: /Echo/ })).toBeVisible()
})

test('Cancel closes without creating', async () => {
    const { user, onClose } = setup()
    await user.click(await screen.findByRole('button', { name: /Echo/ }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(apiMock.createInstance).not.toHaveBeenCalled()
})

test('reopening starts again from the list', async () => {
    const { user, rerender } = setup()
    await user.click(await screen.findByRole('button', { name: /Echo/ }))
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeVisible()

    rerender(<AddWidgetDialog open={false} onClose={() => {}} instances={[]} />)
    rerender(<AddWidgetDialog open onClose={() => {}} instances={[]} />)

    expect(await screen.findByRole('button', { name: /Echo/ })).toBeVisible()
    expect(
        screen.queryByRole('textbox', { name: 'Message' }),
    ).not.toBeInTheDocument()
})
