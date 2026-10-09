import type { WidgetViewProps } from '../../../widgetRegistry'
import type { FactData } from './parse'

export default function FactWidget({ data }: WidgetViewProps<FactData>) {
    return (
        <div className="flex h-full flex-col justify-between gap-2">
            <p className="text-fg text-base">{data.text}</p>
            {data.source &&
                (data.sourceUrl ? (
                    <a
                        href={data.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="self-end text-link text-xs hover:underline"
                    >
                        Source: {data.source}
                    </a>
                ) : (
                    <p className="self-end text-muted text-xs">
                        Source: {data.source}
                    </p>
                ))}
        </div>
    )
}
