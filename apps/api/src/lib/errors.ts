import { Elysia } from 'elysia'

export class AppError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
    ) {
        super(message)
        this.name = 'AppError'
    }
}

export const errorHandler = new Elysia({ name: 'error-handler' })
    .onError({ as: 'global' }, ({ code, error, set}) => {
        if (error instanceof AppError) {
            set.status = error.status
            return { error: error.code, message: error.message }
        }

        if (code == 'VALIDATION') {
            set.status = 400
            return { error: 'VALIDATION', message: error.all[0]?.summary ?? 'Invalid request' }
        }

        if (code == 'PARSE') {
            set.status = 400
            return { error: 'BAD_REQUEST', message: 'Malformed request body' }
        }
        if (code === 'NOT_FOUND') {
            set.status = 404
            return { error: 'NOT_FOUND', message: 'Route not found' }
        }

        console.error(error)
        set.status = 500
        return { error: 'INTERNAL', message: 'Internal server error' }
    })