import * as cyclonedx from '@cyclonedx/cyclonedx-library';
import { softwareBillOfMaterialsArtifactFilePath } from '../common/package-layout.ts';
import type { PublishSettings } from '../configuration/publish-settings.ts';
import { createFileDescription, type FileDescription } from '../file-manager/file-description.ts';
import type {
    SoftwareBillOfMaterialsPackage,
    SoftwareBillOfMaterialsSiblingPackage
} from '../published-package/published-package.ts';
import { extractLicenseFromManifest } from './extract-license.ts';
import type { LicenseResolver } from './license-resolver.ts';
import type { SoftwareBillOfMaterialsSerializer } from './software-bill-of-materials-serializer.ts';
import {
    buildSoftwareBillOfMaterials,
    type SoftwareBillOfMaterialsDependency
} from './software-bill-of-materials-builder.ts';

type ToolVersionProvider = () => Promise<string>;

type SoftwareBillOfMaterialsFileBuilderDependencies = {
    readonly licenseResolver: LicenseResolver;
    readonly softwareBillOfMaterialsSerializer: SoftwareBillOfMaterialsSerializer;
    readonly toolVersionProvider: ToolVersionProvider;
    readonly projectFolder: string;
};

export type SoftwareBillOfMaterialsFileBuilder = {
    generate: (
        bundle: SoftwareBillOfMaterialsPackage,
        siblings: readonly SoftwareBillOfMaterialsSiblingPackage[],
        publishSettings: PublishSettings
    ) => Promise<readonly FileDescription[] | undefined>;
};

type DependencyEntry = {
    readonly name: string;
    readonly specifier: string;
    readonly scope: cyclonedx.Enums.ComponentScope;
};

function isSoftwareBillOfMaterialsEnabled(publishSettings: PublishSettings): boolean {
    return publishSettings.softwareBillOfMaterials?.enabled ?? true;
}

function listDependencyEntries(bundle: SoftwareBillOfMaterialsPackage): readonly DependencyEntry[] {
    return [
        ...Object.entries(bundle.dependencies).map<DependencyEntry>(function ([ name, specifier ]) {
            return { name, specifier, scope: cyclonedx.Enums.ComponentScope.Required };
        }),
        ...Object.entries(bundle.peerDependencies).map<DependencyEntry>(function ([ name, specifier ]) {
            return { name, specifier, scope: cyclonedx.Enums.ComponentScope.Optional };
        })
    ];
}

export function createSoftwareBillOfMaterialsFileBuilder(
    dependencies: SoftwareBillOfMaterialsFileBuilderDependencies
): SoftwareBillOfMaterialsFileBuilder {
    const { licenseResolver, softwareBillOfMaterialsSerializer, toolVersionProvider, projectFolder } = dependencies;

    async function resolveDependencyEntries(
        bundle: SoftwareBillOfMaterialsPackage,
        siblings: readonly SoftwareBillOfMaterialsSiblingPackage[]
    ): Promise<readonly SoftwareBillOfMaterialsDependency[]> {
        const siblingsByName = new Map(
            siblings.map(function (sibling) {
                return [ sibling.name, sibling ];
            })
        );
        const entries = listDependencyEntries(bundle);
        return Promise.all(
            entries.map(async function (entry) {
                const sibling = siblingsByName.get(entry.name);
                const license = sibling === undefined
                    ? await licenseResolver.resolveLicense({ projectFolder, dependencyName: entry.name })
                    : extractLicenseFromManifest(sibling.packageManifest);
                return { ...entry, license };
            })
        );
    }

    async function buildFile(
        bundle: SoftwareBillOfMaterialsPackage,
        siblings: readonly SoftwareBillOfMaterialsSiblingPackage[]
    ): Promise<FileDescription> {
        const [ resolvedToolVersion, softwareBillOfMaterialsDependencies ] = await Promise.all([
            toolVersionProvider(),
            resolveDependencyEntries(bundle, siblings)
        ]);
        const billOfMaterials = buildSoftwareBillOfMaterials({
            toolVersion: resolvedToolVersion,
            rootComponent: { name: bundle.packageManifest.name, version: bundle.packageManifest.version },
            dependencies: softwareBillOfMaterialsDependencies
        });
        return createFileDescription(
            softwareBillOfMaterialsArtifactFilePath,
            softwareBillOfMaterialsSerializer.serialize(billOfMaterials)
        );
    }

    return {
        async generate(bundle, siblings, publishSettings) {
            if (!isSoftwareBillOfMaterialsEnabled(publishSettings)) {
                return undefined;
            }
            return [ await buildFile(bundle, siblings) ];
        }
    };
}
