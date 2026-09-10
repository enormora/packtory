import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import { resolveAndLinkAll } from '../../source/packages/packtory/packtory.entry-point.ts';
import { assertValidDeadCodeEliminationOutput } from '../../source/test-libraries/dead-code-elimination-invariant-assertions.ts';
import {
    deadCodeEliminationAssertionSha256,
    deadCodeEliminationFixtureSha256,
    type DeadCodeEliminationRegressionCase,
    type DeadCodeEliminationTextAssertion,
    readDeadCodeEliminationRegressionCases
} from '../../source/test-libraries/dead-code-elimination-regression-locks.ts';
import { loadPackageJson } from '../load-package-json.ts';
import { runEmittedPackageApi } from './emitted-package-probe.ts';

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
    regressionCase: DeadCodeEliminationRegressionCase,
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

function assertContentAssertions(
    regressionCase: DeadCodeEliminationRegressionCase,
    resolvedPackage: ResolvedPackage
): void {
    for (const textAssertion of regressionCase.contentAssertions) {
        const resource = findResource(resolvedPackage, textAssertion.targetFilePath);
        assertContent(regressionCase, textAssertion, resource.fileDescription.content);
    }
}

async function assertRegressionCase(regressionCase: DeadCodeEliminationRegressionCase): Promise<void> {
    const result = await resolveAndLinkAll(await consumerProducerConfig(fixturePathFor(regressionCase)));
    const resolvedPackage = findPackage(expectOk(result), regressionCase.entryPackage);

    assertValidDeadCodeEliminationOutput(regressionCase.id, [ resolvedPackage.analyzedBundle ]);
    assertContentAssertions(regressionCase, resolvedPackage);
    assert.deepStrictEqual(
        await runEmittedPackageApi(resolvedPackage, regressionCase.entryTargetFilePath),
        regressionCase.expectedApiResult
    );
}

suite('dead-code-elimination-regression-locks', function () {
    test('fixture locks match the regression manifest', async function () {
        const regressionCases = await readRegressionCases();
        for (const regressionCase of regressionCases) {
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
