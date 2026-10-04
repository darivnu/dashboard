import Field, { describedBy } from '../ui/Field'
import Input from '../ui/Input'
import type { CatalogParam } from './types'
import type { ParamErrors, ParamValues } from './validateParams'

type Props = {
    params: CatalogParam[]
    values: ParamValues
    errors: ParamErrors
    onChange: (name: string, value: string) => void
    idPrefix: string
}

function hintFor(param: CatalogParam) {
    if (param.type !== 'integer') return undefined
    const { min, max } = param
    if (min !== undefined && max !== undefined) {
        return `Between ${min} and ${max}.`
    }
    if (min !== undefined) return `At least ${min}.`
    if (max !== undefined) return `At most ${max}.`
    return undefined
}

export default function ParamForm({
    params,
    values,
    errors,
    onChange,
    idPrefix,
}: Props) {
    if (params.length === 0) {
        return (
            <p className="text-gray-400 text-sm mb-3">
                This widget has no settings.
            </p>
        )
    }

    return (
        <>
            {params.map((param) => {
                const id = `${idPrefix}-${param.name}`
                const error = errors[param.name]
                const hint = hintFor(param)
                const isInteger = param.type === 'integer'
                return (
                    <Field
                        key={param.name}
                        label={param.label}
                        htmlFor={id}
                        required={param.required}
                        error={error}
                        hint={hint}
                    >
                        <Input
                            id={id}
                            type={isInteger ? 'number' : 'text'}
                            min={isInteger ? param.min : undefined}
                            max={isInteger ? param.max : undefined}
                            value={values[param.name] ?? ''}
                            onChange={(event) =>
                                onChange(param.name, event.target.value)
                            }
                            invalid={Boolean(error)}
                            aria-describedby={describedBy(id, { error, hint })}
                        />
                    </Field>
                )
            })}
        </>
    )
}
