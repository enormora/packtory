import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createShellCommandRunner } from './canary-runner.ts';
import {
    createNodeImportProbe,
    type CanaryProcessExecutor
} from './package-application-programming-interface-inspection.ts';

suite('canary process adapters', function () {
    suite('shell command runner', function () {
        test('passes clone-local executable paths and the dry-run token to the shell', async function () {
            const calls: unknown[] = [];
            const execute: CanaryProcessExecutor = function (command, args, options, callback) {
                calls.push({ command, args, options });
                callback(null, 'output', 'warnings');
            };
            const run = createShellCommandRunner(50, execute);
            assert.deepStrictEqual(await run('packtory pack', "/clone's folder"), {
                standardOutput: 'output',
                standardError: 'warnings'
            });
            assert.deepStrictEqual(calls, [ {
                command: '/usr/bin/env',
                args: [
                    'sh',
                    '-lc',
                    [
                        "PATH='/clone'\\''s folder/node_modules/.bin':$PATH",
                        'export PATH',
                        'NPM_TOKEN=dry-run',
                        'export NPM_TOKEN',
                        'packtory pack'
                    ]
                        .join('\n')
                ],
                options: { cwd: "/clone's folder", encoding: 'utf8', timeout: 50 }
            } ]);
        });
        for (
            const [ timeout, killed, signal, message ] of [
                [ 50, true, 'SIGTERM', 'Command timed out after 50 ms: pack' ],
                [ 2000, true, 'SIGTERM', 'Command timed out after 2 seconds: pack' ],
                [ 50, false, 'SIGTERM', 'native failure' ],
                [ 50, true, 'SIGKILL', 'native failure' ]
            ] as const
        ) {
            const execute: CanaryProcessExecutor = function (_command, _args, _options, callback) {
                callback(
                    Object.assign(new Error('native failure'), { cmd: 'pack', killed, signal }),
                    ' output ',
                    ' errors '
                );
            };
            test(`reports shell failures for ${timeout}, ${String(killed)}, ${signal}`, async function () {
                await assert.rejects(createShellCommandRunner(timeout, execute)('pack', '/clone'), {
                    message: `output\nerrors\n${message}`
                });
            });
        }
    });
    suite('node import probe', function () {
        test('requests an isolated module import and parses its exported names', async function () {
            const execute: CanaryProcessExecutor = function (command, args, options, callback) {
                assert.strictEqual(command, 'node');
                assert.deepStrictEqual(args.slice(0, 3), [ '--enable-source-maps', '--input-type=module', '-e' ]);
                assert.strictEqual(args[3]?.includes('await import("package")'), true);
                assert.deepStrictEqual(options, { cwd: '/modules', encoding: 'utf8', timeout: 30 });
                callback(null, '["first","second"]', '');
            };
            assert.deepStrictEqual(await createNodeImportProbe(30, execute, 'node')('/modules', 'package'), [
                'first',
                'second'
            ]);
        });
        for (
            const [ output, error ] of [
                [ '', /completed without JSON output/u ],
                [ '[1]', /did not print a string array/u ],
                [ '{}', /did not print a string array/u ],
                [ 'invalid', /Unexpected token/u ]
            ] as const
        ) {
            const execute: CanaryProcessExecutor = function (_command, _args, _options, callback) {
                callback(null, output, '');
            };
            test(`rejects invalid import output ${JSON.stringify(output)}`, async function () {
                await assert.rejects(createNodeImportProbe(30, execute, 'node')('/modules', 'package'), error);
            });
        }
        for (
            const [ output, errors, killed, signal, message ] of [
                [ 'output', ' errors ', false, 'SIGTERM', 'errors' ],
                [ ' output ', '', false, 'SIGTERM', 'output' ],
                [ '', '', true, 'SIGTERM', 'Import probe timed out after 30 ms without output.' ],
                [ '', '', false, 'SIGTERM', 'native failure' ],
                [ '', '', true, 'SIGKILL', 'native failure' ]
            ] as const
        ) {
            const execute: CanaryProcessExecutor = function (_command, _args, _options, callback) {
                callback(Object.assign(new Error('native failure'), { cmd: 'node', killed, signal }), output, errors);
            };
            test(`reports import failures from ${JSON.stringify([ output, errors, killed, signal ])}`, async function () {
                await assert.rejects(createNodeImportProbe(30, execute, 'node')('/modules', 'package'), { message });
            });
        }
    });
});
