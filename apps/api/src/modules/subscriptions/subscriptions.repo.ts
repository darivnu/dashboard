/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** subscriptions.repo
*/

import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { serviceSubscriptions } from '../../db/schema'
import type { subscriptionStatus } from '../../db/schema'

export type ServiceSubscriptionInstance = typeof serviceSubscriptions.$inferSelect
export type SubscriptionStatus = typeof serviceSubscriptions.$inferSelect['status']

export interface ServiceSubscriptionRepo {
    find(userId: string, serviceId: string): Promise<ServiceSubscriptionInstance | undefined> //find a subscription for a user and a service
    listByUser(userId: string): Promise<ServiceSubscriptionInstance[]> //all subscriptions for a user
    upsert(userId: string, serviceId: string, credentials: Record<string, unknown>): Promise<ServiceSubscriptionInstance> //create or update a subscription for a user and a service
    delete(userId: string, serviceId: string): Promise<boolean> //delete a subscription for a user and a service
    setStatus(userId: string, serviceId: string, status: SubscriptionStatus): Promise<ServiceSubscriptionInstance | undefined> //update the status of a subscription for a user and a service
}

export const subscriptionsRepo: ServiceSubscriptionRepo = {
    
}


