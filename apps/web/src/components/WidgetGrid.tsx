import type { CSSProperties } from 'react'
import { GRID_COLUMNS, sortByPosition } from './dashboard/layout'
import type { Instance } from './dashboard/types'
import WidgetShell from './dashboard/WidgetShell'

type Props = {
    instances: Instance[]
    onEdit: (instance: Instance) => void
    onDelete: (instance: Instance) => void
    onMove: (instance: Instance, direction: 'left' | 'right') => void
    onSetApiKey: (instance: Instance) => void
}

export default function WidgetGrid({
    instances,
    onEdit,
    onDelete,
    onMove,
    onSetApiKey,
}: Props) {
    if (instances.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center mt-20 gap-3">
                <span className="text-5xl">📋</span>
                <p className="text-gray-400 text-lg">No widgets yet</p>
                <p className="text-gray-500 text-sm">Click "Add Widget" to get started</p>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 auto-rows-[96px] gap-4">
            {sortByPosition(instances).map((instance) => (
                <div
                    key={instance.id}
                    className="md:col-span-(--w) row-span-(--h) min-h-0"
                    style={
                        {
                            '--w': Math.min(instance.w, GRID_COLUMNS),
                            '--h': instance.h,
                        } as CSSProperties
                    }
                >
                    <WidgetShell
                        instance={instance}
                        onEdit={() => onEdit(instance)}
                        onDelete={() => onDelete(instance)}
                        onMove={(direction) => onMove(instance, direction)}
                        onSetApiKey={() => onSetApiKey(instance)}
                    />
                </div>
            ))}
        </div>
    )
}