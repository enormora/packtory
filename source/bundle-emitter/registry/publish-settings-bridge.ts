import type { PublishSettings } from '../../config/publish-settings.ts';
import { matchAutoModeError } from '../publish-error/auto-mode-error-matching.ts';
import { ensureError } from '../publish-error/error-shape-helpers.ts';
import { matchFileModeError } from '../publish-error/file-mode-error-matching.ts';

type PublishProvenanceOptions = { readonly provenance: true } | { readonly provenanceFile: string };

type PublishOptionsForLibnpmpublish = Partial<PublishProvenanceOptions> & {
    readonly access: 'public' | 'restricted';
};

export function buildPublishOptionsForPublishSettings(
    publishSettings: Readonly<PublishSettings>
): PublishOptionsForLibnpmpublish {
    if (publishSettings.access === 'restricted') {
        return { access: 'restricted' };
    }
    if (publishSettings.provenance === undefined) {
        return { access: 'public' };
    }
    if (publishSettings.provenance.type === 'auto') {
        return { access: 'public', provenance: true };
    }
    return { access: 'public', provenanceFile: publishSettings.provenance.path };
}

function getProvenanceFilePath(publishSettings: Readonly<PublishSettings>): string | undefined {
    if (publishSettings.access !== 'public') {
        return undefined;
    }
    if (publishSettings.provenance?.type !== 'file') {
        return undefined;
    }
    return publishSettings.provenance.path;
}

export function remapPublishError(error: unknown, publishSettings: Readonly<PublishSettings>): Error {
    const autoModeError = matchAutoModeError(error);
    if (autoModeError !== undefined) {
        return autoModeError;
    }

    const filePath = getProvenanceFilePath(publishSettings);
    if (filePath !== undefined) {
        const fileModeError = matchFileModeError(error, filePath);
        if (fileModeError !== undefined) {
            return fileModeError;
        }
    }

    return ensureError(error);
}
