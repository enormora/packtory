import type { PackageJson as PackageManifest } from 'type-fest';
import { serializeStableJavaScriptObjectNotation } from '../../common/stable-structured-data.ts';

function shouldPreserveArrayOrder(path: readonly string[]): boolean {
    const [ topLevelKey ] = path;
    return topLevelKey === 'imports' || topLevelKey === 'exports';
}

export function serializePackageManifest(data: Readonly<PackageManifest>): string {
    return serializeStableJavaScriptObjectNotation(data, { shouldPreserveArrayOrder });
}
