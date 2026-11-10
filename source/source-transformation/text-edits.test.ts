import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../test-libraries/typescript-project.ts';
import { applySourceTextEdits, translateGeneratedOffset, type PositionAtom } from './text-edits.ts';

suite('atom-translator', function () {
    test('keeps text and source positions unchanged when there are no edits', function () {
        const source = 'const title = "🍎";\n';
        const transformed = applySourceTextEdits(source, []);
        assert.deepStrictEqual(transformed, {
            originalCode: source,
            transformedCode: source,
            atoms: [ { originalStart: 0, originalEnd: source.length, newStart: 0 } ]
        });
        assert.strictEqual(translateGeneratedOffset(source.indexOf('🍎'), transformed.atoms), source.indexOf('🍎'));
    });

    test('maps retained text between successive edits and after the final edit', function () {
        const original = 'alpha middle omega tail';
        const transformed = applySourceTextEdits(original, [
            { start: 0, end: 5, content: 'a' },
            { start: 13, end: 18, content: 'z' }
        ]);

        assert.strictEqual(transformed.transformedCode, 'a middle z tail');
        for (const retained of [ 'middle', 'tail' ]) {
            assert.strictEqual(
                translateGeneratedOffset(original.indexOf(retained), transformed.atoms),
                transformed.transformedCode.indexOf(retained)
            );
        }
    });

    test('uses ranges from an existing AST without mutating its text or surrounding formatting', function () {
        const original = 'import { value } from "./value.js";\nexport const result = value;\n';
        const source = createProject({ withFiles: [ { filePath: 'input.js', content: original } ] })
            .getSourceFileOrThrow('input.js');
        const declaration = source.getImportDeclarations()[0] ?? assert.fail('expected the import declaration');
        const literal = declaration.getModuleSpecifier();
        const transformed = applySourceTextEdits(original, [ {
            start: literal.getStart() + 1,
            end: literal.getEnd() - 1,
            content: 'another-package/value.js'
        } ]);
        assert.strictEqual(
            transformed.transformedCode,
            'import { value } from "another-package/value.js";\nexport const result = value;\n'
        );
        assert.strictEqual(source.getFullText(), original);
        assert.strictEqual(
            translateGeneratedOffset(original.indexOf('export'), transformed.atoms),
            transformed.transformedCode.indexOf('export')
        );
        assert.strictEqual(translateGeneratedOffset(literal.getStart() + 1, transformed.atoms), undefined);
    });

    test('translateGeneratedOffset shifts the offset by the atom delta when the offset is inside an atom', function () {
        const atoms: readonly PositionAtom[] = [ { originalStart: 10, originalEnd: 20, newStart: 3 } ];
        assert.strictEqual(translateGeneratedOffset(15, atoms), 8);
    });

    test('translateGeneratedOffset returns undefined when the offset is past every atom', function () {
        const atoms: readonly PositionAtom[] = [ { originalStart: 0, originalEnd: 5, newStart: 0 } ];
        assert.strictEqual(translateGeneratedOffset(20, atoms), undefined);
    });

    test('translateGeneratedOffset returns undefined for an offset equal to an atom originalEnd (exclusive upper bound)', function () {
        const atoms: readonly PositionAtom[] = [ { originalStart: 0, originalEnd: 5, newStart: 0 } ];
        assert.strictEqual(translateGeneratedOffset(5, atoms), undefined);
    });

    test('translateGeneratedOffset shifts an offset equal to an atom originalStart (inclusive lower bound)', function () {
        const atoms: readonly PositionAtom[] = [ { originalStart: 5, originalEnd: 10, newStart: 2 } ];
        assert.strictEqual(translateGeneratedOffset(5, atoms), 2);
    });

    test('translateGeneratedOffset picks the atom whose range contains the offset', function () {
        const atoms: readonly PositionAtom[] = [
            { originalStart: 0, originalEnd: 5, newStart: 0 },
            { originalStart: 10, originalEnd: 20, newStart: 5 }
        ];
        assert.strictEqual(translateGeneratedOffset(12, atoms), 7);
    });

    test('translateGeneratedOffset returns undefined for an offset that falls in the gap between atoms', function () {
        const atoms: readonly PositionAtom[] = [
            { originalStart: 0, originalEnd: 5, newStart: 0 },
            { originalStart: 10, originalEnd: 20, newStart: 5 }
        ];
        assert.strictEqual(translateGeneratedOffset(7, atoms), undefined);
    });
});
