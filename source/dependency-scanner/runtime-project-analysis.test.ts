import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { InMemoryFileSystemHost, Project } from 'ts-morph';
import { getReferencedModules } from './source-file-references.ts';
import { createTypescriptProjectAnalyzer, type TypescriptProject } from './typescript-project-analyzer.ts';

async function analyzeSources(
    files: Readonly<Record<string, string>>,
    resolveDeclarationFiles: boolean
): Promise<TypescriptProject> {
    const fileSystemHost = new InMemoryFileSystemHost();
    for (const [ filePath, content ] of Object.entries(files)) {
        await fileSystemHost.writeFile(filePath, content);
    }
    const analyzer = createTypescriptProjectAnalyzer({
        Project,
        getReferencedModules,
        fileSystemAdapters: {
            fileSystemHostWithoutFilter: fileSystemHost,
            fileSystemHostFilteringDeclarationFiles: fileSystemHost,
            withVirtualPackageJson: fake.returns(fileSystemHost)
        }
    });
    return analyzer.analyzeProject('/src', { resolveDeclarationFiles, mainPackageJson: { type: 'module' } });
}

suite('runtime project analysis', function () {
    for (const extension of [ 'js', 'mjs', 'cjs' ]) {
        test(`records external dependencies in standalone .${extension} roots`, async function () {
            const filePath = `/src/entry.${extension}`;
            const project = await analyzeSources({
                [filePath]: extension === 'cjs'
                    ? 'const dependency = require("tslib"); exports.assign = dependency.__assign;'
                    : 'import { __assign } from "tslib"; export { __assign };',
                '/src/package.json': '{"type":"module"}',
                '/node_modules/tslib/package.json': '{"name":"tslib","main":"index.js"}',
                '/node_modules/tslib/index.js': 'exports.__assign = Object.assign;'
            }, false);

            assert.deepStrictEqual(project.getReferencedModules(filePath), [
                {
                    kind: 'external-package',
                    packageName: 'tslib',
                    sourceSpecifier: 'tslib',
                    emittedSpecifier: 'tslib'
                }
            ]);
        });

        test(`rejects unresolved imports in standalone .${extension} roots`, async function () {
            const filePath = `/src/entry.${extension}`;
            const project = await analyzeSources({
                [filePath]: extension === 'cjs' ? 'require("missing-package");' : 'import "missing-package";'
            }, false);

            assert.throws(function () {
                project.getReferencedModules(filePath);
            }, { message: `Failed to resolve import "missing-package" in file "${filePath}"` });
        });
    }

    test('resolves local references between runtime extensions', async function () {
        const project = await analyzeSources({
            '/src/package.json': '{"type":"module"}',
            '/src/entry.mjs': 'import bridge from "./bridge.cjs"; export { bridge };',
            '/src/bridge.cjs': 'module.exports = require("./value.js");',
            '/src/value.js': 'export const value = 1;'
        }, false);

        assert.deepStrictEqual(project.getReferencedModules('/src/entry.mjs'), [
            {
                kind: 'local-code',
                filePath: '/src/bridge.cjs',
                sourceSpecifier: './bridge.cjs',
                emittedSpecifier: './bridge.cjs'
            }
        ]);
        assert.deepStrictEqual(project.getReferencedModules('/src/bridge.cjs'), [
            {
                kind: 'local-code',
                filePath: '/src/value.js',
                sourceSpecifier: './value.js',
                emittedSpecifier: './value.js'
            }
        ]);
    });

    test('keeps declaration discovery separate from runtime discovery', async function () {
        const project = await analyzeSources({
            '/src/entry.mjs': 'import "missing-package";',
            '/src/entry.cjs': 'require("missing-package");',
            '/src/entry.js': 'import "missing-package";',
            '/src/entry.d.ts': 'export declare const value: string;'
        }, true);

        assert.deepStrictEqual(
            project.getProject().getSourceFiles().map(function (sourceFile) {
                return sourceFile.getFilePath();
            }),
            [ '/src/entry.d.ts' ]
        );
        assert.deepStrictEqual(project.getReferencedModules('/src/entry.mjs'), []);
        assert.deepStrictEqual(project.getReferencedModules('/src/entry.cjs'), []);
    });
});
