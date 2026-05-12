import path from 'node:path';
import assert from 'node:assert';
import { test } from 'mocha';
import { resolveAndLinkAll } from '../../source/packages/packtory/packtory.entry-point.ts';
import { loadPackageJson } from '../load-package-json.ts';
import type { PacktoryConfigWithoutRegistry } from '../../source/config/config.ts';
import type { ResolvedPackage } from '../../source/packtory/resolved-package.ts';

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
                entryPoints: [{ js: path.join(fixturePath, 'src/pkg/index.js') }]
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
                entryPoints: [{ js: path.join(fixturePath, 'src/pkg-consumer/index.js') }],
                bundleDependencies: ['pkg-producer']
            },
            {
                name: 'pkg-producer',
                entryPoints: [{ js: path.join(fixturePath, 'src/pkg-producer/index.js') }]
            }
        ]
    };
}

function expectOk(outcome: Awaited<ReturnType<typeof resolveAndLinkAll>>): readonly ResolvedPackage[] {
    if (!outcome.result.isOk) {
        assert.fail(`Expected resolveAndLinkAll to succeed but got error: ${JSON.stringify(outcome.result.error)}`);
    }
    return outcome.result.value;
}

function findPackage(packages: readonly ResolvedPackage[], name: string): ResolvedPackage {
    const match = packages.find((entry) => {
        return entry.name === name;
    });
    if (match === undefined) {
        assert.fail(`Expected to find package "${name}"`);
    }
    return match;
}

function findResource(
    pkg: ResolvedPackage,
    targetFilePath: string
): ResolvedPackage['analyzedBundle']['contents'][number] {
    const match = pkg.analyzedBundle.contents.find((resource) => {
        return resource.fileDescription.targetFilePath === targetFilePath;
    });
    if (match === undefined) {
        assert.fail(`Expected to find target file "${targetFilePath}" in bundle "${pkg.name}"`);
    }
    return match;
}

test('happy path: removes an unused exported helper from a shared module while keeping the used one', async () => {
    const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/dead-code-elimination');
    const config = await singlePackageConfig(fixturePath);
    const result = await resolveAndLinkAll(config);
    const packages = expectOk(result);
    const pkg = findPackage(packages, 'pkg');
    const helpers = findResource(pkg, 'shared/helpers.js');

    assert.ok(helpers.fileDescription.content.includes('used'), 'used() should remain');
    assert.strictEqual(helpers.fileDescription.content.includes('unused'), false, 'unused() should be removed by DCE');
});

test('keeps a side-effecting file untouched and lists it in sideEffectsField', async () => {
    const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/dead-code-elimination-side-effects');
    const config = await singlePackageConfig(fixturePath);
    const result = await resolveAndLinkAll(config);
    const packages = expectOk(result);
    const pkg = findPackage(packages, 'pkg');
    const entry = findResource(pkg, 'pkg/index.js');

    assert.ok(
        entry.fileDescription.content.includes('unusedHelper'),
        'unusedHelper must be kept because the file has top-level side effects'
    );
    assert.deepStrictEqual(pkg.analyzedBundle.sideEffectsField, ['./pkg/index.js']);
});

test('preserves a binding in pkg-producer that pkg-consumer imports across bundles', async () => {
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

test('the smart noDuplicatedFiles rule reports shared declarations using symbol names', async () => {
    const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
    const config: PacktoryConfigWithoutRegistry = {
        commonPackageSettings: {
            sourcesFolder: path.join(fixturePath, 'src'),
            mainPackageJson: await loadPackageJson(fixturePath),
            publishSettings: { access: 'public' }
        },
        packages: [
            { name: 'pkg-a', entryPoints: [{ js: path.join(fixturePath, 'src/pkg-a/index.js') }] },
            { name: 'pkg-b', entryPoints: [{ js: path.join(fixturePath, 'src/pkg-b/index.js') }] }
        ],
        checks: { noDuplicatedFiles: { enabled: true } }
    };
    const { result } = await resolveAndLinkAll(config);
    if (!result.isErr) {
        assert.fail('Expected the noDuplicatedFiles rule to fail');
        return;
    }
    if (result.error.type !== 'checks') {
        assert.fail(`Expected a checks failure, got ${result.error.type}`);
    }
    const [issue] = result.error.issues;
    assert.ok(issue !== undefined);
    assert.ok(issue.includes('shared/util.js'));
    assert.ok(issue.includes('"sharedValue"'), 'message should name the shared declaration');
});
