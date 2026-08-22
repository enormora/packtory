import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { applyRemovalPlan } from './declaration-remover.ts';
import type { PositionAtom } from './atom-translator.ts';

type TransformResult = {
    readonly text: string;
    readonly mutated: boolean;
    readonly atoms: readonly PositionAtom[];
};

function transform(
    content: string,
    surviving: ReadonlySet<string>,
    filePath = 'index.ts'
): TransformResult {
    const project = createProject({ withFiles: [ { filePath, content } ] });
    const sourceFile = project.getSourceFileOrThrow(filePath);
    const result = applyRemovalPlan(sourceFile, { survivingNames: surviving });
    return { text: sourceFile.getFullText(), mutated: result.mutated, atoms: result.atoms };
}

suite('declaration-remover', function () {
    suite('declaration removal for reachable values', function () {
        test('removes an unreachable function declaration', function () {
            const { text, mutated } = transform('function dead() {}\nexport function live() {}', new Set([ 'live' ]));
            assert.strictEqual(text.includes('dead'), false);
            assert.strictEqual(text.includes('live'), true);
            assert.strictEqual(mutated, true);
        });

        test('keeps a reachable function declaration', function () {
            const { text, mutated } = transform('function alive() {}', new Set([ 'alive' ]));
            assert.strictEqual(text.includes('alive'), true);
            assert.strictEqual(mutated, false);
        });

        test('removes the whole VariableStatement when every declarator is unreachable', function () {
            const { text, mutated } = transform('const a = 1, b = 2;\nexport const live = 3;', new Set([ 'live' ]));
            assert.strictEqual(text.includes('const a'), false);
            assert.strictEqual(text.includes('const b'), false);
            assert.strictEqual(text.includes('live'), true);
            assert.strictEqual(mutated, true);
        });

        test('removes only the dead declarators when some are reachable', function () {
            const { text, mutated } = transform('export const a = 1, b = 2;', new Set([ 'a' ]));
            assert.strictEqual(text.includes('a'), true);
            assert.strictEqual(text.includes('b = 2'), false);
            assert.strictEqual(mutated, true);
        });

        test('keeps a whole destructuring declarator when any bound identifier survives', function () {
            const { text, mutated } = transform('export const { a, b } = value;', new Set([ 'a' ]));
            assert.strictEqual(text.includes('{ a, b }'), true);
            assert.strictEqual(mutated, false);
        });

        test('removes a whole destructuring declarator when no bound identifier survives', function () {
            const { text, mutated } = transform('export const { a, b } = value;', new Set<string>());
            assert.strictEqual(text.includes('{ a, b }'), false);
            assert.strictEqual(mutated, true);
        });

        test('returns false when nothing needs to change', function () {
            const { text, mutated } = transform('export const a = 1;', new Set([ 'a' ]));
            assert.strictEqual(text.includes('a'), true);
            assert.strictEqual(mutated, false);
        });

        test('removes class declarations whose name is not surviving', function () {
            const { text } = transform('class Dead {}\nexport class Live {}', new Set([ 'Live' ]));
            assert.strictEqual(text.includes('class Dead'), false);
            assert.strictEqual(text.includes('class Live'), true);
        });
    });

    suite('non-value declaration removal', function () {
        test('removes interface, type alias, enum, and namespace declarations whose names are unreachable', function () {
            const content = [
                'interface DeadInterface {}',
                'type DeadAlias = string;',
                'enum DeadEnum { A }',
                'namespace DeadNamespace {}',
                'export interface LiveInterface {}'
            ]
                .join('\n');
            const { text } = transform(content, new Set([ 'LiveInterface' ]));
            assert.strictEqual(text.includes('DeadInterface'), false);
            assert.strictEqual(text.includes('DeadAlias'), false);
            assert.strictEqual(text.includes('DeadEnum'), false);
            assert.strictEqual(text.includes('DeadNamespace'), false);
            assert.strictEqual(text.includes('LiveInterface'), true);
        });

        test('repairs imports but does not affect re-exports or other non-declaration statements', function () {
            const content = [ 'import { x } from "./other";', 'export { something } from "./other";' ].join('\n');
            const { text, mutated } = transform(content, new Set<string>());
            assert.strictEqual(text.includes('import "./other";'), true);
            assert.strictEqual(text.includes('export'), true);
            assert.strictEqual(mutated, true);
        });

        test('returns true if any statement was mutated', function () {
            const { mutated } = transform('function dead() {}', new Set<string>());
            assert.strictEqual(mutated, true);
        });

        test('an empty file produces no mutations', function () {
            const { text, mutated } = transform('', new Set<string>());
            assert.strictEqual(text, '');
            assert.strictEqual(mutated, false);
        });

        test('keeps an anonymous default-exported function declaration whose name cannot be resolved', function () {
            const { text, mutated } = transform('export default function() { return 1; }', new Set<string>());
            assert.strictEqual(text.includes('default'), true);
            assert.strictEqual(text.includes('function'), true);
            assert.strictEqual(mutated, false);
        });

        test('captures an atom for an anonymous default-exported function declaration', function () {
            const { atoms } = transform('export default function() { return 1; }', new Set<string>());
            assert.strictEqual(atoms.length, 1);
        });

        test('captures atoms that map surviving variable text when at least one declarator is removed', function () {
            const { atoms } = transform('export const a = 1, b = 2;', new Set([ 'a' ]));
            assert.deepStrictEqual(atoms, [
                { originalStart: 0, originalEnd: 18, newStart: 0 },
                { originalStart: 25, originalEnd: 26, newStart: 18 }
            ]);
        });

        test('captures a single atom covering the whole variable statement when every declarator survives', function () {
            const { atoms } = transform('export const a = 1, b = 2;', new Set([ 'a', 'b' ]));
            assert.strictEqual(atoms.length, 1);
            const [ atom ] = atoms;
            assertDefined(atom);
            assert.strictEqual(atom.originalStart, 0);
        });
    });

    suite('source map atom capture', function () {
        test('captures atoms for non-declaration top-level statements (imports, re-exports)', function () {
            const content = [ 'import { x } from "./other";', 'export { something } from "./other";' ].join('\n');
            const { atoms } = transform(content, new Set([ 'x' ]));
            assert.ok(atoms.length > 0);
        });

        test('captures atoms whose newStart reflects the post-removal position', function () {
            const { atoms } = transform('function dead() {}\nexport function live() {}', new Set([ 'live' ]));
            const atom = atoms.find(function (entry) {
                return entry.originalStart === 20;
            });
            assertDefined(atom);
            assert.partialDeepStrictEqual(atom, {
                originalStart: 20,
                newStart: 1
            });
        });
    });

    suite('runtime import repair', function () {
        test('removes dead named imports while preserving live named imports', function () {
            const { text } = transform(
                'import { live, dead } from "./other";\nexport const api = live;',
                new Set([ 'live', 'api' ])
            );

            assert.strictEqual(text.includes('live'), true);
            assert.strictEqual(text.includes('dead'), false);
            assert.strictEqual(text.includes('import { live } from "./other";'), true);
        });

        test('repairs default, namespace, named, and aliased imports', function () {
            const { text } = transform(
                [
                    'import defaultBinding, { dead, source as alias } from "./named";',
                    'import * as namespaceBinding from "./namespace";',
                    'export const api = [defaultBinding, alias, namespaceBinding];'
                ]
                    .join('\n'),
                new Set([ 'defaultBinding', 'alias', 'namespaceBinding', 'api' ])
            );

            assert.strictEqual(
                text,
                [
                    'import defaultBinding, { source as alias } from "./named";',
                    'import * as namespaceBinding from "./namespace";',
                    'export const api = [defaultBinding, alias, namespaceBinding];'
                ]
                    .join('\n')
            );
            assert.strictEqual(text.includes('dead'), false);
        });

        test('converts all-dead runtime imports to bare imports', function () {
            const { text } = transform('import defaultBinding, { dead } from "./other";\n', new Set<string>());

            assert.strictEqual(text, 'import "./other";\n');
        });

        test('converts all-dead default imports to bare imports', function () {
            const { text } = transform('import defaultBinding from "./other";\n', new Set<string>());

            assert.strictEqual(text, 'import "./other";\n');
        });

        test('converts all-dead namespace imports to bare imports', function () {
            const { text } = transform('import * as namespaceBinding from "./other";\n', new Set<string>());

            assert.strictEqual(text, 'import "./other";\n');
        });

        test('preserves leading trivia when converting a runtime import to a bare import', function () {
            const { text } = transform('// lead\nimport dead from "./other";\n', new Set<string>());

            assert.strictEqual(text, '// lead\nimport "./other";\n');
        });

        test('leaves bare imports unchanged', function () {
            const { text, mutated } = transform('import "./other";\n', new Set<string>());

            assert.strictEqual(text, 'import "./other";\n');
            assert.strictEqual(mutated, false);
        });
    });

    suite('type-only import repair', function () {
        test('removes stale type-only imports', function () {
            const { text } = transform(
                'import type { Dead } from "./types";\nexport const api = 1;',
                new Set([ 'api' ])
            );

            assert.strictEqual(text, 'export const api = 1;');
        });

        test('removes stale declaration-file imports instead of converting them to bare imports', function () {
            const { text } = transform(
                'import { Dead } from "./types.js";\nexport interface Api {}',
                new Set([ 'Api' ]),
                'index.d.ts'
            );

            assert.strictEqual(text, 'export interface Api {}');
        });

        test('removes stale inline type-only imports', function () {
            const { text } = transform('import { type Dead } from "./types";\ntype Local = Dead;', new Set<string>());

            assert.strictEqual(text, 'export {};\n');
        });

        test('inserts a module marker when the last type-only import is removed', function () {
            const { text } = transform('import type { Dead } from "./types";\ntype Local = Dead;', new Set<string>());

            assert.strictEqual(text, 'export {};\n');
        });

        test('inserts a module marker before a surviving non-export statement', function () {
            const { text } = transform('import type { Dead } from "./types";\nfoo;', new Set<string>());

            assert.strictEqual(text, 'export {};\nfoo;');
        });

        test('does not insert a module marker when an export declaration remains', function () {
            const { text } = transform(
                'import type { Dead } from "./types";\nexport { live } from "./live";',
                new Set<string>()
            );

            assert.strictEqual(text, 'export { live } from "./live";');
        });

        test('does not insert a module marker when an export assignment remains', function () {
            const { text } = transform(
                'import type { Dead } from "./types";\nexport default 1;',
                new Set<string>()
            );

            assert.strictEqual(text, 'export default 1;');
        });
    });
});
