import type { PublishSettings } from '../../configuration/publish-settings.ts';
import { matchAutomaticModeError } from '../publish-error/auto-mode-error-matching.ts';
import { ensureError } from '../publish-error/error-shape-helpers.ts';
import { matchFileModeError } from '../publish-error/file-mode-error-matching.ts';

type PublishProvenanceOptions = { readonly provenance: true; } | { readonly provenanceFile: string; };

type PublishOptionsForLibnpmpublish = Partial<PublishProvenanceOptions> & {
    readonly access: PublishSettings['access'];
};

export function buildPublishOptionsForPublishSettings(
    publishSettings: Readonly<PublishSettings>
): PublishOptionsForLibnpmpublish {
    if (publishSettings.access === 'restricted') {
        return { access: 'restricted' };
    }

    if (publishSettings.provenance?.type === 'automatic') {
        return { access: 'public', provenance: true };
    }

    if (publishSettings.provenance?.type === 'file') {
        return { access: 'public', provenanceFile: publishSettings.provenance.path };
    }

    return { access: 'public' };
}

function getProvenanceFilePath(publishSettings: Readonly<PublishSettings>): string | undefined {
    return publishSettings.access === 'public' && publishSettings.provenance?.type === 'file'
        ? publishSettings.provenance.path
        : undefined;
}

export function remapPublishError(error: unknown, publishSettings: Readonly<PublishSettings>): Error {
    const automaticModeError = matchAutomaticModeError(error);
    if (automaticModeError !== undefined) {
        return automaticModeError;
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
