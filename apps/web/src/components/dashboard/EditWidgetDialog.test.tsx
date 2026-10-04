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
import EditWidgetDialog from './EditWidgetDialog'
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
]

const field = {
    title: () => screen.getByRole('textbox', { name: 'Title' }),
    message: () => screen.getByRole('textbox', { name: 'Message' }),
    count: () => screen.getByRole('spinbutton', { name: 'Count' }),
    refresh: () =>
        screen.getByRole('spinbutton', { name: 'Refresh every (seconds)' }),
    width: () => screen.getByRole('spinbutton', { name: 'Width (columns)' }),
    height: () => screen.getByRole('spinbutton', { name: 'Height (rows)' }),
}

function makeDashboard() {
    const first = makeInstance({
        title: 'Hello',
        params: { message: 'hi', count: 2 },
        refreshSeconds: 30,
        x: 0,
        y: 0,
    })
    const second = makeInstance({ x: 4, y: 0 })
    const third = makeInstance({ x: 8, y: 0 })
    return { first, second, third, all: [first, second, third] }
}

function setup(
    instance: ReturnType<typeof makeInstance> | null,
    instances: ReturnType<typeof makeInstance>[],
) {
    const onClose = vi.fn()
    const view = renderWithQuery(
        <EditWidgetDialog
            instance={instance}
            instances={instances}
            onClose={onClose}
        />,
    )
    view.client.setQueryData(queryKeys.instances, instances)
    return { onClose, user: userEvent.setup(), ...view }
}

beforeEach(() => {
    resetApiMock()
    apiMock.catalog.mockResolvedValue(ok({ services }))
})

test('stays closed while there is no widget to edit', () => {
    setup(null, [])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(apiMock.catalog).not.toHaveBeenCalled()
})

test('opens with the current values of the widget', async () => {
    const { first, all } = makeDashboard()
    setup(first, all)

    expect(
        await screen.findByRole('dialog', { name: 'Edit widget' }),
    ).toBeVisible()
    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveValue(
        'Hello',
    )
    expect(field.message()).toHaveValue('hi')
    expect(field.count()).toHaveValue(2)
    expect(field.refresh()).toHaveValue(30)
    expect(field.width()).toHaveValue(4)
    expect(field.height()).toHaveValue(3)
})

test('saves the changed values and closes; an unchanged size moves nothing', async () => {
    const { first, all } = makeDashboard()
    apiMock.updateInstance.mockResolvedValue(
        ok({ ...first, title: 'Bye', params: { message: 'hi', count: 5 } }),
    )
    const { user, onClose } = setup(first, all)

    await user.clear(await screen.findByRole('textbox', { name: 'Title' }))
    await user.type(field.title(), 'Bye')
    await user.clear(field.count())
    await user.type(field.count(), '5')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(apiMock.instanceById).toHaveBeenCalledWith({ id: first.id })
    expect(apiMock.updateInstance).toHaveBeenCalledWith({
        title: 'Bye',
        params: { message: 'hi', count: 5 },
        refreshSeconds: 30,
        w: 4,
        h: 3,
    })
    expect(apiMock.saveLayout).not.toHaveBeenCalled()
})

test('a new size is saved and the cards after it are moved to make room', async () => {
    const { first, second, third, all } = makeDashboard()
    apiMock.updateInstance.mockResolvedValue(ok({ ...first, w: 6 }))
    apiMock.saveLayout.mockResolvedValue(ok({ instances: all }))
    const { user, onClose } = setup(first, all)

    await user.clear(
        await screen.findByRole('spinbutton', { name: 'Width (columns)' }),
    )
    await user.type(field.width(), '6')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(apiMock.updateInstance).toHaveBeenCalledWith(
        expect.objectContaining({ w: 6, h: 3 }),
    )
    // 6 + 4 fit in the first row; the third card drops to the next one
    expect(apiMock.saveLayout).toHaveBeenCalledWith([
        { id: second.id, x: 6, y: 0, w: 4, h: 3 },
        { id: third.id, x: 0, y: 3, w: 4, h: 3 },
    ])
})

test('a server rejection is shown in the form and the dialog stays open', async () => {
    const { first, all } = makeDashboard()
    apiMock.updateInstance.mockResolvedValue(
        fail(400, 'REFRESH_TOO_LOW', 'refreshSeconds must be at least 5'),
    )
    const { user, onClose } = setup(first, all)

    await user.click(await screen.findByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
        'refreshSeconds must be at least 5',
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(apiMock.saveLayout).not.toHaveBeenCalled()
})

test('does not call the API while the form is invalid', async () => {
    const { first, all } = makeDashboard()
    const { user } = setup(first, all)

    await user.clear(await screen.findByRole('textbox', { name: 'Message' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('This field is required.')).toBeVisible()
    expect(apiMock.updateInstance).not.toHaveBeenCalled()
})

test('says so when the widget is no longer in the catalog', async () => {
    const orphan = makeInstance({ serviceId: 'gone', widgetId: 'missing' })
    setup(orphan, [orphan])

    expect(
        await screen.findByText(/This widget is no longer available/),
    ).toBeVisible()
    expect(
        screen.queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument()
})

test('Cancel closes without saving', async () => {
    const { first, all } = makeDashboard()
    const { user, onClose } = setup(first, all)
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(apiMock.updateInstance).not.toHaveBeenCalled()
})

test('when the catalog cannot be loaded, offers to try again', async () => {
    const { first, all } = makeDashboard()
    apiMock.catalog.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { user } = setup(first, all)

    expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't reach the dashboard server.",
    )
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('textbox', { name: 'Title' })).toBeVisible()
})
