import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { multiFileBindingsFor } from '../../test-libraries/reachability-test-support.ts';
import { classifySideEffects } from '../../test-libraries/side-effect-classifier-test-support.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createModuleGraphAnalysis, type ModuleGraphAnalysis } from './module-graph-analysis.ts';
import { createExportGraphModules, type ExportGraphModules, type GraphModule } from './export-graph-modules.ts';

function moduleAnalysis(): ModuleGraphAnalysis {
    return createModuleGraphAnalysis({
        files: multiFileBindingsFor([
            {
                filePath: 'index.js',
                content:
                    'import {Value} from "./library.js";import * as object from "./library.js";export * as ns from "./library.js";'
            },
            { filePath: 'library.js', content: 'export const Value=42;export const Other=13;' }
        ]),
        publicPaths: new Set([ 'index.js' ]),
        classifySideEffects,
        settings: undefined,
        observedBindings: undefined
    });
}

function moduleFor(graph: ExportGraphModules, name: string): GraphModule {
    const module = Array.from(graph.modules.values()).find(function (candidate) {
        return candidate.record.model.source.getBaseName() === name;
    });
    assertDefined(module);
    return module;
}

suite('export graph module ownership', function () {
    test('does not resolve runtime modules for erased namespace bindings', function () {
        const graph = createExportGraphModules({
            ...moduleAnalysis(),
            resolveModule() {
                return assert.fail('Erased imports must not resolve runtime modules');
            }
        });
        for (
            const [ path, content ] of [ [ 'input.ts', 'import type * as ns from "library";' ], [
                'input.d.ts',
                'import * as ns from "library";'
            ] ] as const
        ) {
            const source = createProject().createSourceFile(path, content);
            const namespace = source.getFirstDescendantByKindOrThrow(SyntaxKind.NamespaceImport);
            assert.strictEqual(graph.importedTargets(namespace), undefined);
            assert.deepStrictEqual(graph.namespaceBindingTargets(namespace), []);
        }
    });

    test('does not infer imports from ordinary declarations', function () {
        const graph = createExportGraphModules(moduleAnalysis());
        const { source } = moduleFor(graph, 'library.js').record.model;
        const declaration = source.getFirstDescendantByKindOrThrow(SyntaxKind.VariableDeclaration);
        assert.strictEqual(graph.importedTargets(declaration), undefined);
        assert.deepStrictEqual(graph.namespaceBindingTargets(declaration), []);
    });

    test('does not invent targets for unknown modules', function () {
        const graph = createExportGraphModules(moduleAnalysis());
        const foreign = createProject().createSourceFile('foreign.js', 'export {value};');
        assert.strictEqual(graph.targets.exported(undefined, 'value'), undefined);
        assert.strictEqual(graph.targets.evaluated(undefined), undefined);
        assert.strictEqual(graph.targets.exported(foreign, 'value'), undefined);
        assert.strictEqual(graph.targets.evaluated(foreign), undefined);
        assert.strictEqual(graph.targets.binding(foreign, 'value'), undefined);
        assert.deepStrictEqual(graph.targets.namespaceTargets(foreign, undefined), []);
        assert.strictEqual(
            graph.declarationTargets(foreign.getFirstDescendantByKindOrThrow(SyntaxKind.ExportDeclaration)),
            undefined
        );
    });

    test('preserves owned binding identities and finite namespace demand', function () {
        const graph = createExportGraphModules(moduleAnalysis());
        const library = moduleFor(graph, 'library.js').record.model.source;
        assert.strictEqual(graph.targets.binding(library, 'Value'), 'library.js::Value');
        assert.strictEqual(graph.targets.binding(library, 'missing'), undefined);
        assert.deepStrictEqual(graph.targets.namespaceTargets(library, new Set([ 'Value' ])), [
            'library.js::@export:"Value"'
        ]);
    });

    test('omits targets resolved outside the supplied module graph', function () {
        const analysis = moduleAnalysis();
        const foreign = createProject().createSourceFile('foreign.js', 'export const Value=42;');
        const graph = createExportGraphModules({
            ...analysis,
            resolveModule() {
                return foreign;
            }
        });
        const { source } = moduleFor(graph, 'index.js').record.model;
        const specifier = source.getFirstDescendantByKindOrThrow(SyntaxKind.ImportSpecifier);
        const namespace = source.getFirstDescendantByKindOrThrow(SyntaxKind.NamespaceImport);
        assert.deepStrictEqual(graph.importedTargets(specifier), []);
        assert.deepStrictEqual(graph.namespaceBindingTargets(namespace), []);
    });

    test('keeps materialized namespace edges after demand changes', function () {
        const analysis = moduleAnalysis();
        let selected = new Set([ 'Value' ]);
        const graph = createExportGraphModules({
            ...analysis,
            demand: {
                ...analysis.demand,
                exportProperties() {
                    return selected;
                }
            }
        });
        const entry = moduleFor(graph, 'index.js');
        const key = entry.exported('ns');
        graph.materialize();
        selected = new Set([ 'Other' ]);
        entry.exported('ns');
        assert.deepStrictEqual(graph.nodes.get(key)?.(), [ 'library.js::@export:"Value"' ]);
    });
});
