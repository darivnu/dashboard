import { useMemo, useState } from 'react'
import type { WidgetViewProps } from '../../../widgetRegistry'
import Globe from './Globe'
import { playableStations, supportsNativeHls } from './hls'
import PlayerBar from './PlayerBar'
import type { StationMapData } from './parse'
import { useStationPlayer } from './useStationPlayer'

export default function StationMap({ data }: WidgetViewProps<StationMapData>) {
    const player = useStationPlayer()
    // Asked once: the browser's answer does not change while the page is open.
    const [hlsSupported] = useState(() => supportsNativeHls())
    const stations = useMemo(
        () => playableStations(data.stations, hlsSupported),
        [data.stations, hlsSupported],
    )

    const active = player.status === 'playing' || player.status === 'connecting'
    const playingId = active ? (player.station?.id ?? null) : null

    return (
        <div className="h-full flex flex-col gap-2">
            <div className="relative flex-1 min-h-0">
                {stations.length === 0 ? (
                    <p className="text-muted text-sm">No stations to show.</p>
                ) : (
                    <Globe
                        stations={stations}
                        playingId={playingId}
                        onPlay={player.play}
                    />
                )}
            </div>
            <PlayerBar player={player} />
        </div>
    )
}
