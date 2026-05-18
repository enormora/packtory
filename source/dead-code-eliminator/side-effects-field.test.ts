import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { AnalyzedBundleResource } from './analyzed-bundle.ts';
import { computeSideEffectsField } from './side-effects-field.ts';

function resource(targetFilePath: string, hasSideEffects = false): AnalyzedBundleResource {
    return {
        fileDescription: { content: '', isExecutable: false, sourceFilePath: `/${targetFilePath}`, targetFilePath },
        directDependencies: new Set<string>(),
        isSubstituted: false,
        isExplicitlyIncluded: false,
        analysis: {
            survivingBindings: new Set<string>(),
            sideEffectStatements: hasSideEffects ? [{ line: 1, kind: 'expression statement' }] : [],
            sideEffectImports: new Set<string>()
        }
    };
}

suite('side-effects-field', function () {
    test('returns false when there are no resources at all', function () {
        assert.strictEqual(computeSideEffectsField([]), false);
    });

    test('returns false when there are no code files', function () {
        assert.strictEqual(computeSideEffectsField([resource('LICENSE'), resource('readme.md')]), false);
    });

    test('returns false when every code file is pure', function () {
        assert.strictEqual(computeSideEffectsField([resource('a.js'), resource('b.ts')]), false);
    });

    test('returns undefined when every code file has side effects', function () {
        assert.strictEqual(computeSideEffectsField([resource('a.js', true), resource('b.ts', true)]), undefined);
    });

    test('returns the impure file paths when only some code files have side effects', function () {
        assert.deepStrictEqual(computeSideEffectsField([resource('a.js'), resource('b.js', true), resource('c.js')]), [
            './b.js'
        ]);
    });

    test('returns the impure file paths sorted alphabetically', function () {
        assert.deepStrictEqual(
            computeSideEffectsField([resource('zeta.js', true), resource('alpha.js', true), resource('beta.js')]),
            ['./alpha.js', './zeta.js']
        );
    });

    test('returns false when only non-code files exist, even if they carry side-effect statements', function () {
        assert.strictEqual(computeSideEffectsField([resource('LICENSE', true), resource('readme.md', true)]), false);
    });

    test('ignores non-code files when classifying purity', function () {
        assert.strictEqual(
            computeSideEffectsField([resource('a.js'), resource('LICENSE'), resource('package.json')]),
            false
        );
    });

    test('reports the impure file even when pure non-code files are also present', function () {
        const field = computeSideEffectsField([resource('a.js', true), resource('b.js'), resource('LICENSE')]);
        assert.deepStrictEqual(field, ['./a.js']);
    });

    test('emits paths with a leading "./" prefix', function () {
        const field = computeSideEffectsField([resource('a.js', true), resource('b.js')]);
        if (!Array.isArray(field)) {
            assert.fail('Expected sideEffects field to be an array');
            return;
        }
        for (const path of field as readonly string[]) {
            assert.strictEqual(path.startsWith('./'), true);
        }
    });
});
