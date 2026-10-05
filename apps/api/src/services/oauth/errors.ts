/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** errors
*/

import { OAuth2RequestError } from 'arctic'

//kept apart from providers.ts so code that only needs these (the token manager) doesn't load env

//error codes meaning the grant itself is dead (revoked, expired, already used): retrying won't help,
//the user has to connect again. GitHub uses its own "bad_refresh_token" instead of the standard "invalid_grant"
const PERMANENT_CODES = new Set(['invalid_grant', 'bad_refresh_token'])

export function isPermanentOAuthError(error: unknown): boolean {
    return error instanceof OAuth2RequestError && PERMANENT_CODES.has(error.code)
}

//safe description of an error for the logs: the name, plus the OAuth code when there is one
//never log the error object itself, arctic errors can carry the provider's response body
//(arctic doesn't set error.name on its errors, so that one is spelled out)
export function describeOAuthError(error: unknown): string {
    if (error instanceof OAuth2RequestError) return `OAuth2RequestError (${error.code})`
    if (error instanceof Error) return error.name
    return typeof error
}
