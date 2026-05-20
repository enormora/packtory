import type { PackageJson } from 'type-fest';
import { serializeStableJson } from '../../common/stable-json.ts';

function shouldPreserveArrayOrder(path: readonly string[]): boolean {
    const [topLevelKey] = path;
    return topLevelKey === 'imports' || topLevelKey === 'exports';
}

export function serializePackageJson(data: Readonly<PackageJson>): string {
    return serializeStableJson(data, { shouldPreserveArrayOrder });
}
