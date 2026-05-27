import { isErrorLike } from './error-shape-helpers.ts';
import {
    buildUnsupportedProviderMessage,
    githubActionsIdTokenMessage,
    gitlabSigstoreIdTokenMessage,
    unsupportedProviderMarker
} from './publish-error-messages.ts';

function getCiName(message: string): string {
    const providerSection = message
        .slice(message.indexOf(unsupportedProviderMarker) + unsupportedProviderMarker.length)
        .trimStart();
    if (providerSection === '') {
        return 'unknown';
    }

    const providerEnd = providerSection.search(/\s/u);
    return providerEnd === -1 ? providerSection : providerSection.slice(0, providerEnd);
}

export function matchAutoModeError(error: unknown): Error | undefined {
    if (!isErrorLike(error)) {
        return undefined;
    }

    const { message } = error;
    if (message.includes(unsupportedProviderMarker)) {
        return new Error(buildUnsupportedProviderMessage(getCiName(message)), { cause: error });
    }
    if (message.includes('"write" access to the "id-token" permission')) {
        return new Error(githubActionsIdTokenMessage, { cause: error });
    }
    if (message.includes('SIGSTORE_ID_TOKEN')) {
        return new Error(gitlabSigstoreIdTokenMessage, { cause: error });
    }
    return undefined;
}
