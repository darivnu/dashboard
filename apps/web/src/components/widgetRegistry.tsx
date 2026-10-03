import type { ComponentType } from 'react'
import EchoWidget from './widgets/EchoWidget'
import AdviceWidget from './widgets/AdviceWidget'

export type WidgetProps = {
    instanceId: string
    params: Record<string, string | number>
    refreshSeconds: number
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

// El mapa: cada clave es "serviceId/widgetId", el valor es el componente React
const registry: Record<string, ComponentType<WidgetProps>> = {
    'mock/echo': EchoWidget,
    'advice_slip/random_advice': AdviceWidget,
}

export function getWidgetComponent(serviceId: string, widgetId: string): ComponentType<WidgetProps> {
    return registry[`${serviceId}/${widgetId}`] ?? DefaultWidget
}