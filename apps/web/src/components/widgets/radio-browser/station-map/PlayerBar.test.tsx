import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import PlayerBar from './PlayerBar'
import type { Station } from './parse'
import type { StationPlayer } from './useStationPlayer'

const station: Station = {
    id: 'one',
    name: 'Radio One',
    streamUrl: 'https://example.com/one',
    favicon: 'https://example.com/one.png',
    hls: false,
    lat: 0,
    lng: 0,
}

function makePlayer(overrides: Partial<StationPlayer> = {}): StationPlayer {
    return {
        station,
        status: 'playing',
        volume: 1,
        muted: false,
        play: vi.fn(),
        toggle: vi.fn(),
        setVolume: vi.fn(),
        toggleMute: vi.fn(),
        ...overrides,
    }
}

function icon(container: HTMLElement) {
    return container.querySelector('img')
}

test('invites to pick a station while none is chosen', () => {
    render(<PlayerBar player={makePlayer({ station: null, status: 'idle' })} />)
    expect(screen.getByText('Click a station to listen.')).toBeVisible()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('shows the name and the icon of the station', () => {
    const { container } = render(<PlayerBar player={makePlayer()} />)
    expect(screen.getByText('Radio One')).toBeVisible()
    expect(icon(container)).toHaveAttribute(
        'src',
        'https://example.com/one.png',
    )
})

test('a station without a name is called unnamed', () => {
    render(
        <PlayerBar
            player={makePlayer({ station: { ...station, name: '' } })}
        />,
    )
    expect(screen.getByText('Unnamed station')).toBeVisible()
})

test('shows a placeholder when the station has no icon', () => {
    const { container } = render(
        <PlayerBar
            player={makePlayer({ station: { ...station, favicon: null } })}
        />,
    )
    expect(icon(container)).toBeNull()
    expect(screen.getByText('♪')).toBeInTheDocument()
})

test('shows the placeholder when the icon fails to load, and tries again for another station', () => {
    const { container, rerender } = render(<PlayerBar player={makePlayer()} />)
    const image = icon(container)
    if (!image) throw new Error('expected an icon')
    fireEvent.error(image)

    expect(icon(container)).toBeNull()
    expect(screen.getByText('♪')).toBeInTheDocument()

    const other = {
        ...station,
        id: 'two',
        favicon: 'https://example.com/two.png',
    }
    rerender(<PlayerBar player={makePlayer({ station: other })} />)
    expect(icon(container)).toHaveAttribute(
        'src',
        'https://example.com/two.png',
    )
})

test.each([
    ['connecting', 'Connecting…', 'Pause'],
    ['playing', 'Playing', 'Pause'],
    ['paused', 'Paused', 'Play'],
    ['failed', "This station isn't available right now.", 'Play'],
] as const)('%s: says "%s" and offers %s', (status, text, button) => {
    render(<PlayerBar player={makePlayer({ status })} />)
    expect(screen.getByRole('status')).toHaveTextContent(text)
    expect(screen.getByRole('button', { name: button })).toBeVisible()
})

test('Play/Pause toggles the player', async () => {
    const player = makePlayer()
    render(<PlayerBar player={player} />)
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(player.toggle).toHaveBeenCalledTimes(1)
})

test('Mute toggles mute, and reads Unmute while muted', async () => {
    const player = makePlayer()
    const { rerender } = render(<PlayerBar player={player} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mute' }))
    expect(player.toggleMute).toHaveBeenCalledTimes(1)

    rerender(<PlayerBar player={makePlayer({ muted: true })} />)
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeVisible()
})

test('the slider shows the volume and changes it', () => {
    const player = makePlayer({ volume: 0.4 })
    render(<PlayerBar player={player} />)
    const slider = screen.getByRole('slider', { name: 'Volume' })
    expect(slider).toHaveValue('40')

    fireEvent.change(slider, { target: { value: '75' } })
    expect(player.setVolume).toHaveBeenCalledWith(0.75)
})
