import { Component, type ReactNode } from 'react'
import Alert from '../ui/Alert'
import Button from '../ui/Button'

type Props = {
    children: ReactNode
    /** called when the user asks to reload, after the widget has been reset */
    onReload?: () => void
    /** when this value changes (new data arrived), a failed widget is tried again */
    resetKey?: unknown
}

type State = { failed: boolean }

// Catches an error thrown while rendering the widget inside it, so that one
// broken widget shows a message instead of taking the whole dashboard down.
// React only offers this through a class component.
export default class WidgetErrorBoundary extends Component<Props, State> {
    state: State = { failed: false }

    static getDerivedStateFromError(): State {
        return { failed: true }
    }

    componentDidUpdate(previous: Props) {
        if (this.state.failed && previous.resetKey !== this.props.resetKey) {
            this.setState({ failed: false })
        }
    }

    reload = () => {
        this.setState({ failed: false })
        this.props.onReload?.()
    }

    render() {
        if (this.state.failed) {
            return (
                <Alert
                    action={
                        <Button variant="secondary" onClick={this.reload}>
                            Reload widget
                        </Button>
                    }
                >
                    This widget hit a problem.
                </Alert>
            )
        }
        return this.props.children
    }
}
