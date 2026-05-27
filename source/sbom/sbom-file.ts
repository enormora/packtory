import * as cdx from '@cyclonedx/cyclonedx-library';
import type { PublishSettings } from '../config/publish-settings.ts';
import { createFileDescription, type FileDescription } from '../file-manager/file-description.ts';
import type { SbomPackage, SbomSiblingPackage } from '../published-package/published-package.ts';
import { extractLicenseFromManifest } from './extract-license.ts';
import type { LicenseResolver } from './license-resolver.ts';
import type { SbomSerializer } from './sbom-serializer.ts';
import { buildSbom, type SbomDependency } from './sbom-builder.ts';

type ToolVersionProvider = () => Promise<string>;

type SbomFileBuilderDependencies = {
    readonly licenseResolver: LicenseResolver;
    readonly sbomSerializer: SbomSerializer;
    readonly toolVersionProvider: ToolVersionProvider;
    readonly projectFolder: string;
};

export type SbomFileBuilder = {
    generate: (
        bundle: SbomPackage,
        siblings: readonly SbomSiblingPackage[],
        publishSettings: PublishSettings
    ) => Promise<readonly FileDescription[] | undefined>;
};

type DependencyEntry = {
    readonly name: string;
    readonly specifier: string;
    readonly scope: cdx.Enums.ComponentScope;
};

export function sbomFilePath(): string {
    return 'sbom.cdx.json';
}

function isSbomEnabled(publishSettings: PublishSettings): boolean {
    return publishSettings.sbom?.enabled ?? true;
}

function listDependencyEntries(bundle: SbomPackage): readonly DependencyEntry[] {
    return [
        ...Object.entries(bundle.dependencies).map<DependencyEntry>(([name, specifier]) => {
            return { name, specifier, scope: cdx.Enums.ComponentScope.Required };
        }),
        ...Object.entries(bundle.peerDependencies).map<DependencyEntry>(([name, specifier]) => {
            return { name, specifier, scope: cdx.Enums.ComponentScope.Optional };
        })
    ];
}

export function createSbomFileBuilder(dependencies: SbomFileBuilderDependencies): SbomFileBuilder {
    const { licenseResolver, sbomSerializer, toolVersionProvider, projectFolder } = dependencies;

    async function resolveDependencyEntries(
        bundle: SbomPackage,
        siblings: readonly SbomSiblingPackage[]
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

    async function buildFile(bundle: SbomPackage, siblings: readonly SbomSiblingPackage[]): Promise<FileDescription> {
        const [resolvedToolVersion, sbomDependencies] = await Promise.all([
            toolVersionProvider(),
            resolveDependencyEntries(bundle, siblings)
        ]);
        const bom = buildSbom({
            toolVersion: resolvedToolVersion,
            rootComponent: { name: bundle.packageJson.name, version: bundle.packageJson.version },
            dependencies: sbomDependencies
        });
        return createFileDescription(sbomFilePath(), sbomSerializer.serialize(bom));
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
