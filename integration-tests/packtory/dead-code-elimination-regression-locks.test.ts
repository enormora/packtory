import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import type { AnalyzedBundle } from '../../source/dead-code-eliminator/analyzed-bundle.ts';
import { resolveAndLinkAll } from '../../source/packages/packtory/packtory.entry-point.ts';
import { assertValidDeadCodeEliminationOutput } from '../../source/test-libraries/dead-code-elimination-invariant-assertions.ts';
import {
    deadCodeEliminationAssertionSha256,
    deadCodeEliminationFixtureFilePaths,
    deadCodeEliminationFixtureSha256,
    type DeadCodeEliminationArtifactBundleContentCase,
    type DeadCodeEliminationContentAssertion,
    type DeadCodeEliminationConsumerProducerApiCase,
    type DeadCodeEliminationRegressionCase,
    type DeadCodeEliminationTextAssertion,
    eliminateDeadCodeEliminationArtifactBundle,
    type SourceMapSourcesAssertion,
    readDeadCodeEliminationRegressionCases
} from '../../source/test-libraries/dead-code-elimination-regression-locks.ts';
import { loadPackageJson } from '../load-package-json.ts';
import { importEmittedPackageEntry, runEmittedPackageApi } from './emitted-package-probe.ts';

const regressionManifestPath = path.join(
    process.cwd(),
    'integration-tests/fixtures/dead-code-elimination-regressions.json'
);
type ResolveAndLinkAllOutcome = Awaited<ReturnType<typeof resolveAndLinkAll>>;
type ResolvedPackages = Extract<ResolveAndLinkAllOutcome['result'], { readonly isOk: true; }>['value'];
type ResolvedPackage = ResolvedPackages[number];

const fixtureRootPath = path.join(process.cwd(), 'integration-tests/fixtures');

async function consumerProducerConfig(fixturePath: string): Promise<unknown> {
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

function findAnalyzedResource(
    analyzedBundle: AnalyzedBundle,
    regressionCase: Pick<DeadCodeEliminationRegressionCase, 'id'>,
    targetFilePath: string
): AnalyzedBundle['contents'][number] {
    const match = analyzedBundle.contents.find(function (resource) {
        return resource.fileDescription.targetFilePath === targetFilePath;
    });
    if (match === undefined) {
        assert.fail(`${regressionCase.id}: expected to find target file "${targetFilePath}"`);
    }
    return match;
}

async function readRegressionCases(): Promise<readonly DeadCodeEliminationRegressionCase[]> {
    return readDeadCodeEliminationRegressionCases(regressionManifestPath);
}

function fixturePathFor(regressionCase: DeadCodeEliminationRegressionCase): string {
    return path.join(fixtureRootPath, regressionCase.fixture);
}

function assertFixtureLock(regressionCase: DeadCodeEliminationRegressionCase, actualHash: string): void {
    const updateMessage = `${regressionCase.id} fixture lock changed.`;
    const updateInstruction = `Update fixtureSha256 to ${actualHash} if the fixture change is intentional.`;
    assert.strictEqual(
        actualHash,
        regressionCase.fixtureSha256,
        `${updateMessage} ${updateInstruction}`
    );
}

function assertAssertionLock(regressionCase: DeadCodeEliminationRegressionCase, actualHash: string): void {
    const updateMessage = `${regressionCase.id} assertion lock changed.`;
    const updateInstruction = `Update assertionSha256 to ${actualHash} if the assertion change is intentional.`;
    assert.strictEqual(
        actualHash,
        regressionCase.assertionSha256,
        `${updateMessage} ${updateInstruction}`
    );
}

function assertContent(
    regressionCase: Pick<DeadCodeEliminationRegressionCase, 'id'>,
    textAssertion: DeadCodeEliminationTextAssertion,
    content: string
): void {
    if (textAssertion.type === 'contains-text') {
        assert.ok(
            content.includes(textAssertion.text),
            `${regressionCase.id}: ${textAssertion.targetFilePath} must contain ${JSON.stringify(textAssertion.text)}`
        );
        return;
    }

    assert.strictEqual(
        content.includes(textAssertion.text),
        false,
        `${regressionCase.id}: ${textAssertion.targetFilePath} must omit ${JSON.stringify(textAssertion.text)}`
    );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sourceMapSources(content: string, regressionCase: Pick<DeadCodeEliminationRegressionCase, 'id'>): unknown {
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed)) {
        assert.fail(`${regressionCase.id}: source map content must be an object`);
    }
    return parsed.sources;
}

function assertSourceMapSources(
    regressionCase: Pick<DeadCodeEliminationRegressionCase, 'id'>,
    assertionInput: SourceMapSourcesAssertion,
    content: string
): void {
    assert.deepStrictEqual(
        sourceMapSources(content, regressionCase),
        assertionInput.sources,
        `${regressionCase.id}: ${assertionInput.targetFilePath} must keep expected source-map sources`
    );
}

function assertContentAssertion(
    regressionCase: Pick<DeadCodeEliminationRegressionCase, 'id'>,
    contentAssertion: DeadCodeEliminationContentAssertion,
    content: string
): void {
    if (contentAssertion.type === 'source-map-sources') {
        assertSourceMapSources(regressionCase, contentAssertion, content);
        return;
    }

    assertContent(regressionCase, contentAssertion, content);
}

function assertContentAssertions(
    regressionCase: DeadCodeEliminationRegressionCase,
    analyzedBundle: AnalyzedBundle
): void {
    for (const contentAssertion of regressionCase.contentAssertions) {
        const resource = findAnalyzedResource(analyzedBundle, regressionCase, contentAssertion.targetFilePath);
        assertContentAssertion(regressionCase, contentAssertion, resource.fileDescription.content);
    }
}

async function assertConsumerProducerApiCase(
    regressionCase: DeadCodeEliminationConsumerProducerApiCase
): Promise<void> {
    const result = await resolveAndLinkAll(await consumerProducerConfig(fixturePathFor(regressionCase)));
    const resolvedPackage = findPackage(expectOk(result), regressionCase.entryPackage);

    assertValidDeadCodeEliminationOutput(regressionCase.id, [ resolvedPackage.analyzedBundle ]);
    assertContentAssertions(regressionCase, resolvedPackage.analyzedBundle);
    assert.deepStrictEqual(
        await runEmittedPackageApi(resolvedPackage, regressionCase.entryTargetFilePath),
        regressionCase.expectedApiResult
    );
}

async function assertArtifactBundleContentCase(
    regressionCase: DeadCodeEliminationArtifactBundleContentCase
): Promise<void> {
    const analyzedBundle = await eliminateDeadCodeEliminationArtifactBundle(regressionCase, fixtureRootPath);
    assertValidDeadCodeEliminationOutput(regressionCase.id, [ analyzedBundle ]);
    assertContentAssertions(regressionCase, analyzedBundle);
    await importEmittedPackageEntry(analyzedBundle, regressionCase.entryTargetFilePath);
}

async function assertRegressionCase(regressionCase: DeadCodeEliminationRegressionCase): Promise<void> {
    if (regressionCase.type === 'artifact-bundle-content') {
        await assertArtifactBundleContentCase(regressionCase);
        return;
    }

    await assertConsumerProducerApiCase(regressionCase);
}

async function assertArtifactResourcesMatchFixture(
    regressionCase: DeadCodeEliminationRegressionCase
): Promise<void> {
    if (regressionCase.type !== 'artifact-bundle-content') {
        return;
    }

    const fixtureFiles = await deadCodeEliminationFixtureFilePaths(regressionCase, fixtureRootPath);
    const resourceFiles = regressionCase
        .resources
        .map(function (resource) {
            return resource.fixtureFilePath;
        })
        .toSorted(function (left, right) {
            return left.localeCompare(right);
        });
    assert.deepStrictEqual(
        resourceFiles,
        fixtureFiles,
        `${regressionCase.id}: artifact resources must list every fixture file exactly`
    );
}

suite('dead-code-elimination-regression-locks', function () {
    test('fixture locks match the regression manifest', async function () {
        const regressionCases = await readRegressionCases();
        for (const regressionCase of regressionCases) {
            await assertArtifactResourcesMatchFixture(regressionCase);
            assertFixtureLock(
                regressionCase,
                await deadCodeEliminationFixtureSha256(regressionCase, fixtureRootPath)
            );
        }
    });

    test('assertion locks match the regression manifest', async function () {
        const regressionCases = await readRegressionCases();
        for (const regressionCase of regressionCases) {
            assertAssertionLock(regressionCase, deadCodeEliminationAssertionSha256(regressionCase));
        }
    });

    test('locked regression cases keep their emitted behavior and content', async function () {
        const regressionCases = await readRegressionCases();
        for (const regressionCase of regressionCases) {
            await assertRegressionCase(regressionCase);
        }
    });
});
