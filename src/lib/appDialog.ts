export type AppDialogKind = 'info' | 'warning' | 'error' | 'confirm' | 'prompt' | 'prompt2';

export interface AppDialogRequest {
    kind: AppDialogKind;
    title?: string;
    message: string;
    defaultValue?: string;
    placeholder?: string;
    secondMessage?: string;
    secondDefaultValue?: string;
    secondPlaceholder?: string;
}

export interface AppDialogResponse {
    confirmed: boolean;
    value?: string;
    secondValue?: string;
}

type DialogPresenter = (request: AppDialogRequest) => Promise<AppDialogResponse>;

let presenter: DialogPresenter | null = null;
let queue = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task, task);
    queue = next.then(() => undefined, () => undefined);
    return next;
}

export function registerDialogPresenter(nextPresenter: DialogPresenter) {
    presenter = nextPresenter;
    return () => {
        if (presenter === nextPresenter) {
            presenter = null;
        }
    };
}

function fallback(request: AppDialogRequest): AppDialogResponse {
    if (request.kind === 'confirm') {
        return { confirmed: window.confirm(request.message) };
    }
    if (request.kind === 'prompt') {
        const value = window.prompt(request.message, request.defaultValue || '');
        return { confirmed: value !== null, value: value ?? undefined };
    }
    if (request.kind === 'prompt2') {
        const value = window.prompt(request.message, request.defaultValue || '');
        if (value === null) return { confirmed: false, value: undefined, secondValue: undefined };
        const secondPrompt = request.secondMessage || '';
        const secondValue = window.prompt(secondPrompt, request.secondDefaultValue || '');
        if (secondValue === null) return { confirmed: false, value: undefined, secondValue: undefined };
        return { confirmed: true, value, secondValue };
    }
    window.alert(request.message);
    return { confirmed: true };
}

async function open(request: AppDialogRequest): Promise<AppDialogResponse> {
    if (!presenter) {
        return fallback(request);
    }
    return enqueue(() => presenter!(request));
}

export const appDialog = {
    async info(message: string, title?: string): Promise<void> {
        await open({ kind: 'info', title, message });
    },
    async warning(message: string, title?: string): Promise<void> {
        await open({ kind: 'warning', title, message });
    },
    async error(message: string, title?: string): Promise<void> {
        await open({ kind: 'error', title, message });
    },
    async confirm(message: string, title?: string): Promise<boolean> {
        const result = await open({ kind: 'confirm', title, message });
        return result.confirmed;
    },
    async prompt(message: string, options?: { title?: string; defaultValue?: string; placeholder?: string }): Promise<string | null> {
        const result = await open({
            kind: 'prompt',
            title: options?.title,
            message,
            defaultValue: options?.defaultValue,
            placeholder: options?.placeholder
        });
        if (!result.confirmed) return null;
        return result.value ?? '';
    },
    async prompt2(
        message: string,
        secondMessage: string,
        options?: { title?: string; defaultValue?: string; secondDefaultValue?: string; placeholder?: string; secondPlaceholder?: string }
    ): Promise<{ value: string; secondValue: string } | null> {
        const result = await open({
            kind: 'prompt2',
            title: options?.title,
            message,
            defaultValue: options?.defaultValue,
            placeholder: options?.placeholder,
            secondMessage,
            secondDefaultValue: options?.secondDefaultValue,
            secondPlaceholder: options?.secondPlaceholder
        });
        if (!result.confirmed) return null;
        return {
            value: result.value ?? '',
            secondValue: result.secondValue ?? ''
        };
    }
};
