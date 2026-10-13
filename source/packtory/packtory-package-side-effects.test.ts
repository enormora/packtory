import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    validateConfigurationWithoutRegistry,
    type ValidConfigurationWithoutRegistryResult
} from '../configuration/validation.ts';
import type { AnalyzedBundle, DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import { createProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { analyzedBundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import type { PackageProcessor } from './package-processor.ts';
import { createScheduler } from './scheduler.ts';
import { createInspectPackageSideEffectsValidated } from './packtory-package-side-effects.ts';

type DeadCodeEliminatorInput = {
    readonly bundle: LinkedBundle;
};

type AnalyzedBundleState = Pick<AnalyzedBundle, 'contents' | 'sideEffectsField'>;

function linkedBundleFor(packageName: string): LinkedBundle {
    return linkedBundle({
        name: packageName,
        roots: {
            main: {
                javaScript: {
                    content: '',
                    isExecutable: false,
                    inputFilePath: `/repo/${packageName}/index.js`,
                    targetFilePath: 'index.js'
                }
            }
        }
    });
}

async function unexpectedPackageProcessorCall(): Promise<never> {
    throw new Error('unexpected package processor call');
}

function packageProcessor(): PackageProcessor {
    return {
        async resolveAndLink(options) {
            return linkedBundleFor(options.name);
        },
        async resolveAndLinkWithPromotedDeclarationCompanions(options) {
            return linkedBundleFor(options.name);
        },
        build: unexpectedPackageProcessorCall,
        buildAndPublish: unexpectedPackageProcessorCall,
        publishPreparedPackage: unexpectedPackageProcessorCall,
        tryBuildAndPublish: unexpectedPackageProcessorCall
    };
}

function failingPackageProcessor(error: Error): PackageProcessor {
    return {
        async resolveAndLink() {
            throw error;
        },
        async resolveAndLinkWithPromotedDeclarationCompanions() {
            throw error;
        },
        build: unexpectedPackageProcessorCall,
        buildAndPublish: unexpectedPackageProcessorCall,
        publishPreparedPackage: unexpectedPackageProcessorCall,
        tryBuildAndPublish: unexpectedPackageProcessorCall
    };
}

function deadCodeEliminator(state: AnalyzedBundleState): DeadCodeEliminator {
    return {
        async eliminate(inputs: readonly DeadCodeEliminatorInput[]) {
            return inputs.map(function (input) {
                return { ...input.bundle, contents: state.contents, sideEffectsField: state.sideEffectsField };
            });
        }
    };
}

function validatedConfiguration(
    additionalPackageManifestAttributes: Readonly<Record<string, unknown>> = {}
): ValidConfigurationWithoutRegistryResult {
    const validation = validateConfigurationWithoutRegistry({
        commonPackageSettings: {
            sourcesFolder: '/repo',
            mainPackageManifest: { type: 'module' },
            publishSettings: { access: 'public' }
        },
        packages: [
            {
                name: 'package-a',
                roots: { main: { javaScript: 'package-a/index.js' } },
                additionalPackageManifestAttributes
            }
        ]
    });
    if (validation.isErr) {
        throw new Error(validation.error.join('\n'));
    }
    return validation.value;
}

async function inspectSideEffects(
    state: AnalyzedBundleState,
    packageName = 'package-a',
    configuration = validatedConfiguration()
): ReturnType<ReturnType<typeof createInspectPackageSideEffectsValidated>> {
    const broadcaster = createProgressBroadcaster();
    const inspectPackageSideEffects = createInspectPackageSideEffectsValidated({
        repositoryFolder: '/repo',
        progressBroadcaster: broadcaster,
        scheduler: createScheduler({ progressBroadcastProvider: broadcaster.provider }),
        packageProcessor: packageProcessor(),
        deadCodeEliminator: deadCodeEliminator(state)
    });

    return await inspectPackageSideEffects(configuration, packageName);
}

function impureRuntimeFileAt(inputFilePath: string, targetFilePath: string): AnalyzedBundle['contents'][number] {
    return analyzedBundleResource(inputFilePath, {
        targetFilePath,
        analysis: {
            sideEffectStatements: [
                { line: 1, kind: 'expression statement' },
                { line: 3, kind: 'variable initializer' }
            ]
        }
    });
}

function impureRuntimeFile(): AnalyzedBundle['contents'][number] {
    return impureRuntimeFileAt('/repo/package-a/setup.ts', 'setup.js');
}

suite('packtory-package-side-effects', function () {
    test('reports sideEffects false when every runtime file is pure', async function () {
        const result = await inspectSideEffects({
            sideEffectsField: false,
            contents: [
                analyzedBundleResource('/repo/package-a/index.ts', { targetFilePath: 'index.js' })
            ]
        });

        assert.deepStrictEqual(result.isOk ? result.value : undefined, {
            packageName: 'package-a',
            packageManifestDecision: { type: 'side-effects-false' },
            impureFiles: []
        });
    });

    test('reports listed impure files with relative source paths and statement reasons', async function () {
        const result = await inspectSideEffects({
            sideEffectsField: [ './setup.js' ],
            contents: [
                analyzedBundleResource('/repo/package-a/index.ts', { targetFilePath: 'index.js' }),
                impureRuntimeFile(),
                analyzedBundleResource('/repo/package-a/index.d.ts', {
                    targetFilePath: 'index.d.ts',
                    analysis: { sideEffectStatements: [ { line: 1, kind: 'expression statement' } ] }
                })
            ]
        });

        if (result.isErr) {
            assert.fail('expected side effects inspection to succeed');
        }
        const [ file ] = result.value.impureFiles;
        assert.deepStrictEqual(result.value.packageManifestDecision, {
            type: 'side-effects-list',
            paths: [ './setup.js' ]
        });
        if (file === undefined) {
            assert.fail('expected an impure file');
        }
        assert.partialDeepStrictEqual(file, {
            sourcePath: 'package-a/setup.ts',
            packagePath: './setup.js'
        });
        assert.deepStrictEqual(
            file.statements.map(function (statement) {
                return `${statement.line}:${statement.kind}`;
            }),
            [ '1:expression statement', '3:variable initializer' ]
        );
    });

    test('sorts impure files by package path', async function () {
        const result = await inspectSideEffects({
            sideEffectsField: [ './first.js', './second.js' ],
            contents: [
                impureRuntimeFileAt('/repo/package-a/second.ts', 'second.js'),
                impureRuntimeFileAt('/repo/package-a/first.ts', 'first.js')
            ]
        });

        if (result.isErr) {
            assert.fail('expected side effects inspection to succeed');
        }
        assert.deepStrictEqual(
            result.value.impureFiles.map(function (file) {
                return file.packagePath;
            }),
            [ './first.js', './second.js' ]
        );
    });

    test('reports omitted sideEffects when every runtime file is impure', async function () {
        const result = await inspectSideEffects({
            sideEffectsField: undefined,
            contents: [ impureRuntimeFile() ]
        });

        assert.deepStrictEqual(result.isOk ? result.value.packageManifestDecision : undefined, {
            type: 'side-effects-omitted',
            reason: 'every-runtime-file-has-side-effects'
        });
    });

    test('reports user-provided sideEffects with the generated decision', async function () {
        const result = await inspectSideEffects(
            { sideEffectsField: false, contents: [] },
            'package-a',
            validatedConfiguration({ sideEffects: true })
        );

        assert.deepStrictEqual(result.isOk ? result.value.packageManifestDecision : undefined, {
            type: 'user-provided-side-effects',
            providedValue: true,
            generated: { type: 'side-effects-false' }
        });
    });

    test('returns package-not-found when no resolved package matches the requested name', async function () {
        const result = await inspectSideEffects({ sideEffectsField: false, contents: [] }, 'missing');

        assert.deepStrictEqual(result.isErr ? result.error : undefined, {
            type: 'package-not-found',
            packageName: 'missing'
        });
    });

    test('passes partial resolve failures through', async function () {
        const broadcaster = createProgressBroadcaster();
        const inspectPackageSideEffects = createInspectPackageSideEffectsValidated({
            repositoryFolder: '/repo',
            progressBroadcaster: broadcaster,
            scheduler: createScheduler({ progressBroadcastProvider: broadcaster.provider }),
            packageProcessor: failingPackageProcessor(new Error('resolve failed')),
            deadCodeEliminator: deadCodeEliminator({ sideEffectsField: false, contents: [] })
        });

        const result = await inspectPackageSideEffects(validatedConfiguration(), 'package-a');

        assert.strictEqual(result.isErr && result.error.type === 'partial', true);
    });
});
