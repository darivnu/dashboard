import type { ComponentType } from 'react'
import type { Instance, InstanceParams } from './dashboard/types'
import AdviceWidget from './widgets/AdviceWidget'
import FreeGames from './widgets/epic-games/free-games/FreeGames'
import { parseFreeGames } from './widgets/epic-games/free-games/parse'
import NotificationsWidget from './widgets/github/notifications/NotificationsWidget'
import { parseNotifications } from './widgets/github/notifications/parse'
import EchoWidget from './widgets/mock/echo/EchoWidget'
import { parseEcho } from './widgets/mock/echo/parse'
import ApodWidget from './widgets/nasa/apod/ApodWidget'
import { parseApod } from './widgets/nasa/apod/parse'
import NeoWidget from './widgets/nasa/neows/NeoWidget'
import { parseNeo } from './widgets/nasa/neows/parse'
import BoosterOpener from './widgets/pokemon-tcg/booster-opener/BoosterOpener'
import { parseBoosterOpener } from './widgets/pokemon-tcg/booster-opener/parse'
import { parseStationMap } from './widgets/radio-browser/station-map/parse'
import StationMap from './widgets/radio-browser/station-map/StationMap'
import FoxWidget from './widgets/random_fox/random_fox/FoxWidget'
import { parseFox } from './widgets/random_fox/random_fox/parse'

export type Size = { w: number; h: number }

// Props of a legacy widget, one that fetches and polls for itself.
export type WidgetProps = {
    instanceId: string
    params: Record<string, string | number>
    refreshSeconds: number
}

// Props of a widget on the widget base: `data` is already fetched and
// validated by `parse`, so the component only draws it.
export type WidgetViewProps<Data> = {
    instance: Instance
    params: InstanceParams
    data: Data
}

export type WidgetDefinition<Data> = {
    component: ComponentType<WidgetViewProps<Data>>
    /** Turns the raw API data into Data; throws when the shape is unexpected. */
    parse: (raw: unknown) => Data
    defaultSize: Size
    minSize: Size
}

type LegacyEntry = {
    legacy: ComponentType<WidgetProps>
    defaultSize: Size
    minSize: Size
}

export type WidgetEntry = WidgetDefinition<unknown> | LegacyEntry

// Each widget has its own Data type, but the registry holds them all in one
// map. The cast is safe because the shell only ever gives a component the
// value its own `parse` returned.
export function defineWidget<Data>(
    definition: WidgetDefinition<Data>,
): WidgetDefinition<unknown> {
    return definition as unknown as WidgetDefinition<unknown>
}

// Componente placeholder para widgets que aún no tienen componente propio
function DefaultWidget({ params }: WidgetProps) {
    return (
        <div className="text-gray-400 text-sm">
            <p>Widget not implemented yet</p>
            <p className="text-xs mt-1">{JSON.stringify(params)}</p>
        </div>
    )
}

const fallback: WidgetEntry = {
    legacy: DefaultWidget,
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
}

const echo = defineWidget({
    component: EchoWidget,
    parse: parseEcho,
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
})

const stationMap = defineWidget({
    component: StationMap,
    parse: parseStationMap,
    defaultSize: { w: 6, h: 5 },
    minSize: { w: 4, h: 4 },
})

const fox = defineWidget({
    component: FoxWidget,
    parse: parseFox,
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 2, h: 2 },
})

const apod = defineWidget({
    component: ApodWidget,
    parse: parseApod,
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 3, h: 4 },
})

const neo = defineWidget({
    component: NeoWidget,
    parse: parseNeo,
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 3, h: 4 },
})

const freeGames = defineWidget({
    component: FreeGames,
    parse: parseFreeGames,
    defaultSize: { w: 4, h: 6 },
    minSize: { w: 3, h: 4 },
})

const githubNotifications = defineWidget({
    component: NotificationsWidget,
    parse: parseNotifications,
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 3 },
})

// Sized for a whole pack: eleven cards in two rows under the picker.
const boosterOpener = defineWidget({
    component: BoosterOpener,
    parse: parseBoosterOpener,
    defaultSize: { w: 6, h: 7 },
    minSize: { w: 4, h: 5 },
})

// El mapa: cada clave es "serviceId/widgetId"
const entries: Record<string, WidgetEntry> = {
    'radio_browser/station_map': stationMap,
    'mock/echo': echo,
    'mock_key/secret_echo': echo,
    'advice_slip/random_advice': {
        legacy: AdviceWidget,
        defaultSize: { w: 4, h: 2 },
        minSize: { w: 2, h: 1 },
    },
    'random_fox/random_fox': fox,
    'nasa/apod': apod,
    'nasa/neows': neo,
    'github/notifications': githubNotifications,
    'epic_games/free_games': freeGames,
    'pokemon_tcg/booster_opener': boosterOpener,
}

export function getWidgetEntry(
    serviceId: string,
    widgetId: string,
): WidgetEntry {
    return entries[`${serviceId}/${widgetId}`] ?? fallback
}
