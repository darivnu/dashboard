import { useState } from 'react'
import Button from '../../../ui/Button'
import type { PlayerStatus, StationPlayer } from './useStationPlayer'

type Props = {
    player: StationPlayer
}

const statusText: Record<PlayerStatus, string> = {
    idle: '',
    connecting: 'Connecting…',
    playing: 'Playing',
    paused: 'Paused',
    failed: "This station isn't available right now.",
}

export default function PlayerBar({ player }: Props) {
    const { station, status, volume, muted } = player
    // The id of the station whose icon failed to load, so a later station
    // gets a fresh try.
    const [brokenIconOf, setBrokenIconOf] = useState<string | null>(null)

    if (!station) {
        return (
            <p className="text-gray-400 text-sm p-2">
                Click a station to listen.
            </p>
        )
    }

    const showIcon = station.favicon !== null && brokenIconOf !== station.id
    const active = status === 'playing' || status === 'connecting'

    return (
        <div className="flex items-center gap-3 p-2 text-sm">
            {showIcon ? (
                <img
                    src={station.favicon ?? undefined}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded object-cover bg-gray-700"
                    onError={() => setBrokenIconOf(station.id)}
                />
            ) : (
                <span
                    aria-hidden="true"
                    className="h-8 w-8 shrink-0 rounded bg-gray-700 text-gray-400 flex items-center justify-center"
                >
                    ♪
                </span>
            )}

            <div className="min-w-0 flex-1">
                <p className="text-white font-semibold truncate">
                    {station.name || 'Unnamed station'}
                </p>
                <p
                    role="status"
                    className={
                        status === 'failed'
                            ? 'text-red-400 text-xs'
                            : 'text-gray-400 text-xs'
                    }
                >
                    {statusText[status]}
                </p>
            </div>

            <Button variant="ghost" onClick={player.toggle}>
                {active ? 'Pause' : 'Play'}
            </Button>
            <Button variant="ghost" onClick={player.toggleMute}>
                {muted ? 'Unmute' : 'Mute'}
            </Button>
            <input
                type="range"
                aria-label="Volume"
                min={0}
                max={100}
                value={Math.round(volume * 100)}
                onChange={(event) =>
                    player.setVolume(Number(event.target.value) / 100)
                }
                className="w-20 shrink-0"
            />
        </div>
    )
}
