import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { SourceFile } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { createSyntaxAnalysis, type SyntaxAnalysisResults } from './syntax-analysis.ts';

suite('syntax analysis snapshots', function () {
    test('reuses injected snapshot results across readers', function () {
        const source = createProject().createSourceFile('input.js', 'const value=1;');
        const results: SyntaxAnalysisResults<string> = new WeakMap();
        let analyses = 0;
        const readContent = function (current: SourceFile): string {
            analyses += 1;
            return current.getFullText();
        };
        const first = createSyntaxAnalysis(readContent, results);
        const second = createSyntaxAnalysis(readContent, results);
        assert.strictEqual(analyses, 0);
        assert.strictEqual(first(source), 'const value=1;');
        assert.strictEqual(second(source), 'const value=1;');
        assert.strictEqual(analyses, 1);
    });

    test('reuses analysis until the compiler source changes', function () {
        const source = createProject().createSourceFile('input.js', 'const value = 1;');
        let analyses = 0;
        const analyze = createSyntaxAnalysis(function (current) {
            analyses += 1;
            return current.getFullText();
        }, new WeakMap());

        assert.strictEqual(analyze(source), 'const value = 1;');
        assert.strictEqual(analyze(source), 'const value = 1;');
        assert.strictEqual(analyses, 1);
        source.replaceWithText('const value = 2;');
        assert.strictEqual(analyze(source), 'const value = 2;');
        assert.strictEqual(analyses, 2);
    });

    test('keeps identical text in different projects separate and reuses undefined results', function () {
        const first = createProject().createSourceFile('input.js', 'const value = 1;');
        const second = createProject().createSourceFile('input.js', 'const value = 1;');
        let analyses = 0;
        const analyze = createSyntaxAnalysis<undefined>(function () {
            analyses += 1;
            return undefined;
        }, new WeakMap());

        analyze(first);
        analyze(first);
        assert.strictEqual(analyses, 1);
        analyze(second);
        assert.strictEqual(analyses, 2);
    });
});
