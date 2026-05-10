import assert from 'node:assert';
import { test } from 'mocha';
import type { AnalyzedBundleResource } from './analyzed-bundle.ts';
import { computeSideEffectsField, isCodeFile } from './side-effects-field.ts';

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

test('isCodeFile recognizes .js as code', () => {
    assert.strictEqual(isCodeFile('index.js'), true);
});

test('isCodeFile recognizes .ts as code', () => {
    assert.strictEqual(isCodeFile('index.ts'), true);
});

test('isCodeFile recognizes .tsx as code', () => {
    assert.strictEqual(isCodeFile('index.tsx'), true);
});

test('isCodeFile recognizes .jsx as code', () => {
    assert.strictEqual(isCodeFile('index.jsx'), true);
});

test('isCodeFile recognizes .cjs as code', () => {
    assert.strictEqual(isCodeFile('index.cjs'), true);
});

test('isCodeFile recognizes .mjs as code', () => {
    assert.strictEqual(isCodeFile('index.mjs'), true);
});

test('isCodeFile recognizes .d.ts as code', () => {
    assert.strictEqual(isCodeFile('index.d.ts'), true);
});

test('isCodeFile rejects .json as not code', () => {
    assert.strictEqual(isCodeFile('data.json'), false);
});

test('isCodeFile rejects LICENSE as not code', () => {
    assert.strictEqual(isCodeFile('LICENSE'), false);
});

test('isCodeFile rejects markdown as not code', () => {
    assert.strictEqual(isCodeFile('readme.md'), false);
});

test('returns false when there are no resources at all', () => {
    assert.strictEqual(computeSideEffectsField([]), false);
});

test('returns false when there are no code files', () => {
    assert.strictEqual(computeSideEffectsField([resource('LICENSE'), resource('readme.md')]), false);
});

test('returns false when every code file is pure', () => {
    assert.strictEqual(computeSideEffectsField([resource('a.js'), resource('b.ts')]), false);
});

test('returns undefined when every code file has side effects', () => {
    assert.strictEqual(computeSideEffectsField([resource('a.js', true), resource('b.ts', true)]), undefined);
});

test('returns the impure file paths when only some code files have side effects', () => {
    assert.deepStrictEqual(computeSideEffectsField([resource('a.js'), resource('b.js', true), resource('c.js')]), [
        './b.js'
    ]);
});

test('returns the impure file paths sorted alphabetically', () => {
    assert.deepStrictEqual(
        computeSideEffectsField([resource('zeta.js', true), resource('alpha.js', true), resource('beta.js')]),
        ['./alpha.js', './zeta.js']
    );
});

test('returns false when only non-code files exist, even if they carry side-effect statements', () => {
    assert.strictEqual(computeSideEffectsField([resource('LICENSE', true), resource('readme.md', true)]), false);
});

test('ignores non-code files when classifying purity', () => {
    assert.strictEqual(
        computeSideEffectsField([resource('a.js'), resource('LICENSE'), resource('package.json')]),
        false
    );
});

test('reports the impure file even when pure non-code files are also present', () => {
    const field = computeSideEffectsField([resource('a.js', true), resource('b.js'), resource('LICENSE')]);
    assert.deepStrictEqual(field, ['./a.js']);
});

test('emits paths with a leading "./" prefix', () => {
    const field = computeSideEffectsField([resource('a.js', true), resource('b.js')]);
    if (!Array.isArray(field)) {
        assert.fail('Expected sideEffects field to be an array');
        return;
    }
    for (const path of field as readonly string[]) {
        assert.strictEqual(path.startsWith('./'), true);
    }
});
