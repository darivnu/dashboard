import type { WidgetViewProps } from '../../../widgetRegistry'
import type { EchoData } from './parse'

export default function EchoWidget({ data }: WidgetViewProps<EchoData>) {
    return (
        <div className="text-white text-sm">
            <p className="text-lg font-bold">{data.message}</p>
            {data.count !== undefined && (
                <p className="text-gray-400 text-xs mt-1">
                    Count: {data.count}
                </p>
            )}
        </div>
    )
}
