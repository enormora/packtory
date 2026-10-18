import type { FieldProvenance } from '../../progress/progress-broadcaster.ts';

export function inspectPackageManifestProvenance(
    assembled: Readonly<Record<string, unknown>>,
    mainPackageManifest: Readonly<Record<string, unknown>>,
    additionalAttributes: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, FieldProvenance>> {
    const result: Record<string, FieldProvenance> = {};
    for (const key of Object.keys(assembled)) {
        if (additionalAttributes !== undefined && Object.hasOwn(additionalAttributes, key)) {
            result[key] = { source: 'additionalAttributes' };
        } else if (Object.hasOwn(mainPackageManifest, key)) {
            result[key] = { source: 'mainPackageManifest' };
        } else {
            result[key] = { source: 'derived' };
        }
    }
    return result;
}
