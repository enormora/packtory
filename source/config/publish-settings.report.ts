import { isDefined, pickBy } from 'remeda';
import { publishAccess, provenanceType, type PublicPublishSettings, type PublishSettings } from './publish-settings.ts';

type RedactedProvenance =
    | { readonly type: typeof provenanceType.auto }
    | { readonly type: typeof provenanceType.file; readonly path: string; readonly inlined: false };

export type RedactedPublishSettings = {
    readonly access: PublishSettings['access'];
    readonly allowScripts?: boolean;
    readonly sbom?: Readonly<Record<string, unknown>>;
    readonly provenance?: RedactedProvenance;
};

function redactProvenance(provenance: NonNullable<PublicPublishSettings['provenance']>): RedactedProvenance {
    if (provenance.type === provenanceType.file) {
        return { type: provenanceType.file, path: provenance.path, inlined: false };
    }
    return { type: provenanceType.auto };
}

export function redactPublishSettings(settings: PublishSettings): RedactedPublishSettings {
    return pickBy(
        {
            access: settings.access,
            allowScripts: settings.allowScripts,
            sbom: settings.sbom,
            provenance:
                settings.access === publishAccess.public && settings.provenance !== undefined
                    ? redactProvenance(settings.provenance)
                    : undefined
        },
        isDefined
    );
}
