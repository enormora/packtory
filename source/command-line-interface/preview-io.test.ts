/* eslint-disable no-restricted-syntax, functional/no-this-expressions, destructuring/in-params, sonarjs/publicly-writable-directories, no-undef -- fake child-process scaffolding is intentionally imperative in these tests */
import assert from 'node:assert';
import { test } from 'mocha';
import { withPromiseDeadline } from '../test-libraries/promise-with-deadline.ts';
import { createPreviewIo, defaultSpawnProcess, type SpawnedProcess, type SpawnOptions } from './preview-io-shared.ts';
import { createDefaultPreviewIo } from './preview-io.ts';

type FakeSpawnResult = {
    readonly command: string;
    readonly args: readonly string[];
    readonly options: SpawnOptions;
    readonly child: FakeSpawnedProcess;
};

type PreviewIoFactoryOverrides = {
    readonly pager?: string | undefined;
    readonly platform?: NodeJS.Platform;
    readonly shell?: string | undefined;
    readonly stdoutIsTTY?: boolean;
    readonly spawnHook?: ((result: FakeSpawnResult) => void) | undefined;
    readonly stdinMode?: 'null' | 'pipe';
};

class FakeSpawnedProcess implements SpawnedProcess {
    readonly stdin;

    endedContent = '';

    wasUnrefCalled = false;

    readonly listeners: {
        close?: (code?: number) => void;
        error?: () => void;
        stdinError?: () => void;
    } = {};

    constructor(stdinMode: PreviewIoFactoryOverrides['stdinMode'] = 'pipe') {
        if (stdinMode === 'null') {
            this.stdin = null;
            return;
        }
        this.stdin = {
            on: (eventName: string, listener: () => void): void => {
                if (eventName === 'error') {
                    this.listeners.stdinError = listener;
                }
            },
            end: (content: string): void => {
                this.endedContent = content;
            }
        };
    }

    on(eventName: string, listener: (value?: number) => void): void {
        if (eventName === 'close') {
            this.listeners.close = listener;
            return;
        }
        if (eventName === 'error') {
            this.listeners.error = listener as () => void;
        }
    }

    unref(): void {
        this.wasUnrefCalled = true;
    }
}

function previewIoFactory(overrides: PreviewIoFactoryOverrides = {}) {
    const calls: FakeSpawnResult[] = [];
    const previewIo = createPreviewIo({
        spawnProcess: (command, args, options) => {
            const child = new FakeSpawnedProcess(overrides.stdinMode);
            const result = { command, args, options, child };
            calls.push(result);
            overrides.spawnHook?.(result);
            return child;
        },
        randomUuid: () => 'uuid-123',
        tmpdir: () => '/tmp',
        platform: overrides.platform ?? 'linux',
        shell: overrides.shell,
        pager: overrides.pager,
        stdoutIsTTY: overrides.stdoutIsTTY ?? true
    });
    return { previewIo, calls };
}

function requireFirstCall(calls: readonly FakeSpawnResult[]): FakeSpawnResult {
    const [firstCall] = calls;
    if (firstCall === undefined) {
        assert.fail('expected a spawned process');
    }
    return firstCall;
}

function closeProcess(code: number): NonNullable<PreviewIoFactoryOverrides['spawnHook']> {
    return ({ child }: FakeSpawnResult) => {
        queueMicrotask(() => {
            child.listeners.close?.(code);
        });
    };
}

function emitProcessError(kind: 'error' | 'stdinError'): NonNullable<PreviewIoFactoryOverrides['spawnHook']> {
    return ({ child }: FakeSpawnResult) => {
        queueMicrotask(() => {
            child.listeners[kind]?.();
        });
    };
}

test('createTemporaryPreviewHtmlPath uses tmpdir and the generated uuid', () => {
    const { previewIo: io } = previewIoFactory();

    assert.strictEqual(io.createTemporaryPreviewHtmlPath(), '/tmp/packtory-preview-uuid-123.html');
});

test('pagePreviewOutput returns false immediately when stdout is not a TTY', async () => {
    const { previewIo: io, calls } = previewIoFactory({ stdoutIsTTY: false });

    assert.strictEqual(
        await withPromiseDeadline(io.pagePreviewOutput('content'), 'non-interactive preview skip'),
        false
    );
    assert.deepStrictEqual(calls, []);
});

test('pagePreviewOutput uses the configured pager when it succeeds', async () => {
    const { previewIo: io, calls } = previewIoFactory({ pager: 'bat', spawnHook: closeProcess(0) });

    assert.strictEqual(await withPromiseDeadline(io.pagePreviewOutput('content'), 'configured pager success'), true);
    assert.deepStrictEqual(
        calls.map((call) => [call.command, call.args]),
        [['sh', ['-lc', 'bat']]]
    );
    const firstCall = requireFirstCall(calls);
    assert.deepStrictEqual(firstCall.options, { stdio: ['pipe', 'inherit', 'inherit'] });
    assert.ok(firstCall.child.listeners.close !== undefined);
    assert.ok(firstCall.child.listeners.error !== undefined);
    assert.ok(firstCall.child.listeners.stdinError !== undefined);
    assert.strictEqual(firstCall.child.endedContent, 'content');
});

test('pagePreviewOutput falls back to less when the configured pager fails', async () => {
    let invocation = 0;
    const { previewIo: io, calls } = previewIoFactory({
        pager: 'bat',
        shell: '/bin/bash',
        spawnHook: ({ child }) => {
            invocation += 1;
            queueMicrotask(() => {
                child.listeners.close?.(invocation === 1 ? 1 : 0);
            });
        }
    });

    assert.strictEqual(await withPromiseDeadline(io.pagePreviewOutput('content'), 'pager fallback'), true);
    assert.deepStrictEqual(
        calls.map((call) => [call.command, call.args]),
        [
            ['/bin/bash', ['-lc', 'bat']],
            ['/bin/bash', ['-lc', 'less -R']]
        ]
    );
});

test('pagePreviewOutput uses less directly when no pager is configured', async () => {
    const { previewIo: io, calls } = previewIoFactory({ spawnHook: closeProcess(0) });

    assert.strictEqual(await withPromiseDeadline(io.pagePreviewOutput('content'), 'default less pager'), true);
    assert.deepStrictEqual(
        calls.map((call) => [call.command, call.args]),
        [['sh', ['-lc', 'less -R']]]
    );
});

test('pagePreviewOutput falls back to less when the pager is empty', async () => {
    const { previewIo: io, calls } = previewIoFactory({ pager: '', spawnHook: closeProcess(0) });

    assert.strictEqual(await withPromiseDeadline(io.pagePreviewOutput('content'), 'empty pager fallback'), true);
    assert.deepStrictEqual(
        calls.map((call) => call.args),
        [['-lc', 'less -R']]
    );
});

test('pagePreviewOutput returns false when spawn errors', async () => {
    const { previewIo: io } = previewIoFactory({ pager: 'bat', spawnHook: emitProcessError('error') });

    assert.strictEqual(await withPromiseDeadline(io.pagePreviewOutput('content'), 'preview spawn error'), false);
});

test('pagePreviewOutput returns false when stdin errors', async () => {
    const { previewIo: io } = previewIoFactory({ spawnHook: emitProcessError('stdinError') });

    assert.strictEqual(await withPromiseDeadline(io.pagePreviewOutput('content'), 'preview stdin error'), false);
});

test('pagePreviewOutput returns false when the spawned pager process exposes a null stdin stream', async () => {
    const { previewIo: io } = previewIoFactory({ stdinMode: 'null' });

    assert.strictEqual(await withPromiseDeadline(io.pagePreviewOutput('content'), 'preview null stdin'), false);
});

test('openPreviewFile uses open on macOS', async () => {
    const { previewIo: io, calls } = previewIoFactory({ platform: 'darwin' });

    assert.strictEqual(
        await withPromiseDeadline(io.openPreviewFile('/tmp/report.html'), 'open preview on macOS'),
        true
    );
    assert.deepStrictEqual(
        calls.map((call) => [call.command, call.args]),
        [['open', ['/tmp/report.html']]]
    );
    const firstCall = requireFirstCall(calls);
    assert.deepStrictEqual(firstCall.options, { detached: true, stdio: 'ignore' });
    assert.ok(firstCall.child.listeners.error !== undefined);
    assert.strictEqual(firstCall.child.wasUnrefCalled, true);
});

test('openPreviewFile uses start on Windows', async () => {
    const { previewIo: io, calls } = previewIoFactory({ platform: 'win32' });

    assert.strictEqual(
        await withPromiseDeadline(io.openPreviewFile('C:\\report.html'), 'open preview on Windows'),
        true
    );
    assert.deepStrictEqual(
        calls.map((call) => [call.command, call.args]),
        [['cmd', ['/c', 'start', '', 'C:\\report.html']]]
    );
});

test('openPreviewFile uses xdg-open on other platforms', async () => {
    const { previewIo: io, calls } = previewIoFactory({ platform: 'linux' });

    assert.strictEqual(
        await withPromiseDeadline(io.openPreviewFile('/tmp/report.html'), 'open preview on Linux'),
        true
    );
    assert.deepStrictEqual(
        calls.map((call) => [call.command, call.args]),
        [['xdg-open', ['/tmp/report.html']]]
    );
});

test('openPreviewFile returns false when opening emits an error', async () => {
    const { previewIo: io } = previewIoFactory({ spawnHook: emitProcessError('error') });

    assert.strictEqual(await withPromiseDeadline(io.openPreviewFile('/tmp/report.html'), 'open preview error'), false);
});

test('openPreviewFile ignores an error emitted after the success path has already settled', async () => {
    const { previewIo: io, calls } = previewIoFactory();

    assert.strictEqual(
        await withPromiseDeadline(io.openPreviewFile('/tmp/report.html'), 'open preview late error ignore'),
        true
    );
    const firstCall = requireFirstCall(calls);
    firstCall.child.listeners.error?.();
    assert.strictEqual(firstCall.child.wasUnrefCalled, true);
});

test('createDefaultPreviewIo exposes the default preview helpers', () => {
    const previewIo = createDefaultPreviewIo({
        platform: 'linux',
        shell: 'sh',
        pager: undefined,
        stdoutIsTTY: true
    });

    assert.strictEqual(typeof previewIo.createTemporaryPreviewHtmlPath, 'function');
    assert.strictEqual(typeof previewIo.pagePreviewOutput, 'function');
    assert.strictEqual(typeof previewIo.openPreviewFile, 'function');
    assert.ok(previewIo.createTemporaryPreviewHtmlPath().includes('packtory-preview-'));
});

test('defaultSpawnProcess delegates to child_process.spawn with array args', async () => {
    const child = defaultSpawnProcess(process.execPath, ['-e', 'process.exit(0)'], {
        stdio: ['pipe', 'inherit', 'inherit']
    });

    if (child.stdin === null) {
        assert.fail('expected stdin to be available for pipe stdio');
    }
    child.stdin.end('');
    const exitCode = await new Promise<number | undefined>((resolve) => {
        child.on('close', resolve);
    });

    assert.strictEqual(exitCode, 0);
});

test('defaultSpawnProcess preserves ignored stdio', async () => {
    const child = defaultSpawnProcess(process.execPath, ['-e', 'process.exit(0)'], {
        detached: true,
        stdio: 'ignore'
    });

    assert.strictEqual(child.stdin, null);
    child.unref();
    const exitCode = await new Promise<number | undefined>((resolve) => {
        child.on('close', resolve);
    });

    assert.strictEqual(exitCode, 0);
});
