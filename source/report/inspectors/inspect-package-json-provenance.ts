import type { FieldProvenance } from '../../progress/progress-broadcaster.ts';

export function inspectPackageJsonProvenance(
    assembled: Readonly<Record<string, unknown>>,
    mainPackageJson: Readonly<Record<string, unknown>>,
    additionalAttributes: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, FieldProvenance>> {
    const result: Record<string, FieldProvenance> = {};
    for (const key of Object.keys(assembled)) {
        if (additionalAttributes !== undefined && key in additionalAttributes) {
            result[key] = { source: 'additionalAttributes' };
        } else if (key in mainPackageJson) {
            result[key] = { source: 'mainPackageJson' };
        } else {
            result[key] = { source: 'derived' };
        }
    }
    return result;
}
