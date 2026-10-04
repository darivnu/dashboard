import type { Treaty } from '@elysiajs/eden'
import type { api } from '../../api'

type InstanceRoutes = ReturnType<typeof api.dashboard.instances>

export type Instance = Treaty.Data<
    typeof api.dashboard.instances.get
>['instances'][number]

export type InstanceParams = Instance['params']

export type CatalogService = Treaty.Data<
    typeof api.catalog.get
>['services'][number]

export type CatalogWidget = CatalogService['widgets'][number]

export type CatalogParam = CatalogWidget['params'][number]

export type WidgetDataResponse = Treaty.Data<InstanceRoutes['data']['get']>

export type WidgetErrorCode = Extract<WidgetDataResponse, { ok: false }>['code']

export type CreateInstanceBody = Parameters<
    typeof api.dashboard.instances.post
>[0]

export type UpdateInstanceBody = Parameters<InstanceRoutes['patch']>[0]

export type LayoutItem = Parameters<
    typeof api.dashboard.layout.patch
>[0][number]
