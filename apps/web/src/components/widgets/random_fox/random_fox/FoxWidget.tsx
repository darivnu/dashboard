/*
 ** EPITECH PROJECT, 2026
 ** dashboard
 ** File description:
 ** FoxWidget
 */

import type { WidgetViewProps } from '../../../widgetRegistry'
import type { FoxData } from './parse'

export default function FoxWidget({ data }: WidgetViewProps<FoxData>) {
    return (
        <img
            src={data.image}
            alt="Random fox"
            className="w-full rounded-lg object-cover"
        />
    )
}
