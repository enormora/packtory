import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { multiFileBindingsFor } from '../../test-libraries/reachability-test-support.ts';
import { buildDeclarationNodeIndex } from './binding-identifier.ts';
import { collectIdentifierTargets } from './identifier-target-collector.ts';

function collectEntryReExportTargets(files: Parameters<typeof multiFileBindingsFor>[0]): Set<string> {
    const bindings = multiFileBindingsFor(files);
    const [ entry ] = bindings;
    assertDefined(entry);
    const [ declaration ] = entry.sourceFile.getExportDeclarations();
    assertDefined(declaration);
    return collectIdentifierTargets(declaration, buildDeclarationNodeIndex(bindings), undefined);
}

suite('identifier-target-collector reexports', function () {
    test('follows compiler aliases when emitted binding metadata is unavailable', function () {
        const files = multiFileBindingsFor([
            { filePath: '/source/index.js', content: 'import {value} from "./dep.js";export const result=value;' },
            { filePath: '/source/dep.js', content: 'export const value=1;' }
        ]);
        const entry = files[0];
        assertDefined(entry);
        const index = buildDeclarationNodeIndex(files);
        const targets = collectIdentifierTargets(entry.sourceFile.getSourceFile(), {
            ...index,
            identifiersByTargetFileAndName: new Map()
        }, undefined);
        assert.strictEqual(targets.has('/source/dep.js::value'), true);
    });

    for (
        const scenario of [
            { declaration: 'export * from "./dep.js";', names: [ 'a', 'b' ] },
            { declaration: 'export * as ns from "./dep.js";', names: [ 'a', 'b', 'default' ] },
            { declaration: 'export { a } from "./dep.js";', names: [ 'a' ] },
            { declaration: 'export * from "external";', names: [] }
        ]
    ) {
        test(`collects exactly the targets of ${scenario.declaration}`, function () {
            const targets = collectEntryReExportTargets([
                { filePath: '/source/index.js', content: scenario.declaration },
                {
                    filePath: '/source/dep.js',
                    content: 'export const a = 1; export const b = 2; export default 9; const unused = 0;'
                }
            ]);
            assert.deepStrictEqual(
                targets,
                new Set(scenario.names.map(function (name) {
                    return `/source/dep.js::${name}`;
                }))
            );
        });
    }

    test('retains both conflicting bindings through cyclic star barrels', function () {
        const targets = collectEntryReExportTargets([
            { filePath: '/source/index.js', content: 'export * from "./barrel.js";' },
            { filePath: '/source/barrel.js', content: 'export * from "./a.js"; export * from "./b.js";' },
            { filePath: '/source/a.js', content: 'export * from "./barrel.js"; export const clash = 1;' },
            { filePath: '/source/b.js', content: 'export const clash = 2;' }
        ]);
        assert.deepStrictEqual(
            targets,
            new Set([ '/source/a.js::clash', '/source/b.js::clash' ])
        );
    });
});
