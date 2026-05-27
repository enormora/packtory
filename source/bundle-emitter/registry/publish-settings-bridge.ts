import { provenanceType, publishAccess, type PublishSettings } from '../../config/publish-settings.ts';
import { matchAutoModeError } from '../publish-error/auto-mode-error-matching.ts';
import { ensureError } from '../publish-error/error-shape-helpers.ts';
import { matchFileModeError } from '../publish-error/file-mode-error-matching.ts';

type PublishProvenanceOptions = { readonly provenance: true } | { readonly provenanceFile: string };

type PublishOptionsForLibnpmpublish = Partial<PublishProvenanceOptions> & {
    readonly access: (typeof publishAccess)[keyof typeof publishAccess];
};

export function buildPublishOptionsForPublishSettings(
    publishSettings: Readonly<PublishSettings>
): PublishOptionsForLibnpmpublish {
    if (publishSettings.access === publishAccess.restricted) {
        return { access: publishAccess.restricted };
    }

    if (publishSettings.provenance?.type === provenanceType.auto) {
        return { access: publishAccess.public, provenance: true };
    }

    if (publishSettings.provenance?.type === provenanceType.file) {
        return { access: publishAccess.public, provenanceFile: publishSettings.provenance.path };
    }

    return { access: publishAccess.public };
}

function getProvenanceFilePath(publishSettings: Readonly<PublishSettings>): string | undefined {
    return publishSettings.access === publishAccess.public && publishSettings.provenance?.type === provenanceType.file
        ? publishSettings.provenance.path
        : undefined;
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
