import { describe, expect, test } from 'bun:test'
import { buildParamSchema, validateParams } from './params'
import { WidgetFetchError } from './types'
import type { ParamDef } from './types'

const params: ParamDef[] = [
    { name: 'city', type: 'string', label: 'City', required: true },
    { name: 'days', type: 'integer', label: 'Days', default: 5 },
]

describe('buildParamSchema', () => {
    test('marks only required: true params as required', () => {
        const schema = buildParamSchema(params)

        expect(schema.required).toEqual(['city'])
    })
})

describe('validateParams', () => {
    test('returns the input when everything is valid', () => {
        expect(validateParams(params, { city: 'Paris', days: 3 })).toEqual({
            city: 'Paris',
            days: 3,
        })
    })

    test('fills in the default for a missing optional param', () => {
        expect(validateParams(params, { city: 'Paris' })).toEqual({
            city: 'Paris',
            days: 5,
        })
    })

    test('coerces a numeric string into a real number for an integer param', () => {
        const result = validateParams(params, { city: 'Paris', days: '3' })

        expect(result.days).toBe(3)
        expect(typeof result.days).toBe('number')
    })

    test('throws invalid_config when a required param is missing', () => {
        try {
            validateParams(params, {})
            throw new Error('expected validateParams to throw')
        } catch (error) {
            expect(error).toBeInstanceOf(WidgetFetchError)
            expect((error as WidgetFetchError).code).toBe('invalid_config')
            expect((error as WidgetFetchError).message).toContain('city')
        }
    })

    test('throws invalid_config when an integer param is not numeric', () => {
        try {
            validateParams(params, { city: 'Paris', days: 'nope' })
            throw new Error('expected validateParams to throw')
        } catch (error) {
            expect(error).toBeInstanceOf(WidgetFetchError)
            expect((error as WidgetFetchError).code).toBe('invalid_config')
            expect((error as WidgetFetchError).message).toContain('days')
        }
    })
})
