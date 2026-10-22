import assert from 'node:assert';
import { suite, test } from 'mocha';
import { renderTerminalPackageSymbols } from './terminal-package-symbols-renderer.ts';

suite('terminal package symbols renderer', function () {
    test('renders locations, decisions, retention steps, and consuming packages', function () {
        const rendered = renderTerminalPackageSymbols({
            packageName: 'example',
            symbols: [ {
                packagePath: './helpers.js',
                name: 'used',
                line: 2,
                kind: 'FunctionDeclaration',
                decision: 'kept',
                reason: 'reachable',
                chain: [ { binding: 'helpers.js::used', reason: 'named-import', consumerPackage: 'consumer' } ]
            }, {
                packagePath: './helpers.js',
                name: 'unused',
                line: 3,
                kind: 'VariableDeclaration',
                decision: 'removed',
                reason: 'unreachable',
                chain: []
            }, {
                packagePath: './index.js',
                name: 'api',
                line: 1,
                kind: 'VariableDeclaration',
                decision: 'kept',
                reason: 'reachable',
                chain: [ { binding: 'index.js::api', reason: 'entry-export', consumerPackage: undefined } ]
            } ]
        });
        assert.strictEqual(
            rendered,
            [
                'Packtory symbols [Dry run]',
                'example',
                'Top-level bindings in linked package sources; locations refer to code before dead-code elimination.',
                './helpers.js:2 used (FunctionDeclaration): kept (reachable)',
                '  helpers.js::used: named-import from package "consumer"',
                './helpers.js:3 unused (VariableDeclaration): removed (unreachable)',
                './index.js:1 api (VariableDeclaration): kept (reachable)',
                '  index.js::api: entry-export'
            ]
                .join('\n')
        );
    });
});
