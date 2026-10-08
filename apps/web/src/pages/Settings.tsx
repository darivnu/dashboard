import AppShell from '../components/layout/AppShell'
import Button from '../components/ui/Button'
import { type Theme, useTheme } from '../theme'

const OPTIONS: { value: Theme; label: string }[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
]

export default function Settings() {
    const { theme, setTheme } = useTheme()

    return (
        <AppShell>
            <div className="mx-auto max-w-3xl">
                <h1 className="mb-6 text-2xl font-bold text-fg">Settings</h1>

                <section aria-labelledby="settings-appearance">
                    <h2
                        id="settings-appearance"
                        className="mb-3 text-lg font-semibold text-fg"
                    >
                        Appearance
                    </h2>
                    <div className="rounded-xl bg-surface p-4">
                        <p className="mb-3 text-sm text-muted">Theme</p>
                        <fieldset aria-label="Theme" className="flex gap-2">
                            {OPTIONS.map(({ value, label }) => (
                                <Button
                                    key={value}
                                    variant={
                                        theme === value
                                            ? 'primary'
                                            : 'secondary'
                                    }
                                    aria-pressed={theme === value}
                                    onClick={() => setTheme(value)}
                                >
                                    {label}
                                </Button>
                            ))}
                        </fieldset>
                    </div>
                </section>
            </div>
        </AppShell>
    )
}
