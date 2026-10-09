import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { makeInstance } from '../../../../test/apiMock'
import FactWidget from './FactWidget'

const instance = makeInstance()

function renderWidget(data: {
    text: string
    source: string | null
    sourceUrl: string | null
}) {
    return render(
        <FactWidget instance={instance} params={instance.params} data={data} />,
    )
}

test('shows the fact text', () => {
    renderWidget({ text: 'Honey never spoils.', source: null, sourceUrl: null })

    expect(screen.getByText('Honey never spoils.')).toBeInTheDocument()
})

test('shows the source as a link when there is a url', () => {
    renderWidget({
        text: 'A fact',
        source: 'djtech.net',
        sourceUrl: 'http://example.com',
    })

    const link = screen.getByRole('link', { name: /djtech\.net/ })
    expect(link).toHaveAttribute('href', 'http://example.com')
})

test('shows no source line when there is no source', () => {
    renderWidget({ text: 'A fact', source: null, sourceUrl: null })

    expect(screen.queryByText(/Source/)).not.toBeInTheDocument()
})
