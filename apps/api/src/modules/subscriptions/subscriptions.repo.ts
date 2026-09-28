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

//helper funcs:
function ownedBy(userId: string, serviceId: string) {
    return and(
        eq(serviceSubscriptions.userId, userId),
        eq(serviceSubscriptions.serviceId, serviceId)
    )
}

export const subscriptionsRepo: ServiceSubscriptionRepo = {
    //finds a specific subscription for a user and a service
    async find(userId, serviceId) {
        const rows = await db
            .select() //select everything
            .from(serviceSubscriptions) //from the serviceSubscriptions table
            .where(ownedBy(userId, serviceId)) //where the userId and serviceId match
            .limit(1) //limit to 1 result
        return rows[0]
    },

    //lists all subscriptions for a user
    async listByUser(userId) {
        return db
            .select()
            .from(serviceSubscriptions)
            .where(eq(serviceSubscriptions.userId, userId)) //all subscriptions for a user
            .orderBy(asc(serviceSubscriptions.createdAt)) //order by creation date
    },

    //creates or updates a subscription for a user and a service
    async upsert(userId, serviceId, credentials) {
        const rows = await db
            .insert(serviceSubscriptions) //insert into the serviceSubscriptions table
            .values({ userId, serviceId, credentials }) //insert the user ID, service ID, and credentials
            .onConflictDoUpdate({ //if a subscription already exists for this user and service, update it
                target: [serviceSubscriptions.userId, serviceSubscriptions.serviceId], //if a subscription already exists for this user and service, update it
                set: { credentials, updatedAt: new Date() }, //update the credentials and updatedAt timestamp
            })
            .returning()
        return rows[0]! //exclamation mark is a non-null assertion operator, it tells TypeScript that we are sure that rows[0] is not undefined
    },

    //deletes a subscription for a user and a service
    async delete(userId, serviceId) {
        const rows = await db
            .delete(serviceSubscriptions) //delete from the serviceSubscriptions table
            .where(ownedBy(userId, serviceId)) //where the userId and serviceId match
            .returning({ id: serviceSubscriptions.id }) //return the ID of the deleted subscription
        return rows.length > 0 //return true if a subscription was deleted, false otherwise
    },

    async setStatus(userId, serviceId, status) {
        const rows = await db
            .update(serviceSubscriptions) //update the serviceSubscriptions table
            .set({ status, updatedAt: new Date() }) //set the status and updatedAt timestamp
            .where(ownedBy(userId, serviceId)) //where the userId and serviceId match
            .returning()
        return rows[0] //return the updated subscription
    }
}


