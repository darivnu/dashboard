/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** makes the routs for frontend to call
*/

// This file is the "waiter" of the subscriptions module: it receives HTTP
// requests from the frontend, checks that they look OK, hands them to the
// service (the "chef" that knows the rules) and sends back the answer.
//
// The three routes (all under /api/subscriptions, because app.ts adds /api):
//   GET    /api/subscriptions            → list my subscriptions
//   POST   /api/subscriptions/:service   → subscribe (or replace my API key)
//   DELETE /api/subscriptions/:service   → unsubscribe

// `Elysia` is the web framework, `t` is how Elysia describes the shape of data
// (a "schema"). Elysia checks every request against these schemas and answers
// 400 by itself when something does not match, so we don't have to.
import { Elysia, t } from 'elysia'
import { auth } from '../../plugins/session' //login check; gives us `user` in the handlers
import { subscriptionsRepo } from './subscriptions.repo'
import { createSubscriptionsService } from './subscriptions.service'
import type { ServiceSubscriptionInstance } from './subscriptions.repo' //`import type` = only used for TypeScript types, removed when the code runs

// Build the service once, giving it the real database repo. (In tests, the repo
// is swapped for a fake one that stores rows in an array.)
const service = createSubscriptionsService(subscriptionsRepo)

// ---------------------------------------------------------------------------
// Schemas: what the data going in and out must look like
// ---------------------------------------------------------------------------

// The `:service` part of the URL. For /subscriptions/stocks, params.service = 'stocks'.
const serviceParams = t.Object({
    service: t.String({ minLength: 1, maxLength: 64, description: 'Service id from the catalog', examples: ['stocks'] }),
})

// What ONE subscription looks like in a response.
// There is no `credentials` field on purpose: Elysia removes every field that is
// not listed in the response schema, so even if a bug sent the whole database
// row, the API key would still be cut out. That's our second safety net
// (the first one is toSubscription() below).
const subscriptionSchema = t.Object({
    serviceId: t.String({ examples: ['stocks'] }),
    // t.Union = "one of these". These are the 3 values of the status enum in db/schema.ts.
    status: t.Union([t.Literal('active'), t.Literal('needs_reauth'), t.Literal('revoked')]),
    // t.Date() and not t.String(): the database gives us real Date objects.
    // Elysia turns them into text like "2026-09-29T10:00:00.000Z" when sending JSON.
    createdAt: t.Date(),
    updatedAt: t.Date(),
}, { description: 'One of the current user\'s service subscriptions. Credentials are never returned' })

// GET / answers { subscriptions: [ ...one object per subscription... ] }
const subscriptionListSchema = t.Object({
    subscriptions: t.Array(subscriptionSchema),
}, { description: 'The current user\'s subscriptions, oldest first' })

// The body of POST /:service, e.g. { "apiKey": "abc123" }.
// We can't know the exact fields here, because every service asks for different
// ones (auth.fields in its definition). So this schema only blocks obviously
// bad stuff (objects inside objects, huge strings, 1000 keys...). The real,
// per-service check is done in subscriptions.service.ts.
// t.Record(key, value) = "an object with any keys, where every value is ..."
const credentialsBody = t.Record(
    t.String({ maxLength: 64 }), //the keys: field names
    t.Union([t.String({ maxLength: 500 }), t.Number()]), //the values: text or number
    {
        maxProperties: 50,
        description: 'Credentials keyed by the service\'s auth.fields names (see GET /api/catalog)',
        examples: [{ apiKey: 'your-key' }],
    },
)

// DELETE answers { ok: true }
const okSchema = t.Object({ ok: t.Literal(true) })

// Every error in the app looks like this (built by lib/errors.ts from an AppError).
const errorSchema = t.Object({
    error: t.String({ examples: ['NOT_FOUND'] }),
    message: t.String({ examples: ['This subscription does not exist.'] }),
}, { description: 'Error envelope produced by the global error handler' })

// ---------------------------------------------------------------------------
// Turning a database row into a response
// ---------------------------------------------------------------------------

//we romove the credentials from the response, because we don't want to expose them to the frontend
function toSubscription(row: ServiceSubscriptionInstance) {
    const { credentials, id, userId, ...rest } = row //autocmplete put this, if true, then ballers
    return rest
}

// ---------------------------------------------------------------------------
// The routes
// ---------------------------------------------------------------------------

//ngl i have 0 clue what is going on here.
export const subscriptionsRoutes = new Elysia(
    {
        prefix: '/subscriptions', //every path below starts with /subscriptions
        detail: { tags: ['Subscriptions'], security: [{ cookieAuth: [] }] } //only for the API docs page
    }).use(auth) //use the auth plugin to get the userId from the session
    // .model() gives our schemas names, so the routes can say 'subscriptions.list'
    // instead of repeating the whole schema. The names also show up in the API docs.
    .model({
        'subscriptions.subscription': subscriptionSchema,
        'subscriptions.list': subscriptionListSchema,
        'subscriptions.credentialsBody': credentialsBody,
        'subscriptions.ok': okSchema,
        'subscriptions.error': errorSchema,
    })

    // GET /subscriptions: list all subscriptions for the user
    // `({ user })` picks `user` out of the request info Elysia gives us (destructuring again!).
    .get('/', async ({ user }) => {
        const rows = await service.list(user.id) //only rows WHERE userId = me, so nobody sees other people's
        return { subscriptions: rows.map(toSubscription) } //.map runs toSubscription on every row
    }, {
        auth: true, //must be logged in, otherwise 401 (and `user` would not exist)
        response: { //one schema per possible HTTP status code
            200: 'subscriptions.list',
            401: 'subscriptions.error',
        },
        detail: { //text for the API docs page
            summary: 'List my service subscriptions',
            description: 'Returns only the subscriptions of the authenticated user, without credentials.',
        },
    })

    // POST /subscriptions/:service: subscribe to a service (or replace my key)
    // `params` = the pieces of the URL, `body` = the JSON the frontend sent.
    .post('/:service', async ({ user, params, body }) => {
        // All the rules (unknown service → 404, not apiKey → 400, bad fields → 400)
        // are in the service. If one fails, it throws an AppError, and the global
        // error handler (lib/errors.ts) turns it into the right HTTP answer.
        const row = await service.subscribe(user.id, params.service, body)
        return toSubscription(row) //never send the row itself: it contains the API key!
    }, {
        auth: true,
        params: serviceParams,
        body: 'subscriptions.credentialsBody',
        response: {
            200: 'subscriptions.subscription',
            400: 'subscriptions.error',
            401: 'subscriptions.error',
            404: 'subscriptions.error',
        },
        detail: {
            summary: 'Subscribe to an apiKey service',
            description: 'The body is checked against the service\'s auth.fields. Subscribing again replaces the credentials and resets the status to active. 404 for an unknown service, 400 for a service that is not apiKey or for missing/invalid fields.',
        },
    })

    // DELETE /subscriptions/:service: unsubscribe (deletes the row and the key with it)
    .delete('/:service', async ({ user, params }) => {
        // If the row doesn't exist OR belongs to someone else, the service throws a 404.
        // Both look the same from outside, so nobody can guess what others subscribed to.
        await service.unsubscribe(user.id, params.service)
        return { ok: true }
    }, {
        auth: true,
        params: serviceParams,
        response: {
            200: 'subscriptions.ok',
            400: 'subscriptions.error',
            401: 'subscriptions.error',
            404: 'subscriptions.error',
        },
        detail: {
            summary: 'Unsubscribe from a service',
            description: 'Deletes the subscription and its credentials. A subscription that does not exist and one that belongs to someone else both answer 404.',
        },
    })
