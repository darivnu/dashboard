import type { CatalogParam, InstanceParams } from './types'

export type ParamValues = Record<string, string>
export type ParamErrors = Record<string, string>

export type ValidationResult =
    | { ok: true; params: InstanceParams }
    | { ok: false; errors: ParamErrors }

export function initialValues(
    params: CatalogParam[],
    current: InstanceParams = {},
): ParamValues {
    const values: ParamValues = {}
    for (const param of params) {
        values[param.name] = String(current[param.name] ?? param.default ?? '')
    }
    return values
}

function checkInteger(param: CatalogParam & { type: 'integer' }, text: string) {
    if (!/^-?\d+$/.test(text)) return 'Enter a whole number.'
    const value = Number(text)
    if (param.min !== undefined && value < param.min) {
        return `Must be at least ${param.min}.`
    }
    if (param.max !== undefined && value > param.max) {
        return `Must be at most ${param.max}.`
    }
    return null
}

export function validateParams(
    params: CatalogParam[],
    values: ParamValues,
): ValidationResult {
    const cleaned: InstanceParams = {}
    const errors: ParamErrors = {}

    for (const param of params) {
        const text = (values[param.name] ?? '').trim()
        if (text === '') {
            if (param.required) errors[param.name] = 'This field is required.'
            continue
        }
        if (param.type === 'string') {
            cleaned[param.name] = text
            continue
        }
        const problem = checkInteger(param, text)
        if (problem) {
            errors[param.name] = problem
        } else {
            cleaned[param.name] = Number(text)
        }
    }

    if (Object.keys(errors).length > 0) return { ok: false, errors }
    return { ok: true, params: cleaned }
}
