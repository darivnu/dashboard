import { t } from 'elysia'
import type { TSchema } from '@sinclair/typebox'
import { TransformDecodeCheckError, Value } from '@sinclair/typebox/value'
import type { ParamDef, WidgetParams } from './types'
import { WidgetFetchError } from './types'

function paramValueSchema(param: ParamDef): TSchema {
    if (param.type === 'string') {
        return t.String(param.default !== undefined ? { default: param.default } : {})
    }
    return t.Integer(param.default !== undefined ? { default: param.default } : {})
}

export function buildParamSchema(params: ParamDef[]) {
    const properties: Record<string, TSchema> = {}

    for (const param of params) {
        const schema = paramValueSchema(param)
        properties[param.name] = param.required ? schema : t.Optional(schema)
    }

    return t.Object(properties)
}

/**
 * Returns only the declared params: unknown keys are dropped, defaults are
 * applied and numeric strings become integers. Works on a copy, so the
 * caller's `input` is never modified.
 */
export function validateParams(params: ParamDef[], input: unknown): WidgetParams {
    const schema = buildParamSchema(params)
    const declaredOnly = Value.Clean(schema, Value.Clone(input))
    const withDefaults = Value.Default(schema, declaredOnly)

    try {
        return Value.Decode(schema, withDefaults) as WidgetParams
    } catch (cause) {
        const message = cause instanceof TransformDecodeCheckError
            ? `${cause.error.path || '(root)'}: ${cause.error.message}`
            : 'Invalid widget parameters'
        throw new WidgetFetchError('invalid_config', message, { cause })
    }
}
