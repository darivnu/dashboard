import AppShell from '../components/layout/AppShell'
import RadioGroup from '../components/ui/RadioGroup'
import { TEXT_SIZES, useTextSize } from '../textSize'
import { type Theme, useTheme } from '../theme'

const THEME_OPTIONS: { value: Theme; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
]

export default function Settings() {
    const { theme, setTheme } = useTheme()
    const { textSize, setTextSize } = useTextSize()

    return (
        <AppShell>
            <div className="mx-auto max-w-3xl">
                <h1 className="mb-6 text-2xl font-bold text-fg">Settings</h1>

                <section aria-labelledby="settings-text-size" className="mb-8">
                    <h2
                        id="settings-text-size"
                        className="mb-3 text-lg font-semibold text-fg"
                    >
                        Text size
                    </h2>
                    <div className="rounded-xl bg-surface p-4">
                        <RadioGroup
                            legend="Text size"
                            name="text-size"
                            options={TEXT_SIZES}
                            value={textSize}
                            onChange={setTextSize}
                        />
                    </div>
                </section>

                <section aria-labelledby="settings-theme">
                    <h2
                        id="settings-theme"
                        className="mb-3 text-lg font-semibold text-fg"
                    >
                        Theme
                    </h2>
                    <div className="rounded-xl bg-surface p-4">
                        <RadioGroup
                            legend="Theme"
                            name="theme"
                            options={THEME_OPTIONS}
                            value={theme}
                            onChange={setTheme}
                        />
                    </div>
                </section>
            </div>
        </AppShell>
    )
}
