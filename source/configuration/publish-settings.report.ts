import { isDefined, pickBy } from 'remeda';
import type { PublicPublishSettings, PublishSettings } from './publish-settings.ts';

type AutomaticProvenance = { readonly type: 'automatic'; };
type FileProvenance = { readonly type: 'file'; readonly path: string; readonly inlined: false; };
type RedactedProvenance = AutomaticProvenance | FileProvenance;

export type RedactedPublishSettings = {
    readonly access: PublishSettings['access'];
    readonly allowScripts?: boolean;
    readonly softwareBillOfMaterials?: Readonly<Record<string, unknown>>;
    readonly provenance?: RedactedProvenance;
};

function redactProvenance(provenance: NonNullable<PublicPublishSettings['provenance']>): RedactedProvenance {
    if (provenance.type === 'file') {
        return { type: 'file', path: provenance.path, inlined: false };
    }
    return { type: 'automatic' };
}

export function redactPublishSettings(settings: PublishSettings): RedactedPublishSettings {
    return pickBy(
        {
            access: settings.access,
            allowScripts: settings.allowScripts,
            softwareBillOfMaterials: settings.softwareBillOfMaterials,
            provenance: settings.access === 'public' && settings.provenance !== undefined
                ? redactProvenance(settings.provenance)
                : undefined
        },
        isDefined
    );
}
