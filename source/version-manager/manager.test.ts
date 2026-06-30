import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { createProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import {
    analyzedBundle,
    externalDependency,
    standardVersionedBundle,
    versionedBundle
} from '../test-libraries/bundle-fixtures.ts';
import { createSpyingBroadcaster } from '../test-libraries/result-helpers.ts';
import { createVersionManager, type VersionManager, type VersionManagerDependencies } from './manager.ts';

function createAnalyzedBundle(): AnalyzedBundle {
    return analyzedBundle({
        linkedBundleDependencies: new Map([ [ 'bundle-dependency', externalDependency('bundle-dependency') ] ]),
        externalDependencies: new Map([ [ 'left-pad', externalDependency('left-pad') ] ])
    });
}

suite('manager', function () {
    test('addVersion() creates the versioned bundle and manifest file', function () {
        const manager = createVersionManager({
            progressBroadcaster: {
                emit(): void {
                    return undefined;
                },
                hasSubscribers(): boolean {
                    return false;
                }
            }
        });

        const result = manager.addVersion({
            bundle: createAnalyzedBundle(),
            version: '1.2.3',
            mainPackageJson: { type: 'module', dependencies: { 'left-pad': '^1.0.0' } },
            bundleDependencies: [
                versionedBundle({
                    name: 'bundle-dependency',
                    version: '4.5.6',
                    mainFile: { sourceFilePath: '/src/dep.js', targetFilePath: 'dep.js' }
                })
            ],
            bundlePeerDependencies: [],
            additionalPackageJsonAttributes: { publishConfig: { access: 'public' } },
            allowMutableSpecifiers: []
        });

        assert.deepStrictEqual(result.packageJson, {
            name: 'package-a',
            version: '1.2.3',
            exports: {
                '.': {
                    import: './index.js',
                    types: './index.d.ts'
                }
            },
            type: 'module',
            dependencies: { 'bundle-dependency': '4.5.6', 'left-pad': '^1.0.0' },
            publishConfig: { access: 'public' }
        });
        assert.deepStrictEqual(result.manifestFile, {
            filePath: 'package.json',
            isExecutable: false,
            content: [
                '{',
                '    "dependencies": {',
                '        "bundle-dependency": "4.5.6",',
                '        "left-pad": "^1.0.0"',
                '    },',
                '    "exports": {',
                '        ".": {',
                '            "import": "./index.js",',
                '            "types": "./index.d.ts"',
                '        }',
                '    },',
                '    "name": "package-a",',
                '    "publishConfig": {',
                '        "access": "public"',
                '    },',
                '    "type": "module",',
                '    "version": "1.2.3"',
                '}'
            ]
                .join('\n')
        });
    });

    test('increaseVersion() bumps the patch version and rebuilds the package manifest', function () {
        const manager = createVersionManager({
            progressBroadcaster: {
                emit(): void {
                    return undefined;
                },
                hasSubscribers(): boolean {
                    return false;
                }
            }
        });

        const result = manager.increaseVersion(
            standardVersionedBundle({
                dependencies: { dep: '^1.0.0' },
                peerDependencies: { react: '^19.0.0' }
            })
        );

        assert.strictEqual(result.version, '1.2.4');
        assert.deepStrictEqual(result.packageJson, {
            name: 'package-a',
            version: '1.2.4',
            exports: {
                '.': {
                    import: './index.js',
                    types: './index.d.ts'
                }
            },
            type: 'module',
            dependencies: { dep: '^1.0.0' },
            peerDependencies: { react: '^19.0.0' }
        });
        assert.deepStrictEqual(result.manifestFile, {
            filePath: 'package.json',
            isExecutable: false,
            content: [
                '{',
                '    "dependencies": {',
                '        "dep": "^1.0.0"',
                '    },',
                '    "exports": {',
                '        ".": {',
                '            "import": "./index.js",',
                '            "types": "./index.d.ts"',
                '        }',
                '    },',
                '    "name": "package-a",',
                '    "peerDependencies": {',
                '        "react": "^19.0.0"',
                '    },',
                '    "type": "module",',
                '    "version": "1.2.4"',
                '}'
            ]
                .join('\n')
        });
    });

    test('increaseVersion() throws when the given version is invalid', function () {
        const manager = createVersionManager({
            progressBroadcaster: {
                emit(): void {
                    return undefined;
                },
                hasSubscribers(): boolean {
                    return false;
                }
            }
        });

        try {
            manager.increaseVersion({
                name: 'package-a',
                version: 'not-a-semver',
                contents: [],
                roots: {
                    main: {
                        js: {
                            sourceFilePath: '/src/index.js',
                            targetFilePath: 'index.js',
                            content: '',
                            isExecutable: false
                        }
                    }
                },
                surface: { mode: 'implicit', defaultModuleRoot: 'main' },
                dependencies: {},
                peerDependencies: {},
                additionalAttributes: {},
                exportsField: {
                    '.': {
                        import: './index.js'
                    }
                },
                mainFile: {
                    sourceFilePath: '/src/index.js',
                    targetFilePath: 'index.js',
                    content: '',
                    isExecutable: false
                },
                packageType: 'module',
                sideEffectsField: undefined
            });
            assert.fail('Expected increaseVersion() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Failed to increase version');
        }
    });

    function callAddVersionWithProvider(
        progressBroadcaster: VersionManagerDependencies['progressBroadcaster'],
        additionalPackageJsonAttributes: Parameters<
            VersionManager['addVersion']
        >[0]['additionalPackageJsonAttributes'] = {}
    ): void {
        const manager = createVersionManager({ progressBroadcaster });
        manager.addVersion({
            bundle: analyzedBundle({}),
            version: '1.0.0',
            mainPackageJson: { type: 'module' },
            bundleDependencies: [],
            bundlePeerDependencies: [],
            additionalPackageJsonAttributes,
            allowMutableSpecifiers: []
        });
    }

    function expectAssembledFields(
        received: readonly Readonly<Record<string, { readonly source: string; }>>[]
    ): Readonly<Record<string, { readonly source: string; }>> {
        const [ fields ] = received;
        if (fields === undefined) {
            assert.fail('expected packageJsonAssembled to fire once');
        }
        return fields;
    }

    test('addVersion() emits a packageJsonAssembled event with the package name when subscribed', function () {
        const broadcaster = createProgressBroadcaster();
        const received: { readonly packageName: string; }[] = [];
        broadcaster.consumer.on('packageJsonAssembled', function (payload) {
            received.push({ packageName: payload.packageName });
        });

        callAddVersionWithProvider(broadcaster.provider);

        assert.deepStrictEqual(received, [ { packageName: 'package-a' } ]);
    });

    test('addVersion() emits packageJsonAssembled fields with provenance classification', function () {
        const broadcaster = createProgressBroadcaster();
        const received: Readonly<Record<string, { readonly source: string; }>>[] = [];
        broadcaster.consumer.on('packageJsonAssembled', function (payload) {
            received.push(payload.fields);
        });

        callAddVersionWithProvider(broadcaster.provider, { publishConfig: { access: 'public' } });

        const fields = expectAssembledFields(received);
        assert.deepStrictEqual(fields.type, { source: 'mainPackageJson' });
        assert.deepStrictEqual(fields.publishConfig, { source: 'additionalAttributes' });
        assert.deepStrictEqual(fields.name, { source: 'derived' });
        assert.deepStrictEqual(fields.version, { source: 'derived' });
    });

    test('addVersion() does NOT emit packageJsonAssembled when no subscriber is registered', function () {
        const wrapped = createSpyingBroadcaster();

        callAddVersionWithProvider(wrapped.provider);

        assert.strictEqual(wrapped.emitSpy.callCount, 0);
    });
});
