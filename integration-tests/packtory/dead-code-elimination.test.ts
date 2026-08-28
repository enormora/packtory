import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { resolveAndLinkAll } from '../../source/packages/packtory/packtory.entry-point.ts';
import { loadPackageJson } from '../load-package-json.ts';
import type { PacktoryConfigWithoutRegistry } from '../../source/config/config.ts';
import type { ResolvedPackage } from '../../source/packtory/resolved-package.ts';
import { runEmittedPackageApi } from './emitted-package-probe.ts';

async function singlePackageConfig(fixturePath: string): Promise<PacktoryConfigWithoutRegistry> {
    return {
        commonPackageSettings: {
            sourcesFolder: path.join(fixturePath, 'src'),
            mainPackageJson: await loadPackageJson(fixturePath),
            publishSettings: { access: 'public' }
        },
        packages: [
            {
                name: 'pkg',
                roots: { main: { js: path.join(fixturePath, 'src/pkg/index.js') } }
            }
        ]
    };
}

async function consumerProducerConfig(fixturePath: string): Promise<PacktoryConfigWithoutRegistry> {
    return {
        commonPackageSettings: {
            sourcesFolder: path.join(fixturePath, 'src'),
            mainPackageJson: await loadPackageJson(fixturePath),
            publishSettings: { access: 'public' }
        },
        packages: [
            {
                name: 'pkg-consumer',
                roots: { main: { js: path.join(fixturePath, 'src/pkg-consumer/index.js') } },
                bundleDependencies: [ 'pkg-producer' ]
            },
            {
                name: 'pkg-producer',
                roots: { main: { js: path.join(fixturePath, 'src/pkg-producer/index.js') } }
            }
        ]
    };
}

async function duplicatedFilesConfig(fixturePath: string): Promise<PacktoryConfigWithoutRegistry> {
    return {
        commonPackageSettings: {
            sourcesFolder: path.join(fixturePath, 'src'),
            mainPackageJson: await loadPackageJson(fixturePath),
            publishSettings: { access: 'public' }
        },
        packages: [
            { name: 'pkg-a', roots: { main: { js: path.join(fixturePath, 'src/pkg-a/index.js') } } },
            { name: 'pkg-b', roots: { main: { js: path.join(fixturePath, 'src/pkg-b/index.js') } } }
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
    assert.ok(issue.includes('shared/util.js'));
    assert.ok(issue.includes('"sharedValue"'), 'message should name the shared declaration');
}

function assertDeadDependencyMetadataRemoved(consumer: ResolvedPackage): void {
    const entry = findResource(consumer, 'pkg-consumer/index.js');

    assert.strictEqual(entry.fileDescription.content.includes('common-tags'), false);
    assert.strictEqual(entry.fileDescription.content.includes('pkg-producer'), false);
    assert.deepStrictEqual(mapKeys(consumer.analyzedBundle.externalDependencies), []);
    assert.deepStrictEqual(mapKeys(consumer.analyzedBundle.linkedBundleDependencies), []);
    assert.deepStrictEqual(mapKeys(consumer.analyzedBundle.substitutedSourceFilePathsByPackageName), []);
}

suite('dead-code-elimination', function () {
    test('happy path: removes an unused exported helper from a shared module while keeping the used one', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/dead-code-elimination');
        const config = await singlePackageConfig(fixturePath);
        const result = await resolveAndLinkAll(config);
        const packages = expectOk(result);
        const resolvedPackage = findPackage(packages, 'pkg');
        const helpers = findResource(resolvedPackage, 'shared/helpers.js');

        assert.ok(helpers.fileDescription.content.includes('used'), 'used() should remain');
        assert.strictEqual(
            helpers.fileDescription.content.includes('unused'),
            false,
            'unused() should be removed by DCE'
        );
    });

    test('repairs stale imports so emitted ESM instantiates after DCE', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/dead-code-elimination');
        const config = await singlePackageConfig(fixturePath);
        const result = await resolveAndLinkAll(config);
        const packages = expectOk(result);
        const resolvedPackage = findPackage(packages, 'pkg');
        const entry = findResource(resolvedPackage, 'pkg/index.js');

        assert.strictEqual(entry.fileDescription.content.includes('unused'), false);
        assert.strictEqual(await runEmittedPackageApi(resolvedPackage, 'pkg/index.js'), 'helper-used-result');
    });

    test('prunes pure files reached only by code removed by DCE', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/dead-code-elimination');
        const config = await singlePackageConfig(fixturePath);
        const result = await resolveAndLinkAll(config);
        const packages = expectOk(result);
        const resolvedPackage = findPackage(packages, 'pkg');

        assert.strictEqual(targetPaths(resolvedPackage).includes('dead-local.js'), false);
    });

    test('removes dead declarations from a side-effecting file and lists it in sideEffectsField', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/dead-code-elimination-side-effects');
        const config = await singlePackageConfig(fixturePath);
        const result = await resolveAndLinkAll(config);
        const packages = expectOk(result);
        const resolvedPackage = findPackage(packages, 'pkg');
        const entry = findResource(resolvedPackage, 'pkg/index.js');

        assert.strictEqual(entry.fileDescription.content.includes('unusedHelper'), false);
        assert.strictEqual(entry.fileDescription.content.includes('module loaded'), true);
        assert.deepStrictEqual(resolvedPackage.analyzedBundle.sideEffectsField, [ './pkg/index.js' ]);
    });

    test('preserves a binding in pkg-producer that pkg-consumer imports across bundles', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/dead-code-elimination-cross-bundle');
        const config = await consumerProducerConfig(fixturePath);
        const result = await resolveAndLinkAll(config);
        const packages = expectOk(result);
        const producer = findPackage(packages, 'pkg-producer');
        const helpers = findResource(producer, 'pkg-producer/helpers.js');

        assert.ok(
            helpers.fileDescription.content.includes('consumedExport'),
            'consumedExport must remain because pkg-consumer imports it across the bundle boundary'
        );
        assert.strictEqual(
            helpers.fileDescription.content.includes('unconsumedExport'),
            false,
            'unconsumedExport should be removed since neither pkg-producer entry nor pkg-consumer references it'
        );
    });

    test('removes metadata for external and sibling imports removed by DCE', async function () {
        const fixturePath = path.join(
            process.cwd(),
            'integration-tests/fixtures/dead-code-elimination-dead-dependencies'
        );
        const config = await consumerProducerConfig(fixturePath);
        const result = await resolveAndLinkAll(config);
        const packages = expectOk(result);
        const consumer = findPackage(packages, 'pkg-consumer');

        assertDeadDependencyMetadataRemoved(consumer);
    });

    test('preserves a runtime config object imported from a promoted declaration companion module', async function () {
        const fixturePath = path.join(
            process.cwd(),
            'integration-tests/fixtures/dead-code-elimination-declaration-companion-regression'
        );
        const config = await consumerProducerConfig(fixturePath);
        const result = await resolveAndLinkAll(config);
        const packages = expectOk(result);
        const producer = findPackage(packages, 'pkg-producer');
        const shared = findResource(producer, 'pkg-producer/shared.js');

        assert.ok(
            shared.fileDescription.content.includes('export const sharedConfig'),
            'sharedConfig must remain because emitted modules still import it'
        );
        assert.strictEqual(shared.fileDescription.content.includes('unusedConfig'), false);
        assert.strictEqual(await runEmittedPackageApi(producer, 'pkg-producer/index.js'), 'error');
    });

    test('the smart noDuplicatedFiles rule reports shared declarations using symbol names', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
        const { result } = await resolveAndLinkAll(await duplicatedFilesConfig(fixturePath));
        assertSharedDeclarationIssue(result);
    });
});
