import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { Project } from 'ts-morph';
import { eliminateCodeModules } from '../test-libraries/eliminator-test-support.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { createSourceEvaluation } from './evaluation/constant-evaluation.ts';

function assertNamespaceValue(project: Project): void {
    const output = project.getSourceFileOrThrow('/output/index.js');
    project.getSourceFileOrThrow('/output/barrel.js');
    const dependency = project.getSourceFileOrThrow('/output/dep.js');
    assert.deepStrictEqual(
        output.getExportSymbols().map(function (symbol) {
            return symbol.getName();
        }),
        [ 'value' ]
    );
    const initializer = output.getVariableDeclarationOrThrow('value').getInitializerOrThrow();
    const used = dependency.getVariableDeclarationOrThrow('used');
    assert.strictEqual(initializer.getSymbolOrThrow().getValueDeclaration(), used);
    assert.deepStrictEqual(
        createSourceEvaluation(dependency).primitiveValue(used.getInitializerOrThrow()),
        { value: 42 }
    );
}

suite('eliminator namespace default export', function () {
    test('retains a default-exported namespace observed as a value', async function () {
        const emitted = await eliminateCodeModules(
            'import ns from "./barrel.js"; export const namespace = ns;',
            {
                'barrel.js': 'import * as ns from "./dep.js"; export default ns;',
                'dep.js': 'export const used = 42; export const other = 9; const dead = 123;'
            }
        );
        const project = createProject({
            withFiles: Array.from(emitted, function ([ filePath, content ]) {
                return { filePath: `/output/${filePath}`, content };
            })
        });
        const entry = project.getSourceFileOrThrow('/output/index.js');
        const barrel = project.getSourceFileOrThrow('/output/barrel.js');
        const dependency = project.getSourceFileOrThrow('/output/dep.js');
        assert.deepStrictEqual(
            entry.getExportSymbols().map(function (symbol) {
                return symbol.getName();
            }),
            [ 'namespace' ]
        );
        assert.deepStrictEqual(
            barrel.getExportSymbols().map(function (symbol) {
                return symbol.getName();
            }),
            [ 'default' ]
        );
        assert.deepStrictEqual(
            dependency.getExportSymbols().map(function (symbol) {
                return symbol.getName();
            }),
            [ 'used', 'other' ]
        );
        assert.strictEqual(entry.getVariableDeclarationOrThrow('namespace').getInitializerOrThrow().getText(), 'ns');
        assert.strictEqual(dependency.getVariableDeclaration('dead'), undefined);
    });

    for (
        const statement of [ 'export default ns;', 'export default (ns);', 'const alias = ns; export default alias;' ]
    ) {
        for (
            const entry of [
                'import ns from "./barrel.js"; export const value = ns.used;',
                'import * as wrapped from "./barrel.js"; export const value = wrapped.default.used;'
            ]
        ) {
            test(`preserves the namespace through ${statement} with ${entry}`, async function () {
                const modules = {
                    'barrel.js': `import * as ns from "./dep.js"; ${statement}`,
                    'dep.js': 'export let used = 42; export const unused = 9; const dead = 123;'
                };
                const emitted = await eliminateCodeModules(entry, modules);
                const project = createProject({
                    withFiles: Array.from(emitted, function ([ filePath, content ]) {
                        return { filePath: `/output/${filePath}`, content };
                    })
                });
                assertNamespaceValue(project);
                assert.strictEqual(emitted.get('dep.js')?.includes('dead'), false);
                assert.strictEqual(emitted.get('dep.js')?.includes('unused'), false);
            });
        }
    }
});
