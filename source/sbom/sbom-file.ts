import type { PublishSettings } from '../config/publish-settings.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { extractLicenseFromManifest } from './extract-license.ts';
import type { LicenseResolver } from './license-resolver.ts';
import type { SbomSerializer } from './sbom-serializer.ts';
import { buildSbom, type SbomDependency, type SbomDependencyKind } from './sbom-builder.ts';

const sbomFilePath = 'sbom.cdx.json';

type ToolVersionProvider = () => Promise<string>;

type SbomFileBuilderDependencies = {
    readonly licenseResolver: LicenseResolver;
    readonly sbomSerializer: SbomSerializer;
    readonly toolVersionProvider: ToolVersionProvider;
    readonly projectFolder: string;
};

type SbomSibling = Pick<VersionedBundleWithManifest, 'name' | 'packageJson'>;

export type SbomFileBuilder = {
    generate: (
        bundle: VersionedBundleWithManifest,
        siblings: readonly SbomSibling[],
        publishSettings: PublishSettings
    ) => Promise<readonly FileDescription[] | undefined>;
};

type DependencyEntry = {
    readonly name: string;
    readonly specifier: string;
    readonly kind: SbomDependencyKind;
};

function isSbomEnabled(publishSettings: PublishSettings): boolean {
    return publishSettings.sbom?.enabled ?? true;
}

function listDependencyEntries(bundle: VersionedBundleWithManifest): readonly DependencyEntry[] {
    return [
        ...Object.entries(bundle.dependencies).map<DependencyEntry>(([name, specifier]) => {
            return { name, specifier, kind: 'runtime' };
        }),
        ...Object.entries(bundle.peerDependencies).map<DependencyEntry>(([name, specifier]) => {
            return { name, specifier, kind: 'peer' };
        })
    ];
}

export function createSbomFileBuilder(dependencies: SbomFileBuilderDependencies): SbomFileBuilder {
    const { licenseResolver, sbomSerializer, toolVersionProvider, projectFolder } = dependencies;

    async function resolveDependencyEntries(
        bundle: VersionedBundleWithManifest,
        siblings: readonly SbomSibling[]
    ): Promise<readonly SbomDependency[]> {
        const siblingsByName = new Map(
            siblings.map((sibling) => {
                return [sibling.name, sibling];
            })
        );
        const entries = listDependencyEntries(bundle);
        return Promise.all(
            entries.map(async (entry) => {
                const sibling = siblingsByName.get(entry.name);
                const license =
                    sibling === undefined
                        ? await licenseResolver.resolveLicense({ projectFolder, dependencyName: entry.name })
                        : extractLicenseFromManifest(sibling.packageJson);
                return { ...entry, license };
            })
        );
    }

    async function buildFile(
        bundle: VersionedBundleWithManifest,
        siblings: readonly SbomSibling[]
    ): Promise<FileDescription> {
        const [resolvedToolVersion, sbomDependencies] = await Promise.all([
            toolVersionProvider(),
            resolveDependencyEntries(bundle, siblings)
        ]);
        const bom = buildSbom({
            toolVersion: resolvedToolVersion,
            rootComponent: { name: bundle.packageJson.name, version: bundle.packageJson.version },
            dependencies: sbomDependencies
        });
        return {
            filePath: sbomFilePath,
            content: sbomSerializer.serialize(bom),
            isExecutable: false
        };
    }

    return {
        async generate(bundle, siblings, publishSettings) {
            if (!isSbomEnabled(publishSettings)) {
                return undefined;
            }
            return [await buildFile(bundle, siblings)];
        }
    };
}
