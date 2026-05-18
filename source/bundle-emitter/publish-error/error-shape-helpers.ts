export type ErrorLike = { readonly message: string; readonly code?: unknown };

export function isRecord(value: unknown): value is Record<string, unknown> {
    return value instanceof Object;
}

export function isErrorLike(error: unknown): error is ErrorLike {
    return isRecord(error) && typeof error.message === 'string';
}

export function ensureError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}
