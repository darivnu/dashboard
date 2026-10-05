import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import InstanceForm from './InstanceForm'
import { ApiError } from './queries'
import type { CatalogWidget } from './types'

const stationMap: CatalogWidget = {
    id: 'station_map',
    name: 'Station map',
    description: 'The most-listened radio stations on a globe',
    params: [
        {
            name: 'limit',
            label: 'How many stations',
            type: 'integer',
            required: false,
            default: 200,
            min: 1,
            max: 500,
        },
    ],
    refresh: { default: 600, min: 120 },
}

const fresh = {
    title: null,
    params: {},
    refreshSeconds: 600,
    w: 6,
    h: 5,
}

function setup(overrides: Partial<Parameters<typeof InstanceForm>[0]> = {}) {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()
    render(
        <InstanceForm
            idPrefix="test"
            widget={stationMap}
            minSize={{ w: 4, h: 4 }}
            initial={fresh}
            submitLabel="Add"
            onSubmit={onSubmit}
            onCancel={onCancel}
            {...overrides}
        />,
    )
    return { onSubmit, onCancel, user: userEvent.setup() }
}

const field = {
    title: () => screen.getByRole('textbox', { name: 'Title' }),
    limit: () => screen.getByRole('spinbutton', { name: 'How many stations' }),
    refresh: () =>
        screen.getByRole('spinbutton', { name: 'Refresh every (seconds)' }),
    width: () => screen.getByRole('spinbutton', { name: 'Width (columns)' }),
    height: () => screen.getByRole('spinbutton', { name: 'Height (rows)' }),
    submit: (name = 'Add') => screen.getByRole('button', { name }),
}

async function retype(
    user: ReturnType<typeof userEvent.setup>,
    input: HTMLElement,
    text: string,
) {
    await user.clear(input)
    if (text) await user.type(input, text)
}

test('a new widget starts from the catalog defaults and the given size', () => {
    setup()
    expect(field.title()).toHaveValue('')
    expect(field.limit()).toHaveValue(200)
    expect(field.refresh()).toHaveValue(600)
    expect(field.width()).toHaveValue(6)
    expect(field.height()).toHaveValue(5)
})

test('an existing widget starts from its own values', () => {
    setup({
        initial: {
            title: 'Europe',
            params: { limit: 50 },
            refreshSeconds: 300,
            w: 8,
            h: 6,
        },
        submitLabel: 'Save',
    })
    expect(field.title()).toHaveValue('Europe')
    expect(field.limit()).toHaveValue(50)
    expect(field.refresh()).toHaveValue(300)
    expect(field.width()).toHaveValue(8)
    expect(field.height()).toHaveValue(6)
    expect(field.submit('Save')).toBeInTheDocument()
})

test('submits cleaned values: numbers as numbers, an empty title as null', async () => {
    const { onSubmit, user } = setup()
    await retype(user, field.limit(), '50')
    await user.click(field.submit())

    expect(onSubmit).toHaveBeenCalledWith({
        title: null,
        params: { limit: 50 },
        refreshSeconds: 600,
        w: 6,
        h: 5,
    })
})

test('submits the title, trimmed', async () => {
    const { onSubmit, user } = setup()
    await user.type(field.title(), '  Europe  ')
    await user.click(field.submit())
    expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Europe' }),
    )
})

test.each([
    ['0', 'Must be at least 1.'],
    ['501', 'Must be at most 500.'],
])('refuses a limit of %s', async (text, message) => {
    const { onSubmit, user } = setup()
    await retype(user, field.limit(), text)
    await user.click(field.submit())

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(field.limit()).toBeInvalid()
    expect(onSubmit).not.toHaveBeenCalled()
})

test('refuses a refresh interval below the minimum of the widget', async () => {
    const { onSubmit, user } = setup()
    await retype(user, field.refresh(), '119')
    await user.click(field.submit())

    expect(screen.getByText('Must be at least 120.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
})

test('accepts the minimum refresh interval', async () => {
    const { onSubmit, user } = setup()
    await retype(user, field.refresh(), '120')
    await user.click(field.submit())
    expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ refreshSeconds: 120 }),
    )
})

test('refuses a size below the minimum of the widget or wider than the grid', async () => {
    const { onSubmit, user } = setup()
    await retype(user, field.width(), '3')
    await retype(user, field.height(), '2')
    await user.click(field.submit())
    expect(screen.getAllByText('Must be at least 4.')).toHaveLength(2)

    await retype(user, field.width(), '13')
    await retype(user, field.height(), '5')
    await user.click(field.submit())
    expect(screen.getByText('Must be at most 12.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
})

test('an error goes away once the field is fixed and the form submitted', async () => {
    const { onSubmit, user } = setup()
    await retype(user, field.limit(), '501')
    await user.click(field.submit())
    expect(screen.getByText('Must be at most 500.')).toBeInTheDocument()

    await retype(user, field.limit(), '500')
    await user.click(field.submit())
    expect(screen.queryByText('Must be at most 500.')).not.toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledTimes(1)
})

test('shows a server rejection inside the form and lets the user try again', async () => {
    const { onSubmit, user } = setup()
    onSubmit.mockRejectedValueOnce(
        new ApiError(400, 'INVALID_PARAMS', '/limit: must be <= 500'),
    )
    await user.click(field.submit())

    expect(await screen.findByRole('alert')).toHaveTextContent(
        '/limit: must be <= 500',
    )
    expect(field.submit()).toBeEnabled()

    await user.click(field.submit())
    expect(onSubmit).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('shows the network message when the server cannot be reached', async () => {
    const { onSubmit, user } = setup()
    onSubmit.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await user.click(field.submit())
    expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't reach the dashboard server.",
    )
})

test('the submit button is disabled while the request is in flight', async () => {
    let finish: () => void = () => {}
    const { onSubmit, user } = setup()
    onSubmit.mockReturnValueOnce(
        new Promise<void>((resolve) => {
            finish = resolve
        }),
    )
    await user.click(field.submit())
    expect(field.submit()).toBeDisabled()

    finish()
    await vi.waitFor(() => expect(field.submit()).toBeEnabled())
})

test('Cancel calls onCancel and does not submit', async () => {
    const { onSubmit, onCancel, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
})
