import type { RegistrySettings } from '../../configuration/registry-settings.ts';
import {
    buildAuthenticationOptions,
    resolvePublishAuthentication,
    type AuthenticationResolution
} from './registry-authentication-configuration.ts';

const unauthorizedStatusCode = 401;
const forbiddenStatusCode = 403;

function isAuthenticationFailure(error: unknown): boolean {
    const statusCode = error instanceof Object && Object.hasOwn(error, 'statusCode')
        ? (error as { readonly statusCode?: unknown; }).statusCode
        : undefined;
    return statusCode === forbiddenStatusCode || statusCode === unauthorizedStatusCode;
}

export async function retryWithFallbackAuthentication<T>(
    registrySettings: Readonly<RegistrySettings>,
    authentication: AuthenticationResolution,
    run: (authentication: AuthenticationResolution) => Promise<T>
): Promise<T> {
    try {
        return await run(authentication);
    } catch (error: unknown) {
        if (!authentication.allowsAutomaticRetry || !isAuthenticationFailure(error)) {
            throw error;
        }

        const publishAuthentication = resolvePublishAuthentication(registrySettings);
        if (publishAuthentication.type === 'npm-open-identity-connect') {
            throw error;
        }

        return run(buildAuthenticationOptions(publishAuthentication, registrySettings));
    }
}
