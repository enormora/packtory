import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { resolveAndLinkAll } from '../../source/packages/packtory/packtory.entry-point.ts';
import { loadPackageManifest } from '../load-package-manifest.ts';
import type { PacktoryConfigurationWithoutRegistry } from '../../source/configuration/configuration.ts';
import type { ResolvedPackage } from '../../source/packtory/resolved-package.ts';
import { assertValidDeadCodeEliminationOutput } from '../../source/test-libraries/dead-code-elimination-invariant-assertions.ts';
import { runEmittedPackageApplicationProgrammingInterface } from './emitted-package-probe.ts';

async function singlePackageConfiguration(fixturePath: string): Promise<PacktoryConfigurationWithoutRegistry> {
    return {
        commonPackageSettings: {
            sourcesFolder: path.join(fixturePath, 'source'),
            mainPackageManifest: await loadPackageManifest(fixturePath),
            publishSettings: { access: 'public' }
        },
        packages: [
            {
                name: 'package',
                roots: { main: { javaScript: path.join(fixturePath, 'source/package/index.js') } }
            }
        ]
    };
}

async function consumerProducerConfiguration(fixturePath: string): Promise<PacktoryConfigurationWithoutRegistry> {
    return {
        commonPackageSettings: {
            sourcesFolder: path.join(fixturePath, 'source'),
            mainPackageManifest: await loadPackageManifest(fixturePath),
            publishSettings: { access: 'public' }
        },
        packages: [
            {
                name: 'package-consumer',
                roots: { main: { javaScript: path.join(fixturePath, 'source/package-consumer/index.js') } },
                bundleDependencies: [ 'package-producer' ]
            },
            {
                name: 'package-producer',
                roots: { main: { javaScript: path.join(fixturePath, 'source/package-producer/index.js') } }
            }
        ]
    };
}

async function duplicatedFilesConfiguration(fixturePath: string): Promise<PacktoryConfigurationWithoutRegistry> {
    return {
        commonPackageSettings: {
            sourcesFolder: path.join(fixturePath, 'source'),
            mainPackageManifest: await loadPackageManifest(fixturePath),
            publishSettings: { access: 'public' }
        },
        packages: [
            { name: 'package-a', roots: { main: { javaScript: path.join(fixturePath, 'source/package-a/index.js') } } },
            { name: 'package-b', roots: { main: { javaScript: path.join(fixturePath, 'source/package-b/index.js') } } }
        ],
        checks: { noDuplicatedFiles: { enabled: true } }
    };
}

function expectOk(outcome: Awaited<ReturnType<typeof resolveAndLinkAll>>): readonly ResolvedPackage[] {
    if (!outcome.result.isOk) {
        assert.fail(`Expected resolveAndLinkAll to succeed but got error: ${JSON.stringify(outcome.result.error)}`);
    }
    return outcome.result.value;
}

function findPackage(packages: readonly ResolvedPackage[], name: string): ResolvedPackage {
    const match = packages.find(function (entry) {
        return entry.name === name;
    });
    if (match === undefined) {
        assert.fail(`Expected to find package "${name}"`);
    }
    return match;
}

function mapKeys(map: ReadonlyMap<string, unknown>): readonly string[] {
    return Array.from(map.keys());
}

function targetPaths(resolvedPackage: ResolvedPackage): readonly string[] {
    return resolvedPackage.analyzedBundle.contents.map(function (resource) {
        return resource.fileDescription.targetFilePath;
    });
}

function findResource(
    resolvedPackage: ResolvedPackage,
    targetFilePath: string
): ResolvedPackage['analyzedBundle']['contents'][number] {
    const match = resolvedPackage.analyzedBundle.contents.find(function (resource) {
        return resource.fileDescription.targetFilePath === targetFilePath;
    });
    if (match === undefined) {
        assert.fail(`Expected to find target file "${targetFilePath}" in bundle "${resolvedPackage.name}"`);
    }
    return match;
}

function assertSharedDeclarationIssue(
    result: Readonly<Awaited<ReturnType<typeof resolveAndLinkAll>>['result']>
): void {
    if (!result.isErr) {
        assert.fail('Expected the noDuplicatedFiles rule to fail');
        return;
    }
    if (result.error.type !== 'checks') {
        assert.fail(`Expected a checks failure, got ${result.error.type}`);
    }
    const [ issue ] = result.error.issues;
    if (issue === undefined) {
        assert.fail('expected issue');
    }
    assert.ok(issue.includes('shared/utilities.js'));
    assert.ok(issue.includes('"sharedValue"'), 'message should name the shared declaration');
}

function assertDeadDependencyMetadataRemoved(consumer: ResolvedPackage): void {
    const entry = findResource(consumer, 'package-consumer/index.js');

    assert.strictEqual(entry.fileDescription.content.includes('common-tags'), false);
    assert.strictEqual(entry.fileDescription.content.includes('package-producer'), false);
    assert.deepStrictEqual(mapKeys(consumer.analyzedBundle.externalDependencies), []);
    assert.deepStrictEqual(mapKeys(consumer.analyzedBundle.linkedBundleDependencies), []);
    assert.deepStrictEqual(mapKeys(consumer.analyzedBundle.substitutedInputFilePathsByPackageName), []);
}

suite('dead-code-elimination', function () {
    test('happy path: removes an unused exported helper from a shared module while keeping the used one', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/dead-code-elimination');
        const configuration = await singlePackageConfiguration(fixturePath);
        const result = await resolveAndLinkAll(configuration);
        const packages = expectOk(result);
        const resolvedPackage = findPackage(packages, 'package');
        const helpers = findResource(resolvedPackage, 'shared/helpers.js');

        assert.ok(helpers.fileDescription.content.includes('used'), 'used() should remain');
        assert.strictEqual(
            helpers.fileDescription.content.includes('unused'),
            false,
            'unused() should be removed by dead code elimination'
        );
    });

    test('repairs stale imports so emitted ECMAScript modules instantiate after dead code elimination', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/dead-code-elimination');
        const configuration = await singlePackageConfiguration(fixturePath);
        const result = await resolveAndLinkAll(configuration);
        const packages = expectOk(result);
        const resolvedPackage = findPackage(packages, 'package');
        const entry = findResource(resolvedPackage, 'package/index.js');

        assert.strictEqual(entry.fileDescription.content.includes('unused'), false);
        assert.strictEqual(
            await runEmittedPackageApplicationProgrammingInterface(resolvedPackage, 'package/index.js'),
            'helper-used-result'
        );
    });

    test('prunes pure files reached only by code removed by dead code elimination', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/dead-code-elimination');
        const configuration = await singlePackageConfiguration(fixturePath);
        const result = await resolveAndLinkAll(configuration);
        const packages = expectOk(result);
        const resolvedPackage = findPackage(packages, 'package');

        assert.strictEqual(targetPaths(resolvedPackage).includes('dead-local.js'), false);
    });

    test('removes dead declarations from a side-effecting file and lists it in sideEffectsField', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/dead-code-elimination-side-effects');
        const configuration = await singlePackageConfiguration(fixturePath);
        const result = await resolveAndLinkAll(configuration);
        const packages = expectOk(result);
        const resolvedPackage = findPackage(packages, 'package');
        const entry = findResource(resolvedPackage, 'package/index.js');

        assert.strictEqual(entry.fileDescription.content.includes('unusedHelper'), false);
        assert.strictEqual(entry.fileDescription.content.includes('module loaded'), true);
        assert.deepStrictEqual(resolvedPackage.analyzedBundle.sideEffectsField, [ './package/index.js' ]);
    });

    test('preserves a binding in package-producer that package-consumer imports across bundles', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/dead-code-elimination-cross-bundle');
        const configuration = await consumerProducerConfiguration(fixturePath);
        const result = await resolveAndLinkAll(configuration);
        const packages = expectOk(result);
        const producer = findPackage(packages, 'package-producer');
        const helpers = findResource(producer, 'package-producer/helpers.js');

        assert.ok(
            helpers.fileDescription.content.includes('consumedExport'),
            'consumedExport must remain because package-consumer imports it across the bundle boundary'
        );
        assert.strictEqual(
            helpers.fileDescription.content.includes('unconsumedExport'),
            false,
            'unconsumedExport should be removed since neither package-producer entry nor package-consumer references it'
        );
    });

    test('removes metadata for external and sibling imports removed by dead code elimination', async function () {
        const fixturePath = path.join(
            process.cwd(),
            'integration-tests/fixtures/dead-code-elimination-dead-dependencies'
        );
        const configuration = await consumerProducerConfiguration(fixturePath);
        const result = await resolveAndLinkAll(configuration);
        const packages = expectOk(result);
        const consumer = findPackage(packages, 'package-consumer');

        assertDeadDependencyMetadataRemoved(consumer);
    });

    test('preserves a runtime config object imported from a promoted declaration companion module', async function () {
        const fixturePath = path.join(
            process.cwd(),
            'integration-tests/fixtures/dead-code-elimination-declaration-companion-regression'
        );
        const configuration = await consumerProducerConfiguration(fixturePath);
        const result = await resolveAndLinkAll(configuration);
        const packages = expectOk(result);
        const producer = findPackage(packages, 'package-producer');
        const shared = findResource(producer, 'package-producer/shared.js');

        assertValidDeadCodeEliminationOutput(
            'declaration companion integration regression',
            [ producer.analyzedBundle ]
        );
        assert.ok(
            shared.fileDescription.content.includes('export const sharedConfig'),
            'sharedConfig must remain because emitted modules still import it'
        );
        assert.strictEqual(shared.fileDescription.content.includes('unusedConfig'), false);
        assert.strictEqual(
            await runEmittedPackageApplicationProgrammingInterface(producer, 'package-producer/index.js'),
            'error'
        );
    });

    test('the smart noDuplicatedFiles rule reports shared declarations using symbol names', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
        const { result } = await resolveAndLinkAll(await duplicatedFilesConfiguration(fixturePath));
        assertSharedDeclarationIssue(result);
    });
});
