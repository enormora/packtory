import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { withPromiseDeadline } from '../../test-libraries/promise-with-deadline.ts';
import { createPreviewInputOutput, type PreviewInputOutput } from './preview-input-output-shared.ts';
import type { SpawnedProcess, SpawnOptions } from './preview-spawn.ts';

type FakeSpawnResult = {
    readonly command: string;
    readonly commandArguments: readonly string[];
    readonly options: SpawnOptions;
    readonly child: FakeSpawnedProcess;
};

type PreviewInputOutputFactoryOverrides = {
    readonly openFile?: ((filePath: string) => Promise<void>) | undefined;
    readonly pager?: string | undefined;
    readonly shell?: string | undefined;
    readonly standardOutputIsTerminal?: boolean;
    readonly spawnHook?: ((result: FakeSpawnResult) => void) | undefined;
    readonly standardInputMode?: 'null' | 'pipe';
};

type ExposedFakeProcessListeners = {
    readonly close?: ((code?: number) => void) | undefined;
    readonly error?: (() => void) | undefined;
    readonly standardInputError?: (() => void) | undefined;
};

type FakeSpawnedProcess = {
    readonly standardInput: SpawnedProcess['standardInput'];
    readonly on: SpawnedProcess['on'];
    readonly unref: SpawnedProcess['unref'];
    readonly endedContent: string;
    readonly wasUnrefCalled: boolean;
    readonly listeners: ExposedFakeProcessListeners;
};

type PreviewInputOutputFactoryResult = {
    readonly previewInputOutput: PreviewInputOutput;
    readonly calls: readonly FakeSpawnResult[];
    readonly openedFiles: readonly string[];
};

function createFakeSpawnedProcess(
    standardInputMode: PreviewInputOutputFactoryOverrides['standardInputMode'] = 'pipe'
): FakeSpawnedProcess {
    const listeners = {
        close: undefined as ((code?: number) => void) | undefined,
        error: undefined as (() => void) | undefined,
        standardInputError: undefined as (() => void) | undefined
    };
    let endedContent = '';
    let wasUnrefCalled = false;
    const standardInput = standardInputMode === 'pipe'
        ? {
            on(eventName: string, listener: () => void): void {
                if (eventName === 'error') {
                    listeners.standardInputError = listener;
                }
            },
            end(content: string): void {
                endedContent = content;
            }
        }
        : null;
    const child: FakeSpawnedProcess = {
        standardInput,
        get endedContent() {
            return endedContent;
        },
        get wasUnrefCalled() {
            return wasUnrefCalled;
        },
        listeners,
        on(eventName: string, listener: (value?: number) => void): void {
            if (eventName === 'close') {
                listeners.close = listener;
                return;
            }
            if (eventName === 'error') {
                listeners.error = listener;
            }
        },
        unref(): void {
            wasUnrefCalled = true;
        }
    };

    return child;
}

async function ignoreOpenFile(filePath: string): Promise<void> {
    assert.strictEqual(typeof filePath, 'string');
}

function previewInputOutputFactory(
    overrides: PreviewInputOutputFactoryOverrides = {}
): PreviewInputOutputFactoryResult {
    const calls: FakeSpawnResult[] = [];
    const openedFiles: string[] = [];
    const openFile = overrides.openFile ?? ignoreOpenFile;

    const previewInputOutput = createPreviewInputOutput({
        async openFile(filePath) {
            openedFiles.push(filePath);
            await openFile(filePath);
        },
        spawnProcess(command, commandArguments, options) {
            const child = createFakeSpawnedProcess(overrides.standardInputMode);
            const result = { command, commandArguments, options, child };
            calls.push(result);
            overrides.spawnHook?.(result);
            return child;
        },
        randomUniqueIdentifier() {
            return 'uuid-123';
        },
        temporaryDirectory() {
            return '/workspace/tmp';
        },
        shell: overrides.shell,
        pager: overrides.pager,
        standardOutputIsTerminal: overrides.standardOutputIsTerminal ?? true
    });
    return { previewInputOutput, calls, openedFiles };
}

function requireFirstCall(calls: readonly FakeSpawnResult[]): FakeSpawnResult {
    const [ firstCall ] = calls;
    if (firstCall === undefined) {
        assert.fail('expected a spawned process');
    }
    return firstCall;
}

function closeProcess(code: number): NonNullable<PreviewInputOutputFactoryOverrides['spawnHook']> {
    return function ({ child }: FakeSpawnResult) {
        queueMicrotask(function () {
            child.listeners.close?.(code);
        });
    };
}

function emitProcessError(
    kind: 'error' | 'standardInputError'
): NonNullable<PreviewInputOutputFactoryOverrides['spawnHook']> {
    return function ({ child }: FakeSpawnResult) {
        queueMicrotask(function () {
            child.listeners[kind]?.();
        });
    };
}

suite('preview-io-shared', function () {
    test('createTemporaryPreviewHypertextMarkupLanguagePath uses tmpdir and the generated uuid', function () {
        const { previewInputOutput: inputOutput } = previewInputOutputFactory();

        assert.strictEqual(
            inputOutput.createTemporaryPreviewHypertextMarkupLanguagePath(),
            '/workspace/tmp/packtory-preview-uuid-123.html'
        );
    });

    suite('pagePreviewOutput', function () {
        test('returns false immediately when stdout is not a TTY', async function () {
            const { previewInputOutput: inputOutput, calls } = previewInputOutputFactory({
                standardOutputIsTerminal: false
            });

            assert.strictEqual(
                await withPromiseDeadline(inputOutput.pagePreviewOutput('content'), 'non-interactive preview skip'),
                false
            );
            assert.deepStrictEqual(calls, []);
        });

        test('uses the configured pager when it succeeds', async function () {
            const { previewInputOutput: inputOutput, calls } = previewInputOutputFactory({
                pager: 'bat',
                spawnHook: closeProcess(0)
            });

            assert.strictEqual(
                await withPromiseDeadline(inputOutput.pagePreviewOutput('content'), 'configured pager success'),
                true
            );
            assert.deepStrictEqual(
                calls.map(function (call) {
                    return [ call.command, call.commandArguments ];
                }),
                [ [ 'sh', [ '-lc', 'bat' ] ] ]
            );
            const firstCall = requireFirstCall(calls);
            assert.deepStrictEqual(firstCall.options, { stdio: [ 'pipe', 'inherit', 'inherit' ] });
            assertDefined(firstCall.child.listeners.close);
            assertDefined(firstCall.child.listeners.error);
            assertDefined(firstCall.child.listeners.standardInputError);
            assert.strictEqual(firstCall.child.endedContent, 'content');
        });

        test('falls back to less when the configured pager fails', async function () {
            let invocation = 0;
            const { previewInputOutput: inputOutput, calls } = previewInputOutputFactory({
                pager: 'bat',
                shell: '/bin/bash',
                spawnHook({ child }) {
                    invocation += 1;
                    queueMicrotask(function () {
                        child.listeners.close?.(invocation === 1 ? 1 : 0);
                    });
                }
            });

            assert.strictEqual(
                await withPromiseDeadline(inputOutput.pagePreviewOutput('content'), 'pager fallback'),
                true
            );
            assert.deepStrictEqual(
                calls.map(function (call) {
                    return [ call.command, call.commandArguments ];
                }),
                [
                    [ '/bin/bash', [ '-lc', 'bat' ] ],
                    [ '/bin/bash', [ '-lc', 'less -R' ] ]
                ]
            );
        });

        test('uses less directly when no pager is configured', async function () {
            const { previewInputOutput: inputOutput, calls } = previewInputOutputFactory({
                spawnHook: closeProcess(0)
            });

            assert.strictEqual(
                await withPromiseDeadline(inputOutput.pagePreviewOutput('content'), 'default less pager'),
                true
            );
            assert.deepStrictEqual(
                calls.map(function (call) {
                    return [ call.command, call.commandArguments ];
                }),
                [ [ 'sh', [ '-lc', 'less -R' ] ] ]
            );
        });

        test('falls back to less when the pager is empty', async function () {
            const { previewInputOutput: inputOutput, calls } = previewInputOutputFactory({
                pager: '',
                spawnHook: closeProcess(0)
            });

            assert.strictEqual(
                await withPromiseDeadline(inputOutput.pagePreviewOutput('content'), 'empty pager fallback'),
                true
            );
            assert.deepStrictEqual(
                calls.map(function (call) {
                    return call.commandArguments;
                }),
                [ [ '-lc', 'less -R' ] ]
            );
        });

        test('returns false when spawn errors', async function () {
            const { previewInputOutput: inputOutput } = previewInputOutputFactory({
                pager: 'bat',
                spawnHook: emitProcessError('error')
            });

            assert.strictEqual(
                await withPromiseDeadline(inputOutput.pagePreviewOutput('content'), 'preview spawn error'),
                false
            );
        });

        test('returns false when stdin errors', async function () {
            const { previewInputOutput: inputOutput } = previewInputOutputFactory({
                spawnHook: emitProcessError('standardInputError')
            });

            assert.strictEqual(
                await withPromiseDeadline(inputOutput.pagePreviewOutput('content'), 'preview stdin error'),
                false
            );
        });

        test('returns false when the spawned pager process exposes a null stdin stream', async function () {
            const { previewInputOutput: inputOutput } = previewInputOutputFactory({ standardInputMode: 'null' });

            assert.strictEqual(
                await withPromiseDeadline(inputOutput.pagePreviewOutput('content'), 'preview null stdin'),
                false
            );
        });
    });

    suite('openPreviewFile', function () {
        test('delegates to the injected file opener', async function () {
            const { previewInputOutput: inputOutput, openedFiles } = previewInputOutputFactory();

            assert.strictEqual(
                await withPromiseDeadline(
                    inputOutput.openPreviewFile('/workspace/tmp/report.html'),
                    'open preview file'
                ),
                true
            );
            assert.deepStrictEqual(openedFiles, [ '/workspace/tmp/report.html' ]);
        });

        test('returns false when opening emits an error', async function () {
            const { previewInputOutput: inputOutput } = previewInputOutputFactory({
                async openFile() {
                    throw new Error('boom');
                }
            });

            assert.strictEqual(
                await withPromiseDeadline(
                    inputOutput.openPreviewFile('/workspace/tmp/report.html'),
                    'open preview error'
                ),
                false
            );
        });
    });
});
