import { useQuery } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { renderWithQuery } from './renderWithQuery'

function Greeting() {
    const { data } = useQuery({
        queryKey: ['greeting'],
        queryFn: async () => 'hello',
    })
    return <p>{data ?? 'loading'}</p>
}

test('renderWithQuery gives the component a query client', async () => {
    renderWithQuery(<Greeting />)
    expect(screen.getByText('loading')).toBeInTheDocument()
    expect(await screen.findByText('hello')).toBeInTheDocument()
})

test('a dialog can be opened and closed in tests', () => {
    const dialog = document.createElement('dialog')
    document.body.append(dialog)
    let closed = 0
    dialog.addEventListener('close', () => {
        closed += 1
    })

    dialog.showModal()
    expect(dialog).toHaveAttribute('open')

    dialog.close()
    expect(dialog).not.toHaveAttribute('open')
    expect(closed).toBe(1)
    dialog.remove()
})
