import path from 'node:path';
import type { InstalledPackageFileManager } from '../common/package-layout.ts';
import type { NodeEngineCompatibilityRule } from '../checks/rules/node-engine-compatibility.ts';
import type { PublishedPackageWithManifest } from '../published-package/published-package.ts';
import { analyzedBundle, versionedBundleWithManifest } from './bundle-fixtures.ts';

type ManifestReadCollector = {
    readonly push: (filePath: string) => unknown;
};

export type EngineCheckInput = Parameters<NodeEngineCompatibilityRule['run']>[0];

export function enginePublishedPackage(
    name: string,
    fields: Readonly<Record<string, unknown>>
): PublishedPackageWithManifest {
    return {
        ...versionedBundleWithManifest({ name }),
        packageJson: { name, version: '1.0.0', ...fields }
    };
}

export function engineCheckInput(fields: Readonly<Record<string, unknown>>): EngineCheckInput {
    return {
        bundles: [ analyzedBundle({ name: 'root' }) ],
        sourceFolders: new Map([ [ 'root', '/repo/src' ] ]),
        publishedPackages: new Map([ [ 'root', enginePublishedPackage('root', fields) ] ]),
        settings: { nodeEngineCompatibility: { enabled: true } },
        perPackageSettings: new Map(),
        packageConfigs: {}
    };
}

export function engineFileManager(
    manifests: Readonly<Record<string, unknown>>,
    realPaths: Readonly<Record<string, string>>,
    reads: ManifestReadCollector
): InstalledPackageFileManager {
    return {
        async checkReadability(folder) {
            return { isReadable: Object.hasOwn(manifests, folder) || Object.hasOwn(realPaths, folder) };
        },
        async getRealPath(folder) {
            return realPaths[folder] ?? folder;
        },
        async readFile(filePath) {
            reads.push(filePath);
            const manifest = manifests[path.dirname(filePath)];
            if (manifest instanceof Error) {
                throw manifest;
            }
            if (manifest === undefined) {
                throw new Error(`Manifest missing: ${filePath}`);
            }
            return typeof manifest === 'string' ? manifest : JSON.stringify(manifest);
        }
    };
}
