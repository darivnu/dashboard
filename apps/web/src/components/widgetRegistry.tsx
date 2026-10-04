import type { ComponentType } from 'react'
import type { Instance, InstanceParams } from './dashboard/types'
import AdviceWidget from './widgets/AdviceWidget'
import EchoWidget from './widgets/mock/echo/EchoWidget'
import { parseEcho } from './widgets/mock/echo/parse'
import { parseStationMap } from './widgets/radio-browser/station-map/parse'
import StationMap from './widgets/radio-browser/station-map/StationMap'

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

// El mapa: cada clave es "serviceId/widgetId"
const entries: Record<string, WidgetEntry> = {
    'radio_browser/station_map': stationMap,
    'mock/echo': echo,
    'mock_key/secret_echo': echo,
    'advice_slip/random_advice': {
        legacy: AdviceWidget,
        defaultSize: { w: 4, h: 3 },
        minSize: { w: 2, h: 2 },
    },
}

export function getWidgetEntry(
    serviceId: string,
    widgetId: string,
): WidgetEntry {
    return entries[`${serviceId}/${widgetId}`] ?? fallback
}
