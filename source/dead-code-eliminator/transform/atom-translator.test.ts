import assert from 'node:assert';
import { suite, test } from 'mocha';
import { translateGeneratedOffset } from './atom-translator.ts';
import type { PositionAtom } from './declaration-remover.ts';

suite('atom-translator', function () {
    test('translateGeneratedOffset shifts the offset by the atom delta when the offset is inside an atom', function () {
        const atoms: readonly PositionAtom[] = [{ originalStart: 10, originalEnd: 20, newStart: 3 }];
        assert.strictEqual(translateGeneratedOffset(15, atoms), 8);
    });

    test('translateGeneratedOffset returns undefined when the offset is past every atom', function () {
        const atoms: readonly PositionAtom[] = [{ originalStart: 0, originalEnd: 5, newStart: 0 }];
        assert.strictEqual(translateGeneratedOffset(20, atoms), undefined);
    });

    test('translateGeneratedOffset returns undefined for an offset equal to an atom originalEnd (exclusive upper bound)', function () {
        const atoms: readonly PositionAtom[] = [{ originalStart: 0, originalEnd: 5, newStart: 0 }];
        assert.strictEqual(translateGeneratedOffset(5, atoms), undefined);
    });

    test('translateGeneratedOffset shifts an offset equal to an atom originalStart (inclusive lower bound)', function () {
        const atoms: readonly PositionAtom[] = [{ originalStart: 5, originalEnd: 10, newStart: 2 }];
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
