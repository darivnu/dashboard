type Props<T extends string> = {
    /** names the group for assistive tech */
    legend: string
    /** shared name so the native radios form one group (arrow keys work) */
    name: string
    options: { value: T; label: string }[]
    value: T
    onChange: (value: T) => void
}

export default function RadioGroup<T extends string>({
    legend,
    name,
    options,
    value,
    onChange,
}: Props<T>) {
    return (
        <fieldset className="min-w-0">
            <legend className="sr-only">{legend}</legend>
            <div className="flex flex-col gap-2">
                {options.map((option) => (
                    <label
                        key={option.value}
                        className="flex w-fit items-center gap-2 text-fg"
                    >
                        <input
                            type="radio"
                            name={name}
                            value={option.value}
                            checked={value === option.value}
                            onChange={() => onChange(option.value)}
                            className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        />
                        {option.label}
                    </label>
                ))}
            </div>
        </fieldset>
    )
}
