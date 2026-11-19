import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Node as TypeScriptMorphNode, SyntaxKind, type SourceFile } from 'ts-morph';
import { eliminateEntryModule } from '../test-libraries/eliminator-test-support.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { withSource } from '../test-libraries/transform-test-support.ts';

async function eliminateClassDefinition(declaration: string): Promise<SourceFile> {
    const source = withSource(await eliminateEntryModule(`${declaration}; export const value = 42;`));
    assert.strictEqual(source.getVariableDeclarationOrThrow('value').getInitializerOrThrow().getText(), '42');
    assert.deepStrictEqual(
        source.getExportSymbols().map(function (symbol) {
            return symbol.getName();
        }),
        [ 'value' ]
    );
    return source;
}

function assertRetainedHeritage(source: SourceFile, heritage: string): void {
    const declaration = source.getDescendants().find(function (node) {
        return TypeScriptMorphNode.isClassDeclaration(node) || TypeScriptMorphNode.isClassExpression(node);
    });
    assertDefined(declaration);
    assert.strictEqual(declaration.getExtends()?.getExpression().getText(), heritage);
}

suite('eliminator class heritage', function () {
    const invalidHeritage = [
        '3',
        'true',
        '"base"',
        'undefined',
        '{}',
        '() => {}',
        'async function () {}',
        'function* () {}',
        'async function* () {}',
        'class extends 3 {}'
    ];
    for (const heritage of invalidHeritage) {
        for (const prefix of [ 'class Unused', 'const unused = class' ]) {
            test(`preserves TypeError for ${prefix} extends ${heritage}`, async function () {
                const source = await eliminateClassDefinition(`${prefix} extends (${heritage}) {}`);
                assertRetainedHeritage(source, `(${heritage})`);
            });
        }
    }
    for (const heritage of [ 'null', 'function () {}', 'class {}', 'class extends null {}' ]) {
        for (const prefix of [ 'class Unused', 'const unused = class' ]) {
            test(`removes ${prefix} with proven safe heritage ${heritage}`, async function () {
                const source = await eliminateClassDefinition(`${prefix} extends (${heritage}) {}`);
                assert.strictEqual(source.getClasses().length, 0);
                assert.strictEqual(source.getDescendantsOfKind(SyntaxKind.ClassExpression).length, 0);
            });
        }
    }

    suite('definition errors', function () {
        test('retains the invalid prototype assignment before heritage evaluation', async function () {
            const source = await eliminateClassDefinition(
                'function Base() {} Base.prototype = 3; class Unused extends Base {}'
            );
            assertRetainedHeritage(source, 'Base');
            const assignment = source.getFirstDescendantByKindOrThrow(SyntaxKind.BinaryExpression);
            assert.strictEqual(assignment.getText(), 'Base.prototype = 3');
            assert.ok(assignment.getStart() < source.getClassOrThrow('Unused').getStart());
        });

        test('retains a bound arrow as a nonconstructible base', async function () {
            const source = await eliminateClassDefinition(
                'const Base = (() => {}).bind(null); class Unused extends Base {}'
            );
            assertRetainedHeritage(source, 'Base');
            assert.strictEqual(
                source.getVariableDeclarationOrThrow('Base').getInitializerOrThrow().getText(),
                '(() => {}).bind(null)'
            );
        });

        for (const heritage of [ 'Missing', 'Unused' ]) {
            test(`retains the failing heritage read of ${heritage}`, async function () {
                assertRetainedHeritage(await eliminateClassDefinition(`class Unused extends ${heritage} {}`), heritage);
            });
        }

        test('retains a class heritage read before its initialization', async function () {
            const source = await eliminateClassDefinition('class Unused extends Base {} class Base {}');
            assertRetainedHeritage(source, 'Base');
            assert.ok(source.getClassOrThrow('Unused').getStart() < source.getClassOrThrow('Base').getStart());
        });

        for (
            const declaration of [
                'const unused = class { static { throw new Error(); } };',
                'class Unused extends (class { static { throw new Error(); } }) {}'
            ]
        ) {
            test(`retains the static initialization exception in ${declaration}`, async function () {
                const source = await eliminateClassDefinition(declaration);
                const block = source.getFirstDescendantByKindOrThrow(SyntaxKind.ClassStaticBlockDeclaration);
                assert.strictEqual(
                    block.getFirstDescendantByKindOrThrow(SyntaxKind.ThrowStatement).getText(),
                    'throw new Error();'
                );
            });
        }

        test('retains a failing static field initializer', async function () {
            const source = await eliminateClassDefinition('const unused = class { static value = missing(); };');
            const field = source.getFirstDescendantByKindOrThrow(SyntaxKind.PropertyDeclaration);
            assert.strictEqual(field.isStatic(), true);
            assert.strictEqual(field.getInitializerOrThrow().getText(), 'missing()');
        });
    });
});
