import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import {
    createProcessor,
    createResolveOptions,
    createTransferableFile,
    getCallArgs
} from '../test-libraries/package-processor-test-support.ts';

suite('package-processor progress', function () {
    test('resolveAndLink() emits scanCompleted with the resolved bundle scan results when subscribed', async function () {
        const hasSubscribers = fake(function (eventName: string) {
            return eventName === 'scanCompleted';
        });
        const resolve = fake.resolves({
            name: 'package-a',
            contents: [ { fileDescription: { sourceFilePath: '/src/a.ts' } } ],
            roots: { main: { js: createTransferableFile('/entry.js') } } as const,
            surface: { mode: 'implicit', defaultModuleRoot: 'main' } as const,
            externalDependencies: new Map([ [ 'lodash', { version: '^4' } ] ])
        });
        const { processor, emit } = createProcessor({ hasSubscribers, resolve });

        await processor.resolveAndLink(createResolveOptions());

        const scanCalls = getCallArgs(emit).filter(function (args) {
            return args[0] === 'scanCompleted';
        });
        assert.strictEqual(scanCalls.length, 1);
        assert.deepStrictEqual(scanCalls[0], [
            'scanCompleted',
            {
                packageName: 'package-a',
                included: [ { path: '/src/a.ts', reason: 'reachable-from-entry' } ],
                excluded: [ { specifier: 'lodash', reason: 'external-module' } ]
            }
        ]);
    });

    test('resolveAndLink() does NOT emit scanCompleted when no subscriber is registered', async function () {
        const { processor, emit } = createProcessor();

        await processor.resolveAndLink(createResolveOptions());

        const scanCalls = getCallArgs(emit).filter(function (args) {
            return args[0] === 'scanCompleted';
        });
        assert.strictEqual(scanCalls.length, 0);
    });

    test('resolveAndLink() emits linkingCompleted with the linker rewrites when subscribed', async function () {
        const hasSubscribers = fake(function (eventName: string) {
            return eventName === 'linkingCompleted';
        });
        const linkBundle = fake.resolves({
            name: 'package-a',
            contents: [ { fileDescription: { sourceFilePath: '/src/a.ts' }, isSubstituted: true } ],
            roots: { main: { js: createTransferableFile('/entry.js') } } as const,
            surface: { mode: 'implicit', defaultModuleRoot: 'main' } as const,
            linkedBundleDependencies: new Map([ [ 'pkg-b', {} ] ]),
            externalDependencies: new Map()
        });
        const { processor, emit } = createProcessor({ hasSubscribers, linkBundle });

        await processor.resolveAndLink(createResolveOptions());

        const linkingCalls = getCallArgs(emit).filter(function (args) {
            return args[0] === 'linkingCompleted';
        });
        assert.strictEqual(linkingCalls.length, 1);
        assert.deepStrictEqual(linkingCalls[0], [
            'linkingCompleted',
            {
                packageName: 'package-a',
                rewrites: [
                    {
                        file: '/src/a.ts',
                        fromSpecifier: '/src/a.ts',
                        toSpecifier: 'pkg-b',
                        targetBundle: 'pkg-b'
                    }
                ]
            }
        ]);
    });

    test('resolveAndLink() does NOT emit linkingCompleted when no subscriber is registered', async function () {
        const { processor, emit } = createProcessor();

        await processor.resolveAndLink(createResolveOptions());

        const linkingCalls = getCallArgs(emit).filter(function (args) {
            return args[0] === 'linkingCompleted';
        });
        assert.strictEqual(linkingCalls.length, 0);
    });
});
