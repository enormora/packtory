import type { RegistrySettings } from '../../config/registry-settings.ts';
import {
    buildAuthOptions,
    resolvePublishAuth,
    type AuthResolution,
    type NpmFetchOptions
} from './registry-auth-config.ts';

const unauthorizedStatusCode = 401;
const forbiddenStatusCode = 403;

function isAuthFailure(error: unknown): boolean {
    const statusCode = error instanceof Object && Object.hasOwn(error, 'statusCode')
        ? (error as { readonly statusCode?: unknown; }).statusCode
        : undefined;
    return statusCode === forbiddenStatusCode || statusCode === unauthorizedStatusCode;
}

export async function retryWithFallbackAuth<T>(
    registrySettings: Readonly<RegistrySettings>,
    auth: AuthResolution,
    run: (options: NpmFetchOptions) => Promise<T>
): Promise<T> {
    try {
        return await run(auth.options);
    } catch (error: unknown) {
        if (!auth.allowsAutomaticRetry || !isAuthFailure(error)) {
            throw error;
        }

        const publishAuth = resolvePublishAuth(registrySettings);
        if (publishAuth.type === 'npm-oidc') {
            throw error;
        }

        return run(buildAuthOptions(publishAuth, registrySettings).options);
    }
}
