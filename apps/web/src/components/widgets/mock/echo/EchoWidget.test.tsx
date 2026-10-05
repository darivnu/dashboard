import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { makeInstance } from '../../../../test/apiMock'
import EchoWidget from './EchoWidget'

const instance = makeInstance()

test('shows the message and the count', () => {
    render(
        <EchoWidget
            instance={instance}
            params={instance.params}
            data={{ message: 'hello', count: 3 }}
        />,
    )
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(screen.getByText('Count: 3')).toBeInTheDocument()
})

test('leaves the count out when there is none', () => {
    render(
        <EchoWidget
            instance={instance}
            params={instance.params}
            data={{ message: 'secret' }}
        />,
    )
    expect(screen.getByText('secret')).toBeInTheDocument()
    expect(screen.queryByText(/Count/)).not.toBeInTheDocument()
})
