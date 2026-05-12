import type { PublishSettings } from './publish-settings.ts';

type RedactedProvenance =
    | { readonly type: 'auto' }
    | { readonly type: 'file'; readonly path: string; readonly inlined: false };

export type RedactedPublishSettings = {
    readonly access: PublishSettings['access'];
    readonly allowScripts?: boolean;
    readonly sbom?: Readonly<Record<string, unknown>>;
    readonly provenance?: RedactedProvenance;
};

function redactProvenance(
    provenance: NonNullable<Extract<PublishSettings, { access: 'public' }>['provenance']>
): RedactedProvenance {
    if (provenance.type === 'file') {
        return { type: 'file', path: provenance.path, inlined: false };
    }
    return { type: 'auto' };
}

export function redactPublishSettings(settings: PublishSettings): RedactedPublishSettings {
    return {
        access: settings.access,
        ...(settings.allowScripts === undefined ? {} : { allowScripts: settings.allowScripts }),
        ...(settings.sbom === undefined ? {} : { sbom: settings.sbom }),
        ...(settings.access === 'public' && settings.provenance !== undefined
            ? { provenance: redactProvenance(settings.provenance) }
            : {})
    };
}
