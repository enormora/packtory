import { isPlainObject } from 'remeda';

export function extractLicenseFromManifest(packageJson: unknown): string | undefined {
    if (!isPlainObject(packageJson)) {
        return undefined;
    }
    const { license } = packageJson;
    if (typeof license === 'string' && license.length > 0) {
        return license;
    }
    return undefined;
}
