import { describe, expect, test } from 'bun:test'
import { buildParamSchema, validateParams } from './params'
import { WidgetFetchError } from './types'
import type { ParamDef } from './types'

const params: ParamDef[] = [
    { name: 'city', type: 'string', label: 'City', required: true },
    { name: 'days', type: 'integer', label: 'Days', default: 5 },
]

function expectInvalidConfig(run: () => unknown): WidgetFetchError {
    try {
        run()
    } catch (error) {
        expect(error).toBeInstanceOf(WidgetFetchError)
        expect((error as WidgetFetchError).code).toBe('invalid_config')
        return error as WidgetFetchError
    }
    throw new Error('expected validateParams to throw')
}

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

    test('drops keys the widget does not declare', () => {
        const result = validateParams(params, { city: 'Paris', days: 3, junk: { nested: true } })

        expect(result).toEqual({ city: 'Paris', days: 3 })
    })

    test('does not modify the input it was given', () => {
        const input = { city: 'Paris', junk: 1 }

        validateParams(params, input)

        expect(input).toEqual({ city: 'Paris', junk: 1 })
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

describe('validateParams with integer bounds', () => {
    const bounded: ParamDef[] = [
        { name: 'limit', type: 'integer', label: 'Limit', default: 200, min: 1, max: 500 },
    ]

    test.each([1, 500])('accepts %i, a bound is inclusive', (limit) => {
        expect(validateParams(bounded, { limit })).toEqual({ limit })
    })

    test.each([0, 501])('throws invalid_config for %i, outside the range', (limit) => {
        const error = expectInvalidConfig(() => validateParams(bounded, { limit }))

        expect(error.message).toContain('limit')
    })

    test('coerces a numeric string that is inside the range', () => {
        expect(validateParams(bounded, { limit: '250' })).toEqual({ limit: 250 })
    })

    test.each(['0', '9999'])('throws invalid_config for the numeric string "%s"', (limit) => {
        expectInvalidConfig(() => validateParams(bounded, { limit }))
    })

    test('applies the default when the param is missing', () => {
        expect(validateParams(bounded, {})).toEqual({ limit: 200 })
    })

    test('a param declaring only min is enforced on that side alone', () => {
        const onlyMin: ParamDef[] = [{ name: 'limit', type: 'integer', label: 'Limit', min: 1 }]

        expectInvalidConfig(() => validateParams(onlyMin, { limit: 0 }))
        expect(validateParams(onlyMin, { limit: 1_000_000 })).toEqual({ limit: 1_000_000 })
    })

    test('a param declaring only max is enforced on that side alone', () => {
        const onlyMax: ParamDef[] = [{ name: 'limit', type: 'integer', label: 'Limit', max: 500 }]

        expectInvalidConfig(() => validateParams(onlyMax, { limit: 501 }))
        expect(validateParams(onlyMax, { limit: -1_000_000 })).toEqual({ limit: -1_000_000 })
    })
})
