import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { withPromiseDeadline } from '../../test-libraries/promise-with-deadline.ts';
import { createPreviewIo, type PreviewIo } from './preview-io-shared.ts';
import type { SpawnedProcess, SpawnOptions } from './preview-spawn.ts';

type FakeSpawnResult = {
    readonly command: string;
    readonly args: readonly string[];
    readonly options: SpawnOptions;
    readonly child: FakeSpawnedProcess;
};

type PreviewIoFactoryOverrides = {
    readonly openFile?: ((filePath: string) => Promise<void>) | undefined;
    readonly pager?: string | undefined;
    readonly shell?: string | undefined;
    readonly stdoutIsTTY?: boolean;
    readonly spawnHook?: ((result: FakeSpawnResult) => void) | undefined;
    readonly stdinMode?: 'null' | 'pipe';
};

type ExposedFakeProcessListeners = {
    readonly close?: ((code?: number) => void) | undefined;
    readonly error?: (() => void) | undefined;
    readonly stdinError?: (() => void) | undefined;
};

type FakeSpawnedProcess = {
    readonly stdin: SpawnedProcess['stdin'];
    readonly on: SpawnedProcess['on'];
    readonly unref: SpawnedProcess['unref'];
    readonly endedContent: string;
    readonly wasUnrefCalled: boolean;
    readonly listeners: ExposedFakeProcessListeners;
};

type PreviewIoFactoryResult = {
    readonly previewIo: PreviewIo;
    readonly calls: readonly FakeSpawnResult[];
    readonly openedFiles: readonly string[];
};

function createFakeSpawnedProcess(stdinMode: PreviewIoFactoryOverrides['stdinMode'] = 'pipe'): FakeSpawnedProcess {
    const listeners = {
        close: undefined as ((code?: number) => void) | undefined,
        error: undefined as (() => void) | undefined,
        stdinError: undefined as (() => void) | undefined
    };
    let endedContent = '';
    let wasUnrefCalled = false;
    const stdin = stdinMode === 'pipe'
        ? {
            on(eventName: string, listener: () => void): void {
                if (eventName === 'error') {
                    listeners.stdinError = listener;
                }
            },
            end(content: string): void {
                endedContent = content;
            }
        }
        : null;
    const child: FakeSpawnedProcess = {
        stdin,
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

function previewIoFactory(overrides: PreviewIoFactoryOverrides = {}): PreviewIoFactoryResult {
    const calls: FakeSpawnResult[] = [];
    const openedFiles: string[] = [];
    const openFile = overrides.openFile ?? ignoreOpenFile;

    const previewIo = createPreviewIo({
        async openFile(filePath) {
            openedFiles.push(filePath);
            await openFile(filePath);
        },
        spawnProcess(command, args, options) {
            const child = createFakeSpawnedProcess(overrides.stdinMode);
            const result = { command, args, options, child };
            calls.push(result);
            overrides.spawnHook?.(result);
            return child;
        },
        randomUuid() {
            return 'uuid-123';
        },
        tmpdir() {
            return '/workspace/tmp';
        },
        shell: overrides.shell,
        pager: overrides.pager,
        stdoutIsTTY: overrides.stdoutIsTTY ?? true
    });
    return { previewIo, calls, openedFiles };
}

function requireFirstCall(calls: readonly FakeSpawnResult[]): FakeSpawnResult {
    const [ firstCall ] = calls;
    if (firstCall === undefined) {
        assert.fail('expected a spawned process');
    }
    return firstCall;
}

function closeProcess(code: number): NonNullable<PreviewIoFactoryOverrides['spawnHook']> {
    return function ({ child }: FakeSpawnResult) {
        queueMicrotask(function () {
            child.listeners.close?.(code);
        });
    };
}

function emitProcessError(kind: 'error' | 'stdinError'): NonNullable<PreviewIoFactoryOverrides['spawnHook']> {
    return function ({ child }: FakeSpawnResult) {
        queueMicrotask(function () {
            child.listeners[kind]?.();
        });
    };
}

suite('preview-io-shared', function () {
    test('createTemporaryPreviewHtmlPath uses tmpdir and the generated uuid', function () {
        const { previewIo: io } = previewIoFactory();

        assert.strictEqual(io.createTemporaryPreviewHtmlPath(), '/workspace/tmp/packtory-preview-uuid-123.html');
    });

    suite('pagePreviewOutput', function () {
        test('returns false immediately when stdout is not a TTY', async function () {
            const { previewIo: io, calls } = previewIoFactory({ stdoutIsTTY: false });

            assert.strictEqual(
                await withPromiseDeadline(io.pagePreviewOutput('content'), 'non-interactive preview skip'),
                false
            );
            assert.deepStrictEqual(calls, []);
        });

        test('uses the configured pager when it succeeds', async function () {
            const { previewIo: io, calls } = previewIoFactory({ pager: 'bat', spawnHook: closeProcess(0) });

            assert.strictEqual(
                await withPromiseDeadline(io.pagePreviewOutput('content'), 'configured pager success'),
                true
            );
            assert.deepStrictEqual(
                calls.map(function (call) {
                    return [ call.command, call.args ];
                }),
                [ [ 'sh', [ '-lc', 'bat' ] ] ]
            );
            const firstCall = requireFirstCall(calls);
            assert.deepStrictEqual(firstCall.options, { stdio: [ 'pipe', 'inherit', 'inherit' ] });
            assertDefined(firstCall.child.listeners.close);
            assertDefined(firstCall.child.listeners.error);
            assertDefined(firstCall.child.listeners.stdinError);
            assert.strictEqual(firstCall.child.endedContent, 'content');
        });

        test('falls back to less when the configured pager fails', async function () {
            let invocation = 0;
            const { previewIo: io, calls } = previewIoFactory({
                pager: 'bat',
                shell: '/bin/bash',
                spawnHook({ child }) {
                    invocation += 1;
                    queueMicrotask(function () {
                        child.listeners.close?.(invocation === 1 ? 1 : 0);
                    });
                }
            });

            assert.strictEqual(await withPromiseDeadline(io.pagePreviewOutput('content'), 'pager fallback'), true);
            assert.deepStrictEqual(
                calls.map(function (call) {
                    return [ call.command, call.args ];
                }),
                [
                    [ '/bin/bash', [ '-lc', 'bat' ] ],
                    [ '/bin/bash', [ '-lc', 'less -R' ] ]
                ]
            );
        });

        test('uses less directly when no pager is configured', async function () {
            const { previewIo: io, calls } = previewIoFactory({ spawnHook: closeProcess(0) });

            assert.strictEqual(await withPromiseDeadline(io.pagePreviewOutput('content'), 'default less pager'), true);
            assert.deepStrictEqual(
                calls.map(function (call) {
                    return [ call.command, call.args ];
                }),
                [ [ 'sh', [ '-lc', 'less -R' ] ] ]
            );
        });

        test('falls back to less when the pager is empty', async function () {
            const { previewIo: io, calls } = previewIoFactory({ pager: '', spawnHook: closeProcess(0) });

            assert.strictEqual(
                await withPromiseDeadline(io.pagePreviewOutput('content'), 'empty pager fallback'),
                true
            );
            assert.deepStrictEqual(
                calls.map(function (call) {
                    return call.args;
                }),
                [ [ '-lc', 'less -R' ] ]
            );
        });

        test('returns false when spawn errors', async function () {
            const { previewIo: io } = previewIoFactory({ pager: 'bat', spawnHook: emitProcessError('error') });

            assert.strictEqual(
                await withPromiseDeadline(io.pagePreviewOutput('content'), 'preview spawn error'),
                false
            );
        });

        test('returns false when stdin errors', async function () {
            const { previewIo: io } = previewIoFactory({ spawnHook: emitProcessError('stdinError') });

            assert.strictEqual(
                await withPromiseDeadline(io.pagePreviewOutput('content'), 'preview stdin error'),
                false
            );
        });

        test('returns false when the spawned pager process exposes a null stdin stream', async function () {
            const { previewIo: io } = previewIoFactory({ stdinMode: 'null' });

            assert.strictEqual(await withPromiseDeadline(io.pagePreviewOutput('content'), 'preview null stdin'), false);
        });
    });

    suite('openPreviewFile', function () {
        test('delegates to the injected file opener', async function () {
            const { previewIo: io, openedFiles } = previewIoFactory();

            assert.strictEqual(
                await withPromiseDeadline(io.openPreviewFile('/workspace/tmp/report.html'), 'open preview file'),
                true
            );
            assert.deepStrictEqual(openedFiles, [ '/workspace/tmp/report.html' ]);
        });

        test('returns false when opening emits an error', async function () {
            const { previewIo: io } = previewIoFactory({
                async openFile() {
                    throw new Error('boom');
                }
            });

            assert.strictEqual(
                await withPromiseDeadline(io.openPreviewFile('/workspace/tmp/report.html'), 'open preview error'),
                false
            );
        });
    });
});
