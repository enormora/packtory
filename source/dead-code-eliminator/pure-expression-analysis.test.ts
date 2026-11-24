import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { multiFileBindingsFor } from '../test-libraries/reachability-test-support.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { createPreparedExpressionPurityChecker } from './pure-expression.ts';
import { createRuntimeModuleResolver } from './runtime-module-resolution.ts';

suite('prepared expression purity', function () {
    for (const reversed of [ false, true ]) {
        for (
            const [ content, expected ] of [
                [ 'const first={};const second=first;const third={...second};', [ true, true, true ] ],
                [ 'const object={};const before={...object};object.value=1;const after={...object};', [
                    true,
                    true,
                    false
                ] ],
                [ 'const first=second;const second=first;', [ false, true ] ],
                [ 'const value=effect();const nested={value};', [ false, true ] ],
                [ 'const plain=class{};const observable=class{static{effect();}};', [ true, false ] ]
            ] as const
        ) {
            test(`classifies ${content} with reversed traversal ${String(reversed)}`, function () {
                const source = createProject().createSourceFile('input.ts', content);
                const expressions = source.getVariableDeclarations().map(function (declaration, index) {
                    return { expression: declaration.getInitializerOrThrow(), expected: expected[index] };
                });
                const ordered = reversed ? expressions.toReversed() : expressions;
                const check = createPreparedExpressionPurityChecker(undefined, createRuntimeModuleResolver([]));
                for (const { expression, expected: result } of ordered) {
                    assert.strictEqual(check(expression), result);
                }
            });
        }
    }

    test('resolves an imported origin once across dependent aliases', function () {
        const files = multiFileBindingsFor([
            {
                filePath: 'index.js',
                content: 'import {build} from "./library.js";const first=build;const second=first;'
            },
            { filePath: 'library.js', content: 'export function build(){return 42;}' }
        ]);
        const source = files[0]?.sourceFile.getSourceFile();
        assertDefined(source);
        const resolve = createRuntimeModuleResolver(files);
        const requests: unknown[] = [];
        const check = createPreparedExpressionPurityChecker(undefined, function (from, specifier) {
            requests.push(specifier);
            return resolve(from, specifier);
        });
        const counts = [ 'first', 'second' ].map(function (name) {
            assert.strictEqual(check(source.getVariableDeclarationOrThrow(name).getInitializerOrThrow()), true);
            return requests.length;
        });
        assert.ok(requests.length > 0);
        assert.deepStrictEqual(counts, [ requests.length, requests.length ]);
    });
});
