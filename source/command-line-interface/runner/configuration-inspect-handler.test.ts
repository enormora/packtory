import assert from 'node:assert';
import { stripVTControlCharacters } from 'node:util';
import { createFactory } from '@enormora/objectory';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type { ConfigurationLoader } from '../configuration-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import {
    runConfigurationInspectHandler,
    type ConfigurationInspectHandlerDependencies
} from './configuration-inspect-handler.ts';

type Fixture = {
    readonly dependencies: ConfigurationInspectHandlerDependencies;
    readonly log: SinonSpy;
    readonly stopAll: SinonSpy;
};

type InspectResult = {
    readonly exitCode: number;
    readonly message: string;
    readonly stopAll: SinonSpy;
};

type RootFixture = {
    readonly javaScript: string;
    readonly declarationFile?: string | undefined;
};

type MainPackageManifestFixture = {
    readonly type: 'module';
};

type PublishSettingsFixture = {
    readonly access: 'public';
};

type RegistrySettingsFixture = {
    readonly registryAddress: string;
};

type GithubActionsContinuousIntegrationFixture = {
    readonly trigger: string;
    readonly workflowFile: string;
    readonly requiredStatusContexts: readonly string[];
};

type CommonPackageSettingsFixture = {
    readonly sourcesFolder: string;
    readonly mainPackageManifest: MainPackageManifestFixture;
    readonly publishSettings: PublishSettingsFixture;
};

type ReleasePullRequestFixture = {
    readonly githubActionsContinuousIntegration: GithubActionsContinuousIntegrationFixture;
};

type PackageConfigurationFixture = {
    readonly name: string;
    readonly roots: Readonly<Record<string, RootFixture>>;
    readonly sourcesFolder?: string | undefined;
    readonly mainPackageManifest?: { readonly type: 'module'; } | undefined;
    readonly publishSettings?: { readonly access: 'public'; } | undefined;
    readonly defaultModuleRoot?: string | undefined;
    readonly bundleDependencies?: readonly string[] | undefined;
    readonly bundlePeerDependencies?: readonly string[] | undefined;
};

type PacktoryConfigurationFixture = {
    readonly registrySettings?: { readonly registryAddress: string; } | undefined;
    readonly commonPackageSettings?: CommonPackageSettingsFixture | undefined;
    readonly packages: readonly PackageConfigurationFixture[];
    readonly releasePullRequest?: ReleasePullRequestFixture | undefined;
};

const rootFactory = createFactory<RootFixture>(function () {
    return { javaScript: 'index.js' };
});

const rootsFactory = createFactory<Readonly<Record<string, RootFixture>>>(function () {
    return { main: rootFactory };
});

const mainPackageManifestFactory = createFactory<MainPackageManifestFixture>(function () {
    return { type: 'module' };
});

const publishSettingsFactory = createFactory<PublishSettingsFixture>(function () {
    return { access: 'public' };
});

const registrySettingsFactory = createFactory<RegistrySettingsFixture>(function () {
    return { registryAddress: 'https://registry.example' };
});

const githubActionsContinuousIntegrationFactory = createFactory<GithubActionsContinuousIntegrationFixture>(function () {
    return {
        trigger: 'workflow-dispatch',
        workflowFile: 'continuous-integration.yml',
        requiredStatusContexts: []
    };
});

const commonPackageSettingsFactory = createFactory<CommonPackageSettingsFixture>(function () {
    return {
        sourcesFolder: 'dist',
        mainPackageManifest: mainPackageManifestFactory,
        publishSettings: publishSettingsFactory
    };
});

const releasePullRequestFactory = createFactory<ReleasePullRequestFixture>(function () {
    return { githubActionsContinuousIntegration: githubActionsContinuousIntegrationFactory };
});

const packageConfigurationFactory = createFactory<PackageConfigurationFixture>(function () {
    return {
        name: 'package-a',
        roots: rootsFactory
    };
});

const packtoryConfigurationFactory = createFactory<PacktoryConfigurationFixture>(function () {
    return {
        registrySettings: registrySettingsFactory,
        commonPackageSettings: commonPackageSettingsFactory,
        packages: packageConfigurationFactory.asArray({ length: 1 })
    };
});

const packtoryConfigurationWithoutCommonPackageSettingsFactory = createFactory<PacktoryConfigurationFixture>(
    function () {
        return {
            registrySettings: registrySettingsFactory,
            packages: packageConfigurationFactory.asArray({ length: 1 })
        };
    }
);

const validConfigurationFactory = packtoryConfigurationFactory.withOverrides({
    packages: [
        {
            name: 'package-a',
            roots: {
                main: { javaScript: 'index.js', declarationFile: 'index.d.ts' },
                commandLineInterface: { javaScript: 'cli.js' }
            },
            defaultModuleRoot: 'main',
            bundleDependencies: [ 'package-b' ],
            bundlePeerDependencies: [ 'package-c' ]
        },
        {
            name: 'package-b',
            sourcesFolder: 'custom-dist',
            roots: { main: { javaScript: 'package-b.js' } }
        },
        {
            name: 'package-c',
            roots: { main: { javaScript: 'package-c.js' } }
        }
    ]
});

function createConfigurationLoader(configuration: unknown): ConfigurationLoader {
    return { load: fake.resolves(configuration) };
}

function createFixture(configuration: unknown): Fixture {
    const log = fake();
    const stopAll = fake();
    return {
        dependencies: {
            log(message) {
                log(stripVTControlCharacters(message));
            },
            spinnerRenderer: { stopAll } as unknown as TerminalSpinnerRenderer,
            configurationLoader: createConfigurationLoader(configuration)
        },
        log,
        stopAll
    };
}

async function inspectConfiguration(configuration: unknown): Promise<InspectResult> {
    const { dependencies, log, stopAll } = createFixture(configuration);
    const exitCode = await runConfigurationInspectHandler(dependencies);
    return {
        exitCode,
        message: String(log.firstCall.args[0]),
        stopAll
    };
}

function assertInspectFailsWithMessage(result: InspectResult, expectedMessage: string): void {
    assert.partialDeepStrictEqual(result, {
        exitCode: 1,
        message: expectedMessage
    });
}

function assertInspectFailsWithMatch(result: InspectResult, pattern: RegExp): void {
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.message, pattern);
}

function assertInspectSucceedsWithMatch(result: InspectResult, pattern: RegExp): void {
    assert.strictEqual(result.exitCode, 0);
    assert.match(result.message, pattern);
}

suite('config-inspect-handler', function () {
    test('prints a compact package summary for a valid config', async function () {
        const result = await inspectConfiguration(validConfigurationFactory.build());

        assert.partialDeepStrictEqual(result, {
            exitCode: 0,
            message: [
                '✔ Config is valid',
                'Packages: 3 package(s)',
                '- package-a',
                '  sourcesFolder: dist',
                '  roots: main: index.js, d.ts: index.d.ts; commandLineInterface: cli.js',
                '  bundleDependencies: package-b',
                '  bundlePeerDependencies: package-c',
                '- package-b',
                '  sourcesFolder: custom-dist',
                '  roots: main: package-b.js',
                '  bundleDependencies: none',
                '  bundlePeerDependencies: none',
                '- package-c',
                '  sourcesFolder: dist',
                '  roots: main: package-c.js',
                '  bundleDependencies: none',
                '  bundlePeerDependencies: none'
            ]
                .join('\n')
        });
    });

    test('prints semantic config issues and exits with code 1', async function () {
        const configuration = packtoryConfigurationFactory.build({
            packages: [ { name: 'package-a', bundleDependencies: [ 'missing' ] } ]
        });

        assertInspectFailsWithMessage(
            await inspectConfiguration(configuration),
            [
                '✖ The provided config is invalid, there are 1 issue(s)',
                '',
                '- Bundle dependency "missing" referenced in "package-a" does not exist'
            ]
                .join('\n')
        );
    });

    test('prints multiple config issues on separate bullet lines', async function () {
        const configuration = packtoryConfigurationFactory.build({
            packages: [
                { name: 'package-a', bundleDependencies: [ 'missing-a' ] },
                { name: 'package-b', bundleDependencies: [ 'missing-b' ] }
            ]
        });

        assertInspectFailsWithMatch(
            await inspectConfiguration(configuration),
            /- Bundle dependency "missing-a" referenced in "package-a" does not exist\n- Bundle dependency "missing-b"/u
        );
    });

    test('prints CLI-only config issues', async function () {
        const configuration = validConfigurationFactory.build({
            releasePullRequest: releasePullRequestFactory.build()
        });
        const result = await inspectConfiguration(configuration);

        assert.strictEqual(result.exitCode, 1);
        assert.match(result.message, /The provided config is invalid/u);
        assert.match(result.message, /releasePullRequest/u);
    });

    test('prints CLI config issues before semantic validation issues', async function () {
        const configuration = validConfigurationFactory.build({
            releasePullRequest: releasePullRequestFactory.build(),
            packages: [ { name: 'package-a', bundleDependencies: [ 'missing' ] } ]
        });
        const result = await inspectConfiguration(configuration);

        assert.strictEqual(result.exitCode, 1);
        assert.match(result.message, /releasePullRequest/u);
        assert.doesNotMatch(result.message, /Bundle dependency "missing"/u);
    });

    test('formats empty dependency arrays as none', async function () {
        const configuration = packtoryConfigurationFactory.build({
            packages: [ { name: 'package-a', bundleDependencies: [], bundlePeerDependencies: [] } ]
        });
        const result = await inspectConfiguration(configuration);

        assert.ok(
            result.message.includes('bundleDependencies: none\n  bundlePeerDependencies: none')
        );
    });

    test('joins multiple bundled dependencies with comma separators', async function () {
        const configuration = packtoryConfigurationFactory.build({
            packages: [
                { name: 'package-a', bundleDependencies: [ 'package-b', 'package-c' ] },
                { name: 'package-b', roots: { main: { javaScript: 'package-b.js' } } },
                { name: 'package-c', roots: { main: { javaScript: 'package-c.js' } } }
            ]
        });

        assertInspectSucceedsWithMatch(
            await inspectConfiguration(configuration),
            /bundleDependencies: package-b, package-c/u
        );
    });

    test('supports configs without shared common package settings', async function () {
        const configuration = packtoryConfigurationWithoutCommonPackageSettingsFactory.build({
            packages: [ {
                name: 'package-a',
                sourcesFolder: 'dist',
                mainPackageManifest: { type: 'module' },
                publishSettings: { access: 'public' }
            } ]
        });

        assertInspectSucceedsWithMatch(await inspectConfiguration(configuration), /sourcesFolder: dist/u);
    });

    test('stops spinners after validation and in the finally block', async function () {
        const { stopAll } = await inspectConfiguration(validConfigurationFactory.build());

        assert.strictEqual(stopAll.callCount, 2);
    });
});
