import { type FormEvent, useState } from 'react'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import Field from '../ui/Field'
import Input from '../ui/Input'
import { GRID_COLUMNS } from './layout'
import ParamForm from './ParamForm'
import { errorMessage } from './queries'
import type { CatalogParam, CatalogWidget, InstanceParams } from './types'
import {
    initialValues,
    type ParamErrors,
    type ParamValues,
    validateParams,
} from './validateParams'

const MAX_REFRESH_SECONDS = 86_400
const MAX_ROWS = 12

export type InstanceFormValues = {
    title: string | null
    params: InstanceParams
    refreshSeconds: number
    w: number
    h: number
}

type Props = {
    widget: CatalogWidget
    minSize: { w: number; h: number }
    initial: InstanceFormValues
    submitLabel: string
    idPrefix: string
    onSubmit: (values: InstanceFormValues) => Promise<void>
    onCancel: () => void
}

export default function InstanceForm({
    widget,
    minSize,
    initial,
    submitLabel,
    idPrefix,
    onSubmit,
    onCancel,
}: Props) {
    // Refresh interval and size follow the same rules as integer params,
    // so they are described the same way and reuse ParamForm and validateParams.
    const displayFields: CatalogParam[] = [
        {
            name: 'refreshSeconds',
            label: 'Refresh every (seconds)',
            type: 'integer',
            required: true,
            min: widget.refresh.min,
            max: MAX_REFRESH_SECONDS,
        },
        {
            name: 'w',
            label: 'Width (columns)',
            type: 'integer',
            required: true,
            min: minSize.w,
            max: GRID_COLUMNS,
        },
        {
            name: 'h',
            label: 'Height (rows)',
            type: 'integer',
            required: true,
            min: minSize.h,
            max: MAX_ROWS,
        },
    ]

    // A hidden param is one the widget sets by itself (a choice made inside
    // it), so it gets no field here.
    const visibleParams = widget.params.filter((param) => !param.hidden)

    const [title, setTitle] = useState(initial.title ?? '')
    const [paramValues, setParamValues] = useState(() =>
        initialValues(visibleParams, initial.params),
    )
    const [displayValues, setDisplayValues] = useState<ParamValues>({
        refreshSeconds: String(initial.refreshSeconds),
        w: String(initial.w),
        h: String(initial.h),
    })
    const [paramErrors, setParamErrors] = useState<ParamErrors>({})
    const [displayErrors, setDisplayErrors] = useState<ParamErrors>({})
    const [serverError, setServerError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    async function handleSubmit(event: FormEvent) {
        event.preventDefault()
        const params = validateParams(visibleParams, paramValues)
        const display = validateParams(displayFields, displayValues)
        setParamErrors(params.ok ? {} : params.errors)
        setDisplayErrors(display.ok ? {} : display.errors)
        if (!params.ok || !display.ok) return

        setServerError(null)
        setSubmitting(true)
        try {
            await onSubmit({
                title: title.trim() || null,
                // Saving replaces every param, so the hidden ones go back
                // as they were stored; otherwise editing the title would
                // wipe what the widget had saved.
                params: { ...hiddenValues(), ...params.params },
                refreshSeconds: Number(display.params.refreshSeconds),
                w: Number(display.params.w),
                h: Number(display.params.h),
            })
        } catch (error) {
            setServerError(errorMessage(error))
        } finally {
            setSubmitting(false)
        }
    }

    function hiddenValues(): InstanceParams {
        const kept: InstanceParams = {}
        for (const param of widget.params) {
            const value = initial.params[param.name]
            if (param.hidden && value !== undefined) kept[param.name] = value
        }
        return kept
    }

    const titleId = `${idPrefix}-title`

    return (
        <form onSubmit={handleSubmit} noValidate>
            {serverError && <Alert className="mb-3">{serverError}</Alert>}

            <Field label="Title" htmlFor={titleId}>
                <Input
                    id={titleId}
                    value={title}
                    maxLength={100}
                    placeholder={widget.name}
                    onChange={(event) => setTitle(event.target.value)}
                />
            </Field>

            <ParamForm
                idPrefix={`${idPrefix}-param`}
                params={visibleParams}
                values={paramValues}
                errors={paramErrors}
                onChange={(name, value) =>
                    setParamValues((old) => ({ ...old, [name]: value }))
                }
            />

            <ParamForm
                idPrefix={`${idPrefix}-display`}
                params={displayFields}
                values={displayValues}
                errors={displayErrors}
                onChange={(name, value) =>
                    setDisplayValues((old) => ({ ...old, [name]: value }))
                }
            />

            <div className="flex justify-end gap-3 mt-4">
                <Button variant="secondary" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                    {submitLabel}
                </Button>
            </div>
        </form>
    )
}
