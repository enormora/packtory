import assert from 'node:assert';
import { stripVTControlCharacters } from 'node:util';
import { createFactory } from '@enormora/objectory';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { runConfigInspectHandler, type ConfigInspectHandlerDependencies } from './config-inspect-handler.ts';

type Fixture = {
    readonly dependencies: ConfigInspectHandlerDependencies;
    readonly log: SinonSpy;
    readonly stopAll: SinonSpy;
};

type InspectResult = {
    readonly exitCode: number;
    readonly message: string;
    readonly stopAll: SinonSpy;
};

type RootFixture = {
    readonly js: string;
    readonly declarationFile?: string | undefined;
};

type MainPackageJsonFixture = {
    readonly type: 'module';
};

type PublishSettingsFixture = {
    readonly access: 'public';
};

type RegistrySettingsFixture = {
    readonly registryUrl: string;
};

type GithubActionsCiFixture = {
    readonly trigger: string;
    readonly workflowFile: string;
    readonly requiredStatusContexts: readonly string[];
};

type CommonPackageSettingsFixture = {
    readonly sourcesFolder: string;
    readonly mainPackageJson: MainPackageJsonFixture;
    readonly publishSettings: PublishSettingsFixture;
};

type ReleasePullRequestFixture = {
    readonly githubActionsCi: GithubActionsCiFixture;
};

type PackageConfigFixture = {
    readonly name: string;
    readonly roots: Readonly<Record<string, RootFixture>>;
    readonly sourcesFolder?: string | undefined;
    readonly mainPackageJson?: { readonly type: 'module'; } | undefined;
    readonly publishSettings?: { readonly access: 'public'; } | undefined;
    readonly defaultModuleRoot?: string | undefined;
    readonly bundleDependencies?: readonly string[] | undefined;
    readonly bundlePeerDependencies?: readonly string[] | undefined;
};

type PacktoryConfigFixture = {
    readonly registrySettings?: { readonly registryUrl: string; } | undefined;
    readonly commonPackageSettings?: CommonPackageSettingsFixture | undefined;
    readonly packages: readonly PackageConfigFixture[];
    readonly releasePullRequest?: ReleasePullRequestFixture | undefined;
};

const rootFactory = createFactory<RootFixture>(function () {
    return { js: 'index.js' };
});

const rootsFactory = createFactory<Readonly<Record<string, RootFixture>>>(function () {
    return { main: rootFactory };
});

const mainPackageJsonFactory = createFactory<MainPackageJsonFixture>(function () {
    return { type: 'module' };
});

const publishSettingsFactory = createFactory<PublishSettingsFixture>(function () {
    return { access: 'public' };
});

const registrySettingsFactory = createFactory<RegistrySettingsFixture>(function () {
    return { registryUrl: 'https://registry.example' };
});

const githubActionsCiFactory = createFactory<GithubActionsCiFixture>(function () {
    return {
        trigger: 'workflow-dispatch',
        workflowFile: 'ci.yml',
        requiredStatusContexts: []
    };
});

const commonPackageSettingsFactory = createFactory<CommonPackageSettingsFixture>(function () {
    return {
        sourcesFolder: 'dist',
        mainPackageJson: mainPackageJsonFactory,
        publishSettings: publishSettingsFactory
    };
});

const releasePullRequestFactory = createFactory<ReleasePullRequestFixture>(function () {
    return { githubActionsCi: githubActionsCiFactory };
});

const packageConfigFactory = createFactory<PackageConfigFixture>(function () {
    return {
        name: 'package-a',
        roots: rootsFactory
    };
});

const packtoryConfigFactory = createFactory<PacktoryConfigFixture>(function () {
    return {
        registrySettings: registrySettingsFactory,
        commonPackageSettings: commonPackageSettingsFactory,
        packages: packageConfigFactory.asArray({ length: 1 })
    };
});

const packtoryConfigWithoutCommonPackageSettingsFactory = createFactory<PacktoryConfigFixture>(function () {
    return {
        registrySettings: registrySettingsFactory,
        packages: packageConfigFactory.asArray({ length: 1 })
    };
});

const validConfigFactory = packtoryConfigFactory.withOverrides({
    packages: [
        {
            name: 'package-a',
            roots: {
                main: { js: 'index.js', declarationFile: 'index.d.ts' },
                cli: { js: 'cli.js' }
            },
            defaultModuleRoot: 'main',
            bundleDependencies: [ 'package-b' ],
            bundlePeerDependencies: [ 'package-c' ]
        },
        {
            name: 'package-b',
            sourcesFolder: 'custom-dist',
            roots: { main: { js: 'package-b.js' } }
        },
        {
            name: 'package-c',
            roots: { main: { js: 'package-c.js' } }
        }
    ]
});

function createConfigLoader(config: unknown): ConfigLoader {
    return { load: fake.resolves(config) };
}

function createFixture(config: unknown): Fixture {
    const log = fake();
    const stopAll = fake();
    return {
        dependencies: {
            log(message) {
                log(stripVTControlCharacters(message));
            },
            spinnerRenderer: { stopAll } as unknown as TerminalSpinnerRenderer,
            configLoader: createConfigLoader(config)
        },
        log,
        stopAll
    };
}

async function inspectConfig(config: unknown): Promise<InspectResult> {
    const { dependencies, log, stopAll } = createFixture(config);
    const exitCode = await runConfigInspectHandler(dependencies);
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
        const result = await inspectConfig(validConfigFactory.build());

        assert.partialDeepStrictEqual(result, {
            exitCode: 0,
            message: [
                '✔ Config is valid',
                'Packages: 3 package(s)',
                '- package-a',
                '  sourcesFolder: dist',
                '  roots: main: index.js, d.ts: index.d.ts; cli: cli.js',
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
        const config = packtoryConfigFactory.build({
            packages: [ { name: 'package-a', bundleDependencies: [ 'missing' ] } ]
        });

        assertInspectFailsWithMessage(
            await inspectConfig(config),
            [
                '✖ The provided config is invalid, there are 1 issue(s)',
                '',
                '- Bundle dependency "missing" referenced in "package-a" does not exist'
            ]
                .join('\n')
        );
    });

    test('prints multiple config issues on separate bullet lines', async function () {
        const config = packtoryConfigFactory.build({
            packages: [
                { name: 'package-a', bundleDependencies: [ 'missing-a' ] },
                { name: 'package-b', bundleDependencies: [ 'missing-b' ] }
            ]
        });

        assertInspectFailsWithMatch(
            await inspectConfig(config),
            /- Bundle dependency "missing-a" referenced in "package-a" does not exist\n- Bundle dependency "missing-b"/u
        );
    });

    test('prints CLI-only config issues', async function () {
        const config = validConfigFactory.build({ releasePullRequest: releasePullRequestFactory.build() });
        const result = await inspectConfig(config);

        assert.strictEqual(result.exitCode, 1);
        assert.match(result.message, /The provided config is invalid/u);
        assert.match(result.message, /releasePullRequest/u);
    });

    test('prints CLI config issues before semantic validation issues', async function () {
        const config = validConfigFactory.build({
            releasePullRequest: releasePullRequestFactory.build(),
            packages: [ { name: 'package-a', bundleDependencies: [ 'missing' ] } ]
        });
        const result = await inspectConfig(config);

        assert.strictEqual(result.exitCode, 1);
        assert.match(result.message, /releasePullRequest/u);
        assert.doesNotMatch(result.message, /Bundle dependency "missing"/u);
    });

    test('formats empty dependency arrays as none', async function () {
        const config = packtoryConfigFactory.build({
            packages: [ { name: 'package-a', bundleDependencies: [], bundlePeerDependencies: [] } ]
        });
        const result = await inspectConfig(config);

        assert.ok(
            result.message.includes('bundleDependencies: none\n  bundlePeerDependencies: none')
        );
    });

    test('joins multiple bundled dependencies with comma separators', async function () {
        const config = packtoryConfigFactory.build({
            packages: [
                { name: 'package-a', bundleDependencies: [ 'package-b', 'package-c' ] },
                { name: 'package-b', roots: { main: { js: 'package-b.js' } } },
                { name: 'package-c', roots: { main: { js: 'package-c.js' } } }
            ]
        });

        assertInspectSucceedsWithMatch(await inspectConfig(config), /bundleDependencies: package-b, package-c/u);
    });

    test('supports configs without shared common package settings', async function () {
        const config = packtoryConfigWithoutCommonPackageSettingsFactory.build({
            packages: [ {
                name: 'package-a',
                sourcesFolder: 'dist',
                mainPackageJson: { type: 'module' },
                publishSettings: { access: 'public' }
            } ]
        });

        assertInspectSucceedsWithMatch(await inspectConfig(config), /sourcesFolder: dist/u);
    });

    test('stops spinners after validation and in the finally block', async function () {
        const { stopAll } = await inspectConfig(validConfigFactory.build());

        assert.strictEqual(stopAll.callCount, 2);
    });
});
