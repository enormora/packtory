import assert from 'node:assert';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { suite, test } from 'mocha';
import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget, type Expression } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { isPureExpression } from './pure-expression.ts';

type ProjectFile = { readonly filePath: string; readonly content: string; };

function initializerFromProjectFiles(files: readonly ProjectFile[]): Expression {
    const project = createProject({ withFiles: files });
    return project
        .getSourceFileOrThrow('/project/src/index.ts')
        .getVariableDeclarationOrThrow('schema')
        .getInitializerOrThrow();
}

function assertProjectInitializerPurity(files: readonly ProjectFile[], expected: boolean): void {
    assert.strictEqual(isPureExpression(initializerFromProjectFiles(files), undefined), expected);
}

function createRuntimeProject(): Project {
    return new Project({
        compilerOptions: {
            allowJs: true,
            esModuleInterop: true,
            module: ModuleKind.Node16,
            moduleResolution: ModuleResolutionKind.Node16,
            target: ScriptTarget.ES2022
        },
        skipLoadingLibFiles: true
    });
}

async function writeDiskPackage(root: string): Promise<void> {
    const packageFolder = path.join(root, 'node_modules/schema-lib');
    await mkdir(packageFolder, { recursive: true });
    await writeFile(
        path.join(packageFolder, 'package.json'),
        '{"name":"schema-lib","type":"module","exports":"./index.js"}'
    );
    await writeFile(path.join(packageFolder, 'index.js'), 'export const resultType = { config: "config" };');
}

async function assertDiskPackageInitializerPurity(expected: boolean): Promise<void> {
    const root = await mkdtemp(path.join(tmpdir(), 'packtory-pure-expression-computed-key-'));
    await writeDiskPackage(root);
    const project = createRuntimeProject();
    try {
        const sourceFile = project.createSourceFile(
            path.join(root, 'src/index.ts'),
            'import { resultType } from "schema-lib";\nconst schema = { [resultType.config]: true };',
            { overwrite: true }
        );
        const expression = sourceFile.getVariableDeclarationOrThrow('schema').getInitializerOrThrow();
        assert.strictEqual(isPureExpression(expression, undefined), expected);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

function relativeComputedKeyFiles(resultTypeModule: string, includePackageJson: boolean): readonly ProjectFile[] {
    const packageJson = includePackageJson
        ? [ { filePath: '/project/package.json', content: '{"type":"module"}' } ]
        : [];
    return [
        ...packageJson,
        {
            filePath: '/project/src/index.ts',
            content: 'import { resultType } from "./result-type.js";\nconst schema = { [resultType.config]: true };'
        },
        { filePath: '/project/src/result-type.js', content: resultTypeModule }
    ];
}

function packageComputedKeyFiles(
    packageJson: string,
    runtimePath: string,
    resultTypeModule: string
): readonly ProjectFile[] {
    return [
        {
            filePath: '/project/src/index.ts',
            content: 'import { resultType } from "schema-lib";\nconst schema = { [resultType.config]: true };'
        },
        { filePath: '/project/node_modules/schema-lib/package.json', content: packageJson },
        { filePath: `/project/node_modules/schema-lib/${runtimePath}`, content: resultTypeModule }
    ];
}

suite('pure-expression computed keys', function () {
    suite('accepted', function () {
        test('isPureExpression accepts computed names from relative exported literal object members', function () {
            assertProjectInitializerPurity(
                relativeComputedKeyFiles('export const resultType = { config: "config" };', true),
                true
            );
        });

        test('isPureExpression accepts computed names from npm ESM exported literal object members', function () {
            assertProjectInitializerPurity(
                packageComputedKeyFiles(
                    '{"name":"schema-lib","type":"module","exports":"./index.js"}',
                    'index.js',
                    'export const resultType = { config: "config" };'
                ),
                true
            );
        });

        test('isPureExpression loads computed names from resolved package files', async function () {
            await assertDiskPackageInitializerPurity(true);
        });
    });

    suite('rejected modules', function () {
        test('isPureExpression rejects computed names from CJS package exports', function () {
            assertProjectInitializerPurity(
                packageComputedKeyFiles(
                    '{"name":"schema-lib","exports":"./index.cjs"}',
                    'index.cjs',
                    'exports.resultType = { config: "config" };'
                ),
                false
            );
        });

        test('isPureExpression rejects computed names from non-js package modules', function () {
            assertProjectInitializerPurity(
                packageComputedKeyFiles(
                    '{"name":"schema-lib","type":"module","exports":"./index.cjs"}',
                    'index.cjs',
                    'export const resultType = { config: "config" };'
                ),
                false
            );
        });

        test('isPureExpression rejects computed names from missing modules', function () {
            assertProjectInitializerPurity(
                [
                    { filePath: '/project/package.json', content: '{"type":"module"}' },
                    {
                        filePath: '/project/src/index.ts',
                        content:
                            'import { resultType } from "./missing.js";\nconst schema = { [resultType.config]: true };'
                    }
                ],
                false
            );
        });

        test('isPureExpression rejects computed names from relative non-ESM sources', function () {
            assertProjectInitializerPurity(
                relativeComputedKeyFiles('export const resultType = { config: "config" };', false),
                false
            );
        });
    });

    suite('rejected bindings', function () {
        test('isPureExpression rejects computed names from non-const exported bindings', function () {
            assertProjectInitializerPurity(
                relativeComputedKeyFiles('export let resultType = { config: "config" };', true),
                false
            );
        });

        test('isPureExpression rejects computed names from non-exported bindings', function () {
            assertProjectInitializerPurity(
                relativeComputedKeyFiles('const resultType = { config: "config" };', true),
                false
            );
        });

        test('isPureExpression rejects computed names from missing exports', function () {
            assertProjectInitializerPurity(
                relativeComputedKeyFiles('export const other = { config: "config" };', true),
                false
            );
        });
    });

    suite('rejected values', function () {
        test('isPureExpression rejects computed names from local property reads', function () {
            assertProjectInitializerPurity(
                [ {
                    filePath: '/project/src/index.ts',
                    content: 'const local = {};\nconst schema = { [local.config]: true };'
                } ],
                false
            );
        });

        test('isPureExpression rejects computed names from imported constructor expressions', function () {
            assertProjectInitializerPurity(
                [
                    { filePath: '/project/package.json', content: '{"type":"module"}' },
                    {
                        filePath: '/project/src/index.ts',
                        content:
                            'import { resultType } from "./result-type.js";\nconst schema = { [new resultType()]: true };'
                    },
                    {
                        filePath: '/project/src/result-type.js',
                        content: 'export const resultType = { config: "config" };'
                    }
                ],
                false
            );
        });

        test('isPureExpression rejects computed names from missing exported members', function () {
            assertProjectInitializerPurity(
                relativeComputedKeyFiles('export const resultType = { other: "config" };', true),
                false
            );
        });

        test('isPureExpression rejects computed names from nested exported members', function () {
            assertProjectInitializerPurity(
                [
                    { filePath: '/project/package.json', content: '{"type":"module"}' },
                    {
                        filePath: '/project/src/index.ts',
                        content:
                            'import { resultType } from "./result-type.js";\nconst schema = { [resultType.config.value]: true };'
                    },
                    {
                        filePath: '/project/src/result-type.js',
                        content: 'export const resultType = { config: "config" };'
                    }
                ],
                false
            );
        });

        test('isPureExpression rejects computed names from exported non-objects', function () {
            assertProjectInitializerPurity(
                relativeComputedKeyFiles('export const resultType = "config";', true),
                false
            );
        });

        test('isPureExpression rejects computed names from exported accessors', function () {
            assertProjectInitializerPurity(
                relativeComputedKeyFiles('export const resultType = { get config() { return "config"; } };', true),
                false
            );
        });

        test('isPureExpression rejects computed names from non-primitive exported members', function () {
            assertProjectInitializerPurity(
                relativeComputedKeyFiles('export const resultType = { config: { value: "config" } };', true),
                false
            );
        });
    });
});
