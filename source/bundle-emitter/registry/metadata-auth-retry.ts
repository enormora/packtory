import type { RegistrySettings } from '../../config/registry-settings.ts';
import {
    buildAuthOptions,
    resolvePublishAuth,
    type AuthResolution,
    type NpmFetchOptions
} from './registry-auth-config.ts';

const unauthorizedStatusCode = 401;
const forbiddenStatusCode = 403;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value instanceof Object;
}

function isAuthFailureStatus(statusCode: unknown): boolean {
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
        const statusCode = isRecord(error) ? error.statusCode : undefined;
        if (!auth.allowsAutomaticRetry || !isAuthFailureStatus(statusCode)) {
            throw error;
        }

        const publishAuth = resolvePublishAuth(registrySettings);
        if (publishAuth.type === 'npm-oidc') {
            throw error;
        }

        return run(buildAuthOptions(publishAuth, registrySettings).options);
    }
}
