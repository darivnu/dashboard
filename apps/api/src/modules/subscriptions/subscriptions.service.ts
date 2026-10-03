/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** These are the rules for the subscriptions repo, which is responsible for managing subscriptions in the database.
*/

import { AppError } from '../../lib/errors'
import { validateParams } from '../../services/params'
import { registry } from '../../services/registry'
import { WidgetFetchError } from '../../services/types'
import type { ServiceSubscriptionRepo, ServiceSubscriptionInstance } from './subscriptions.repo'

export function createSubscriptionsService(repo: ServiceSubscriptionRepo) {
    return {
        //service methods here

        //lists all subscriptions for a user
        async list(userId: string){
            return repo.listByUser(userId)
        },

        //subscribes a user to a service
        async subscribe(userId: string, serviceId: string, credentials: Record<string, unknown>) {
            const service = registry.getService(serviceId) //get the service from the registry

            if (!service) {
                throw new AppError(404, 'NOT_FOUND', "This service does not exist.") //if the service is not found, throw an error (cannot register to an inexistant service)
            }
            if (service.auth.kind !== 'apiKey') { //TODO: oath2
                 throw new AppError(400, 'NOT_API_KEY', 'This service does not use an API key') //
            }

            //validate the credentials; keep the cleaned copy (unknown keys dropped, defaults filled in)
            let validated: Record<string, unknown>
            try {
                validated = validateParams(service.auth.fields, credentials)
            } catch (error) {
                if (error instanceof WidgetFetchError) {
                    throw new AppError(400, 'INVALID_CREDENTIALS', error.message)
                }
                throw error
            }

            return repo.upsert(userId, serviceId, validated) //create or update the subscription
        },

        async unsubscribe(userId: string, serviceId: string) {
            const deleted = await repo.delete(userId, serviceId)

            if (!deleted) {
                throw new AppError(404, 'NOT_FOUND', "This subscription does not exist.") //if the subscription is not found, throw an error
            }
        }
    }
}