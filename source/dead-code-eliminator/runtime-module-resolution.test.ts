import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { SourceFile } from 'ts-morph';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import type { ArtifactModuleReference } from '../resource-resolver/resolved-bundle.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { createRuntimeModuleResolver, type RuntimeModuleResolver } from './runtime-module-resolution.ts';

function preparedSourceFile(): SourceFile {
    const project = createProject({
        withFiles: [
            { filePath: '/.packtory-artifacts/index.js', content: 'import { make } from "rewritten";' },
            {
                filePath: '/repo/node_modules/original/package.json',
                content: '{"type":"module","exports":"./index.js"}'
            },
            { filePath: '/repo/node_modules/original/index.js', content: 'export { make } from "./builder.js";' },
            { filePath: '/repo/node_modules/original/builder.js', content: 'export function make() { return {}; }' }
        ]
    });
    return project.getSourceFileOrThrow('/.packtory-artifacts/index.js');
}

function resolverFor(
    sourceFile: SourceFile,
    moduleReferences: readonly ArtifactModuleReference[]
): RuntimeModuleResolver {
    return createRuntimeModuleResolver(
        [ {
            sourceFile,
            inputFilePath: '/repo/build/index.js',
            moduleReferences
        } ]
    );
}

suite('runtime dependency resolution for prepared files', function () {
    test('uses the recorded original specifier and importing file location', function () {
        const sourceFile = preparedSourceFile();
        const resolveModule = resolverFor(sourceFile, [ {
            type: 'external-package',
            sourceSpecifier: 'original',
            emittedSpecifier: 'rewritten',
            packageName: 'original'
        } ]);

        assert.strictEqual(
            resolveModule('rewritten', sourceFile)?.getFilePath(),
            '/repo/node_modules/original/index.js'
        );
        assert.strictEqual(resolveModule('original', sourceFile), undefined);
    });

    test('resolves re-exports from the dependency location', function () {
        const sourceFile = preparedSourceFile();
        const resolveModule = resolverFor(sourceFile, [ {
            type: 'external-package',
            sourceSpecifier: 'original',
            emittedSpecifier: 'rewritten',
            packageName: 'original'
        } ]);
        const dependency = resolveModule('rewritten', sourceFile);
        assertDefined(dependency);

        assert.strictEqual(
            resolveModule('./builder.js', dependency)?.getFilePath(),
            '/repo/node_modules/original/builder.js'
        );
    });

    test('keeps missing references unresolved even when the original package is installed', function () {
        const sourceFile = preparedSourceFile();

        assert.strictEqual(resolverFor(sourceFile, [])('original', sourceFile), undefined);
    });

    test('keeps local references on the prepared package graph', function () {
        const sourceFile = preparedSourceFile();
        const resolveModule = resolverFor(sourceFile, [ {
            type: 'local-code',
            sourceSpecifier: 'original',
            emittedSpecifier: 'rewritten',
            targetFilePath: 'other.js'
        } ]);

        assert.strictEqual(resolveModule('rewritten', sourceFile), undefined);
    });
});
