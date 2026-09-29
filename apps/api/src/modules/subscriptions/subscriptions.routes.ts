/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** makes the routs for frontend to call
*/


import { Elysia, t } from 'elysia'
import { Type } from '@sinclair/typebox'
import { createTtlCache } from '../../lib/cache'
import { httpClient } from '../../lib/http'
import { auth } from '../../plugins/session'
import { subscriptionsRepo } from './subscriptions.repo'
import { createSubscriptionsService } from './subscriptions.service'
import type { ServiceSubscriptionInstance } from './subscriptions.repo'

const service = createSubscriptionsService(subscriptionsRepo)

//we romove the credentials from the response, because we don't want to expose them to the frontend

function toSubscription(row: ServiceSubscriptionInstance) {
    const { credentials, ...rest } = row //autocmplete put this, if true, then ballers
    return rest
}

//ngl i have 0 clue what is going on here.
export const subscriptionsRoutes = new Elysia(
    {
        prefix: '/subscriptions',
        detail: { tags: ['Subscriptions'], security: [{ cookieAuth: [] }] }
    }).use(auth) //use the auth plugin to get the userId from the session
    .get('/', async ({ user }) => ({subscriptions: (await service.list(user.id)).map(toSubscription)}),
    {auth: true, response: {200: t.Object({subscriptions: t.Array(t.Object({userId: t.String(), serviceId: t.String(), status: t.String(), createdAt: t.String(), updatedAt: t.String()}))})}}) //list all subscriptions for the user

