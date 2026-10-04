import type { ReactNode } from 'react'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import Spinner from '../ui/Spinner'
import { errorMessage, useCatalog } from './queries'
import type { CatalogService } from './types'

type Props = {
    /** called with the catalog once it has loaded */
    children: (services: CatalogService[]) => ReactNode
}

export default function CatalogLoader({ children }: Props) {
    const catalog = useCatalog()

    if (catalog.isPending) return <Spinner label="Loading widgets" />

    if (catalog.isError) {
        return (
            <Alert
                action={
                    <Button
                        variant="secondary"
                        onClick={() => catalog.refetch()}
                    >
                        Try again
                    </Button>
                }
            >
                {errorMessage(catalog.error)}
            </Alert>
        )
    }

    return children(catalog.data)
}
