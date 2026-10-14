import { isPlainObject } from 'remeda';

export function extractLicenseFromManifest(packageManifest: unknown): string | undefined {
    if (!isPlainObject(packageManifest)) {
        return undefined;
    }
    const { license } = packageManifest;
    if (typeof license === 'string' && license.length > 0) {
        return license;
    }
    return undefined;
}
