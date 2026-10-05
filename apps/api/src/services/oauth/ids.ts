/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** ids
*/

//the list of OAuth providers the API knows how to talk to
//kept in its own file with no env import, so the registry and the tests can use it without loading config
export const OAUTH_PROVIDER_IDS = ['github'] as const

export type OAuthProviderId = typeof OAUTH_PROVIDER_IDS[number]

export function isOAuthProviderId(value: string): value is OAuthProviderId {
    return (OAUTH_PROVIDER_IDS as readonly string[]).includes(value)
}
