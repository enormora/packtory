import assert from 'node:assert';
import { stripVTControlCharacters } from 'node:util';
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

function configLoader(config: unknown): ConfigLoader {
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
            configLoader: configLoader(config)
        },
        log,
        stopAll
    };
}

function validConfig(): unknown {
    return {
        registrySettings: { registryUrl: 'https://registry.example' },
        commonPackageSettings: {
            sourcesFolder: 'dist',
            mainPackageJson: { type: 'module' },
            publishSettings: { access: 'public' }
        },
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
    };
}

suite('config-inspect-handler', function () {
    test('prints a compact package summary for a valid config', async function () {
        const { dependencies, log } = createFixture(validConfig());

        const exitCode = await runConfigInspectHandler(dependencies);

        assert.strictEqual(exitCode, 0);
        assert.strictEqual(log.callCount, 1);
        assert.strictEqual(
            log.firstCall.args[0],
            [
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
        );
    });

    test('prints semantic config issues and exits with code 1', async function () {
        const { dependencies, log } = createFixture({
            commonPackageSettings: {
                sourcesFolder: 'dist',
                mainPackageJson: { type: 'module' },
                publishSettings: { access: 'public' }
            },
            packages: [
                { name: 'package-a', roots: { main: { js: 'index.js' } }, bundleDependencies: [ 'missing' ] }
            ]
        });

        const exitCode = await runConfigInspectHandler(dependencies);

        assert.strictEqual(exitCode, 1);
        assert.strictEqual(
            log.firstCall.args[0],
            [
                '✖ The provided config is invalid, there are 1 issue(s)',
                '',
                '- Bundle dependency "missing" referenced in "package-a" does not exist'
            ]
                .join('\n')
        );
    });

    test('prints CLI-only config issues', async function () {
        const config = {
            ...validConfig() as Readonly<Record<string, unknown>>,
            releasePullRequest: {
                githubActionsCi: {
                    trigger: 'workflow-dispatch',
                    workflowFile: 'ci.yml',
                    requiredStatusContexts: []
                }
            }
        };
        const { dependencies, log } = createFixture(config);

        const exitCode = await runConfigInspectHandler(dependencies);

        assert.strictEqual(exitCode, 1);
        assert.match(log.firstCall.args[0] as string, /The provided config is invalid/u);
        assert.match(log.firstCall.args[0] as string, /releasePullRequest/u);
    });

    test('stops spinners after validation and in the finally block', async function () {
        const { dependencies, stopAll } = createFixture(validConfig());

        await runConfigInspectHandler(dependencies);

        assert.strictEqual(stopAll.callCount, 2);
    });
});
