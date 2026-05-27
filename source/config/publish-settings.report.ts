import { isDefined, pickBy } from 'remeda';
import type { PublicPublishSettings, PublishSettings } from './publish-settings.ts';

type RedactedProvenance =
    | { readonly type: 'auto' }
    | { readonly type: 'file'; readonly path: string; readonly inlined: false };

export type RedactedPublishSettings = {
    readonly access: PublishSettings['access'];
    readonly allowScripts?: boolean;
    readonly sbom?: Readonly<Record<string, unknown>>;
    readonly provenance?: RedactedProvenance;
};

function redactProvenance(provenance: NonNullable<PublicPublishSettings['provenance']>): RedactedProvenance {
    if (provenance.type === 'file') {
        return { type: 'file', path: provenance.path, inlined: false };
    }
    return { type: 'auto' };
}

export function redactPublishSettings(settings: PublishSettings): RedactedPublishSettings {
    return pickBy(
        {
            access: settings.access,
            allowScripts: settings.allowScripts,
            sbom: settings.sbom,
            provenance:
                settings.access === 'public' && settings.provenance !== undefined
                    ? redactProvenance(settings.provenance)
                    : undefined
        },
        isDefined
    );
}
