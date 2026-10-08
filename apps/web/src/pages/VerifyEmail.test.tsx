import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { apiMock, fail, ok, resetApiMock } from '../test/apiMock'
import VerifyEmail from './VerifyEmail'

vi.mock('../api', async () => (await import('../test/apiMock')).apiModule)

const confirmation = /a new link is on its way/

/** `search` is the query string of the link, e.g. `?token=abc` */
function renderVerifyEmail(search = '') {
    return render(
        <MemoryRouter initialEntries={[`/verify-email${search}`]}>
            <VerifyEmail />
        </MemoryRouter>,
    )
}

async function resend(email = 'me@example.com') {
    await userEvent.type(screen.getByLabelText('Email'), email)
    await userEvent.click(
        screen.getByRole('button', { name: 'Send a new link' }),
    )
}

beforeEach(() => {
    resetApiMock()
})

test('a valid token verifies the email and links to the login page', async () => {
    apiMock.verifyEmail.mockResolvedValue(ok({ ok: true }))
    renderVerifyEmail('?token=abc')

    expect(
        await screen.findByRole('heading', { name: 'Email verified' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
        'href',
        '/login',
    )
    expect(apiMock.verifyEmail).toHaveBeenCalledWith({ token: 'abc' })
})

test('a rejected token offers a new link', async () => {
    apiMock.verifyEmail.mockResolvedValue(
        fail(400, 'INVALID_TOKEN', 'Invalid or expired token'),
    )
    renderVerifyEmail('?token=old')

    expect(
        await screen.findByRole('heading', {
            name: 'This link is invalid or has expired',
        }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
})

test('a link without a token is invalid and sends nothing', () => {
    renderVerifyEmail()

    expect(
        screen.getByRole('heading', {
            name: 'This link is invalid or has expired',
        }),
    ).toBeInTheDocument()
    expect(apiMock.verifyEmail).not.toHaveBeenCalled()
})

test('the resend field is reachable by its label and keeps its constraints', () => {
    renderVerifyEmail()
    const email = screen.getByLabelText('Email')
    expect(email).toHaveAttribute('type', 'email')
    expect(email).toHaveAttribute('autocomplete', 'email')
    expect(email).toBeRequired()
    expect(email).toHaveAttribute('maxlength', '254')
})

test('a resend replaces the form with the confirmation', async () => {
    apiMock.resendVerification.mockResolvedValue(ok({ ok: true }))
    renderVerifyEmail()

    await resend()

    expect(await screen.findByText(confirmation)).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(apiMock.resendVerification).toHaveBeenCalledWith({
        email: 'me@example.com',
    })
})

test('a refused resend shows the message of the API instead of the confirmation', async () => {
    apiMock.resendVerification.mockResolvedValue(
        fail(429, 'RATE_LIMITED', 'Too many requests, try again later'),
    )
    renderVerifyEmail()

    await resend()

    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Too many requests, try again later',
    )
    expect(screen.queryByText(confirmation)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('me@example.com')
})

test('a resend that never reaches the server says so', async () => {
    apiMock.resendVerification.mockRejectedValue(
        new TypeError('Failed to fetch'),
    )
    renderVerifyEmail()

    await resend()

    expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't reach the dashboard server.",
    )
    expect(screen.queryByText(confirmation)).not.toBeInTheDocument()
})

test('a resend can be tried again after a failure', async () => {
    apiMock.resendVerification.mockRejectedValueOnce(
        new TypeError('Failed to fetch'),
    )
    renderVerifyEmail()
    await resend()
    await screen.findByRole('alert')

    apiMock.resendVerification.mockResolvedValue(ok({ ok: true }))
    await userEvent.click(
        screen.getByRole('button', { name: 'Send a new link' }),
    )

    expect(await screen.findByText(confirmation)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('the resend button is disabled while the request is pending', async () => {
    let answer: (value: unknown) => void = () => {}
    apiMock.resendVerification.mockReturnValue(
        new Promise((resolve) => {
            answer = resolve
        }),
    )
    renderVerifyEmail()
    const button = screen.getByRole('button', { name: 'Send a new link' })

    await resend()
    expect(button).toBeDisabled()
    // Enter in a field submits the form without going through the button.
    fireEvent.submit(button.closest('form') as HTMLFormElement)

    answer(ok({ ok: true }))
    expect(await screen.findByText(confirmation)).toBeInTheDocument()
    expect(apiMock.resendVerification).toHaveBeenCalledTimes(1)
})
