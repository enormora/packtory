import { createFactory } from '@enormora/objectory';
import type {
    PackageConfiguration,
    PackageConfigurationsByName,
    PacktoryConfiguration,
    PacktoryConfigurationWithoutRegistry
} from '../configuration/configuration.ts';
import { buildPackageGraph } from '../configuration/package-graph-builder.ts';
import type { PublishSettings } from '../configuration/publish-settings.ts';
import type {
    ConfigurationWithGraph,
    ValidConfigurationResult,
    ValidConfigurationWithoutRegistryResult
} from '../configuration/validation.ts';

type RootShape = { readonly javaScript: string; readonly declarationFile?: string | undefined; };

const rootFactory = createFactory<RootShape>(function () {
    return { javaScript: '' };
});

const minimalRootFactory = createFactory<RootShape>(function () {
    return { javaScript: 'foo' };
});

type MainPackageManifestShape = { readonly type: 'module'; };

const mainPackageManifestFactory = createFactory<MainPackageManifestShape>(function () {
    return { type: 'module' };
});

const rootsFactory = createFactory<Readonly<Record<string, RootShape>>>(function () {
    return { main: rootFactory };
});

const minimalRootsFactory = createFactory<Readonly<Record<string, RootShape>>>(function () {
    return { main: minimalRootFactory };
});

export type FooPackageConfigurationShape = {
    readonly name: string;
    readonly sourcesFolder: string;
    readonly roots: Readonly<Record<string, RootShape>>;
    readonly mainPackageManifest: MainPackageManifestShape;
    readonly defaultModuleRoot?: string | undefined;
};

export const fooPackageConfigurationFactory = createFactory<FooPackageConfigurationShape>(function () {
    return {
        name: 'foo',
        sourcesFolder: 'the-source',
        roots: rootsFactory,
        mainPackageManifest: mainPackageManifestFactory
    };
});

type MinimalPackageConfigurationShape = {
    readonly name: string;
    readonly roots: Readonly<Record<string, RootShape>>;
};

export const minimalPackageConfigurationFactory = createFactory<MinimalPackageConfigurationShape>(function () {
    return {
        name: 'foo',
        roots: minimalRootsFactory
    };
});

type ValidationPackageConfigurationShape = {
    readonly name: string;
    readonly bundleDependencies?: readonly string[] | undefined;
    readonly bundlePeerDependencies?: readonly string[] | undefined;
    readonly roots: Readonly<Record<string, RootShape>>;
    readonly sourcesFolder: string;
};

const validationRootFactory = createFactory<RootShape>(function () {
    return { javaScript: 'index.js' };
});

const validationRootsFactory = createFactory<Readonly<Record<string, RootShape>>>(function () {
    return { main: validationRootFactory };
});

export const validationPackageConfigurationFactory = createFactory<ValidationPackageConfigurationShape>(function () {
    return {
        name: 'package-a',
        roots: validationRootsFactory,
        sourcesFolder: 'source'
    };
});

export const publicPublishSettings: PublishSettings = { access: 'public' };
export const publicPublishSettingsAllowingScripts: PublishSettings = { access: 'public', allowScripts: true };

export function packageConfigurationFixture(overrides: Partial<PackageConfiguration> = {}): PackageConfiguration {
    return {
        name: 'package-a',
        roots: { main: { javaScript: 'index.js' } },
        sourcesFolder: 'source',
        mainPackageManifest: { type: 'module' },
        ...overrides
    };
}

export function packageConfigurationsByNameFixture(
    packages: readonly PackageConfiguration[]
): PackageConfigurationsByName {
    const packageConfigurations: Record<string, PackageConfiguration> = {};
    for (const packageConfiguration of packages) {
        packageConfigurations[packageConfiguration.name] = packageConfiguration;
    }
    return packageConfigurations;
}

function configurationWithGraph<TConfiguration extends PacktoryConfigurationWithoutRegistry>(
    packtoryConfiguration: TConfiguration
): ConfigurationWithGraph<TConfiguration> {
    const packageConfigurations = packageConfigurationsByNameFixture(packtoryConfiguration.packages);
    return {
        packtoryConfiguration,
        packageConfigurations,
        packageGraph: buildPackageGraph(packageConfigurations)
    };
}

export function validConfigurationWithoutRegistryFixture(
    overrides: Partial<PacktoryConfigurationWithoutRegistry> = {}
): ValidConfigurationWithoutRegistryResult {
    return configurationWithGraph({
        packages: [],
        ...overrides
    });
}

export function validConfigurationFixture(overrides: Partial<PacktoryConfiguration> = {}): ValidConfigurationResult {
    return configurationWithGraph({
        registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
        packages: [],
        ...overrides
    });
}
