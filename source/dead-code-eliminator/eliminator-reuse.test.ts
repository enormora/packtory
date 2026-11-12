import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { assertDeepSubset, assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { bundleForCodeFile, inputs } from '../test-libraries/eliminator-test-support.ts';
import { createDeadCodeEliminator, type InspectableDeadCodeEliminator } from './eliminator.ts';
import type { EliminationInput } from './analyzed-bundle.ts';
import type { DeadCodeEliminationTrace } from './trace.ts';

function eliminationInput(content: string): readonly EliminationInput[] {
    return inputs(bundleForCodeFile({
        name: 'package',
        inputFilePath: '/source/index.js',
        targetFilePath: 'index.js',
        content
    }));
}

type ObservedEliminator = {
    readonly projects: SinonSpy;
    readonly emit: SinonSpy;
    readonly eliminator: InspectableDeadCodeEliminator;
};

function observedEliminator(trace: DeadCodeEliminationTrace): ObservedEliminator {
    const projects = fake(function () {
        return createProject();
    });
    const emit = fake(function (): void {
        return undefined;
    });
    const eliminator = createDeadCodeEliminator({
        createProject: projects,
        progressBroadcaster: { emit, hasSubscribers: fake.returns(true) },
        trace
    });
    return { projects, emit, eliminator };
}

suite('elimination reuse', function () {
    test('observes edits to a previously analyzed input object', async function () {
        const { projects, eliminator } = observedEliminator(undefined);
        const original = eliminationInput('const dead = 1; export const value = 42;');
        const resource = original[0]?.bundle.contents[0];
        assertDefined(resource);
        await eliminator.eliminate(original);
        Object.assign(resource.fileDescription, { content: 'export const renamed = 43;' });
        const changed = await eliminator.eliminate(original);
        assert.match(changed[0]?.contents[0]?.fileDescription.content ?? '', /renamed/u);
        assert.strictEqual(projects.callCount, 4);
    });

    test('continues analyzing inputs with nonserializable metadata', async function () {
        const { projects, eliminator } = observedEliminator(undefined);
        const original = eliminationInput('const dead = 1; export const value = 42;').map(function (input) {
            return {
                ...input,
                bundle: {
                    ...input.bundle,
                    describe() {
                        return 'metadata';
                    }
                }
            };
        });
        const first = await eliminator.eliminate(original);
        assert.deepStrictEqual(await eliminator.eliminate(original), first);
        assert.strictEqual(projects.callCount, 4);
    });

    test('reuses identical graphs and preserves progress events without rebuilding compiler projects', async function () {
        const { projects, emit, eliminator } = observedEliminator(undefined);
        const original = eliminationInput('const dead = 1; export const value = 42;');
        const first = await eliminator.eliminate(original);
        assert.deepStrictEqual(await eliminator.eliminate(structuredClone(original)), first);
        assert.strictEqual(projects.callCount, 2);
        assertDeepSubset(emit, { callCount: 2, firstCall: { arguments: emit.secondCall.args } });
    });

    test('recomputes changed source contents and elimination settings', async function () {
        const { projects, eliminator } = observedEliminator(undefined);
        await eliminator.eliminate(eliminationInput('const dead = 1; export const value = 42;'));
        const changed = eliminationInput('const dead = 1; export const value = 43;');
        const output = await eliminator.eliminate(changed);
        assert.strictEqual(output[0]?.contents[0]?.fileDescription.content.includes('43'), true);
        assert.strictEqual(projects.callCount, 4);
        const disabled = changed.map(function (input) {
            return { ...input, transformationsEnabled: false };
        });
        const preserved = await eliminator.eliminate(disabled);
        assert.strictEqual(preserved[0]?.contents[0]?.fileDescription.content.includes('dead'), true);
        assert.strictEqual(projects.callCount, 6);
    });

    test('repeats full traces for identical inputs', async function () {
        const record = fake(function (): void {
            return undefined;
        });
        const { projects, eliminator } = observedEliminator({ collector: { record } });
        const original = eliminationInput('const dead = 1; export const value = 42;');
        await eliminator.eliminate(original);
        const first = record.args.slice();
        assert.ok(first.length > 0);
        await eliminator.eliminate(structuredClone(original));
        assert.deepStrictEqual(record.args.slice(first.length), first);
        assert.strictEqual(projects.callCount, 4);
    });
});
