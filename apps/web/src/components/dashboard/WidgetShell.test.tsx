import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
    apiMock,
    fail,
    makeInstance,
    ok,
    resetApiMock,
} from '../../test/apiMock'
import { renderWithQuery } from '../../test/renderWithQuery'
import WidgetShell from './WidgetShell'

vi.mock('../../api', async () => (await import('../../test/apiMock')).apiModule)

// The real registry, plus one widget that throws while rendering when its
// data says so.
vi.mock('../widgetRegistry', async (importOriginal) => {
    const original = await importOriginal<typeof import('../widgetRegistry')>()
    const boom = original.defineWidget<{ explode: boolean }>({
        component: ({ data }) => {
            if (data.explode) throw new Error('boom')
            return <p>All good</p>
        },
        parse: (raw) => raw as { explode: boolean },
        defaultSize: { w: 4, h: 3 },
        minSize: { w: 2, h: 2 },
    })
    return {
        ...original,
        getWidgetEntry: (serviceId: string, widgetId: string) =>
            serviceId === 'test' && widgetId === 'boom'
                ? boom
                : original.getWidgetEntry(serviceId, widgetId),
    }
})

function success(data: unknown, fetchedAt = '2026-10-03T14:32:00.000Z') {
    return ok({ ok: true, data, fetchedAt })
}

function failure(code: string) {
    return ok({ ok: false, code })
}

function setup(instance = makeInstance({ title: 'My echo' })) {
    const handlers = { onEdit: vi.fn(), onDelete: vi.fn(), onMove: vi.fn() }
    const view = renderWithQuery(
        <WidgetShell instance={instance} {...handlers} />,
    )
    return { instance, user: userEvent.setup(), ...handlers, ...view }
}

beforeEach(() => {
    resetApiMock()
})

describe('header', () => {
    beforeEach(() => {
        apiMock.instanceData.mockResolvedValue(success({ message: 'hi' }))
    })

    test('shows the title of the widget', () => {
        setup()
        expect(
            screen.getByRole('article', { name: 'My echo' }),
        ).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'My echo' })).toBeVisible()
    })

    test('falls back to service / widget when there is no title', () => {
        setup(makeInstance({ title: null }))
        expect(
            screen.getByRole('heading', { name: 'mock / echo' }),
        ).toBeVisible()
    })

    test('Edit, the arrows and Delete call their handlers', async () => {
        const { user, onEdit, onDelete, onMove } = setup()

        await user.click(screen.getByRole('button', { name: 'Edit' }))
        expect(onEdit).toHaveBeenCalledTimes(1)

        await user.click(screen.getByRole('button', { name: 'Move left' }))
        expect(onMove).toHaveBeenLastCalledWith('left')
        await user.click(screen.getByRole('button', { name: 'Move right' }))
        expect(onMove).toHaveBeenLastCalledWith('right')

        await user.click(screen.getByRole('button', { name: 'Delete' }))
        expect(onDelete).toHaveBeenCalledTimes(1)
    })
})

describe('loading and data', () => {
    test('shows a spinner on first load, then the widget and the time of the data', async () => {
        apiMock.instanceData.mockResolvedValue(
            success({ message: 'hello', count: 2 }),
        )
        setup()

        expect(screen.getByRole('status', { name: 'Loading' })).toBeVisible()
        expect(document.querySelector('time')).toBeNull()

        expect(await screen.findByText('hello')).toBeVisible()
        expect(screen.getByText('Count: 2')).toBeVisible()
        expect(
            screen.queryByRole('status', { name: 'Loading' }),
        ).not.toBeInTheDocument()
        expect(document.querySelector('time')).toHaveAttribute(
            'datetime',
            '2026-10-03T14:32:00.000Z',
        )
    })

    test('Refresh fetches again and shows the new data', async () => {
        apiMock.instanceData.mockResolvedValueOnce(success({ message: 'one' }))
        const { user } = setup()
        expect(await screen.findByText('one')).toBeVisible()

        apiMock.instanceData.mockResolvedValueOnce(
            success({ message: 'two' }, '2026-10-03T14:40:00.000Z'),
        )
        await user.click(screen.getByRole('button', { name: 'Refresh' }))

        expect(await screen.findByText('two')).toBeVisible()
        expect(document.querySelector('time')).toHaveAttribute(
            'datetime',
            '2026-10-03T14:40:00.000Z',
        )
    })

    test('shows a refreshing indicator while new data is on its way', async () => {
        apiMock.instanceData.mockResolvedValueOnce(success({ message: 'one' }))
        const { user } = setup()
        expect(await screen.findByText('one')).toBeVisible()

        let respond: (value: unknown) => void = () => {}
        apiMock.instanceData.mockReturnValueOnce(
            new Promise((resolve) => {
                respond = resolve
            }),
        )
        await user.click(screen.getByRole('button', { name: 'Refresh' }))

        expect(
            await screen.findByRole('status', { name: 'Refreshing' }),
        ).toBeVisible()
        expect(screen.getByText('one')).toBeVisible()

        respond(success({ message: 'two' }))
        expect(await screen.findByText('two')).toBeVisible()
        expect(
            screen.queryByRole('status', { name: 'Refreshing' }),
        ).not.toBeInTheDocument()
    })
})

describe('a first load that fails', () => {
    test.each([
        [
            'rate_limited',
            'Too many requests to this service. It will retry automatically.',
        ],
        ['upstream_error', "The service isn't responding right now."],
    ])('%s: message and Try again', async (code, message) => {
        apiMock.instanceData.mockResolvedValueOnce(failure(code))
        const { user } = setup()

        expect(await screen.findByRole('alert')).toHaveTextContent(message)

        apiMock.instanceData.mockResolvedValueOnce(success({ message: 'back' }))
        await user.click(screen.getByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('back')).toBeVisible()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    test('invalid_config: message and Edit settings', async () => {
        apiMock.instanceData.mockResolvedValue(failure('invalid_config'))
        const { user, onEdit } = setup()

        expect(await screen.findByRole('alert')).toHaveTextContent(
            "This widget's settings are no longer valid.",
        )
        expect(
            screen.queryByRole('button', { name: 'Try again' }),
        ).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Edit settings' }))
        expect(onEdit).toHaveBeenCalledTimes(1)
    })

    test('needs_reauth: message without an action', async () => {
        apiMock.instanceData.mockResolvedValue(failure('needs_reauth'))
        setup()

        const alert = await screen.findByRole('alert')
        expect(alert).toHaveTextContent('This service needs to be reconnected.')
        expect(within(alert).queryByRole('button')).not.toBeInTheDocument()
    })

    test.each([
        ['an unreachable server', () => Promise.reject(new TypeError('x'))],
        [
            'an HTTP error',
            () => Promise.resolve(fail(404, 'NOT_FOUND', 'Not found')),
        ],
    ])('%s: the network message and Try again', async (_name, answer) => {
        apiMock.instanceData.mockImplementationOnce(answer)
        const { user } = setup()

        expect(await screen.findByRole('alert')).toHaveTextContent(
            "Couldn't reach the dashboard server.",
        )

        apiMock.instanceData.mockResolvedValueOnce(success({ message: 'back' }))
        await user.click(screen.getByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('back')).toBeVisible()
    })

    test('data of an unexpected shape counts as the service not responding', async () => {
        apiMock.instanceData.mockResolvedValueOnce(success({ nope: true }))
        const { user } = setup()

        expect(await screen.findByRole('alert')).toHaveTextContent(
            "The service isn't responding right now.",
        )

        apiMock.instanceData.mockResolvedValueOnce(success({ message: 'back' }))
        await user.click(screen.getByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('back')).toBeVisible()
    })
})

describe('a refresh that fails while data is on screen', () => {
    test('keeps the widget and marks the header with the reason', async () => {
        apiMock.instanceData.mockResolvedValueOnce(success({ message: 'one' }))
        const { user } = setup()
        expect(await screen.findByText('one')).toBeVisible()

        apiMock.instanceData.mockResolvedValueOnce(failure('rate_limited'))
        await user.click(screen.getByRole('button', { name: 'Refresh' }))

        const marker = await screen.findByText('Refresh failed')
        expect(marker).toHaveAttribute(
            'title',
            'Too many requests to this service. It will retry automatically.',
        )
        expect(screen.getByText('one')).toBeVisible()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        // still the time of the last good data
        expect(document.querySelector('time')).toHaveAttribute(
            'datetime',
            '2026-10-03T14:32:00.000Z',
        )
    })

    test('the marker goes away after a good refresh', async () => {
        apiMock.instanceData.mockResolvedValueOnce(success({ message: 'one' }))
        const { user } = setup()
        expect(await screen.findByText('one')).toBeVisible()

        apiMock.instanceData.mockRejectedValueOnce(new TypeError('x'))
        await user.click(screen.getByRole('button', { name: 'Refresh' }))
        expect(await screen.findByText('Refresh failed')).toHaveAttribute(
            'title',
            "Couldn't reach the dashboard server.",
        )

        apiMock.instanceData.mockResolvedValueOnce(success({ message: 'two' }))
        await user.click(screen.getByRole('button', { name: 'Refresh' }))
        expect(await screen.findByText('two')).toBeVisible()
        expect(screen.queryByText('Refresh failed')).not.toBeInTheDocument()
    })

    test('invalid_config replaces the widget even with data on screen', async () => {
        apiMock.instanceData.mockResolvedValueOnce(success({ message: 'one' }))
        const { user } = setup()
        expect(await screen.findByText('one')).toBeVisible()

        apiMock.instanceData.mockResolvedValueOnce(failure('invalid_config'))
        await user.click(screen.getByRole('button', { name: 'Refresh' }))

        expect(await screen.findByRole('alert')).toHaveTextContent(
            "This widget's settings are no longer valid.",
        )
        expect(screen.queryByText('one')).not.toBeInTheDocument()
        expect(screen.queryByText('Refresh failed')).not.toBeInTheDocument()
    })
})

describe('a widget that throws while rendering', () => {
    beforeEach(() => {
        // React reports the caught error on the console; keep the output clean.
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    const boom = () =>
        makeInstance({ serviceId: 'test', widgetId: 'boom', title: 'Boom' })

    test('shows the problem message, and Reload widget fetches and renders again', async () => {
        apiMock.instanceData.mockResolvedValueOnce(success({ explode: true }))
        const { user } = setup(boom())

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'This widget hit a problem.',
        )

        apiMock.instanceData.mockResolvedValueOnce(success({ explode: false }))
        await user.click(screen.getByRole('button', { name: 'Reload widget' }))
        expect(await screen.findByText('All good')).toBeVisible()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    test('the other widgets keep working', async () => {
        apiMock.instanceById.mockImplementation(({ id }: { id: string }) => {
            apiMock.instanceData.mockResolvedValueOnce(
                id === 'broken'
                    ? success({ explode: true })
                    : success({ message: 'still here' }),
            )
        })
        const handlers = { onEdit: vi.fn(), onDelete: vi.fn(), onMove: vi.fn() }
        renderWithQuery(
            <>
                <WidgetShell
                    instance={{ ...boom(), id: 'broken' }}
                    {...handlers}
                />
                <WidgetShell
                    instance={makeInstance({ id: 'fine', title: 'Fine' })}
                    {...handlers}
                />
            </>,
        )

        const broken = screen.getByRole('article', { name: 'Boom' })
        const fine = screen.getByRole('article', { name: 'Fine' })
        expect(await within(broken).findByRole('alert')).toHaveTextContent(
            'This widget hit a problem.',
        )
        expect(await within(fine).findByText('still here')).toBeVisible()

        await userEvent.click(
            within(fine).getByRole('button', { name: 'Edit' }),
        )
        expect(handlers.onEdit).toHaveBeenCalledTimes(1)
    })
})

describe('legacy and unknown widgets', () => {
    test('an unknown widget shows the fallback in the frame and fetches nothing', async () => {
        const { user, onDelete } = setup(
            makeInstance({
                serviceId: 'nope',
                widgetId: 'nothing',
                title: null,
            }),
        )

        expect(screen.getByText('Widget not implemented yet')).toBeVisible()
        expect(
            screen.queryByRole('button', { name: 'Refresh' }),
        ).not.toBeInTheDocument()
        await waitFor(() => expect(apiMock.instanceData).not.toHaveBeenCalled())

        await user.click(screen.getByRole('button', { name: 'Delete' }))
        expect(onDelete).toHaveBeenCalled()
    })

    test('the advice widget keeps fetching for itself inside the frame', async () => {
        apiMock.instanceData.mockResolvedValue(
            success({ advice: 'Drink water.' }),
        )
        setup(
            makeInstance({
                serviceId: 'advice_slip',
                widgetId: 'random_advice',
                title: 'Advice',
            }),
        )

        expect(await screen.findByText(/Drink water\./)).toBeVisible()
        expect(
            screen.queryByRole('button', { name: 'Refresh' }),
        ).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible()
    })
})
