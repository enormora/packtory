import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { Expression } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import { firstVariableInitializerExpression } from '../test-libraries/first-variable-initializer-expression.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { isPureExpression } from './pure-expression.ts';

type ProjectFile = { readonly content: string; readonly filePath: string; };

function initializerFromProjectFiles(files: readonly ProjectFile[]): Expression {
    const project = createProject({ withFiles: files });
    return project
        .getSourceFileOrThrow('/project/src/index.ts')
        .getVariableDeclarationOrThrow('schema')
        .getInitializerOrThrow();
}

function variableInitializer(content: string, name: string): Expression {
    const project = createProject({ withFiles: [ { filePath: 'index.ts', content } ] });
    return project
        .getSourceFileOrThrow('index.ts')
        .getVariableDeclarationOrThrow(name)
        .getInitializerOrThrow();
}

function schemaPackageFile(content: string): ProjectFile {
    return { filePath: '/project/node_modules/schema-lib/index.js', content };
}

function schemaPackageManifest(): ProjectFile {
    return {
        filePath: '/project/node_modules/schema-lib/package.json',
        content: '{"name":"schema-lib","type":"module","exports":"./index.js"}'
    };
}

function pureBuilderPackage(): ProjectFile {
    return schemaPackageFile([
        'export const z = {',
        '  string() { return { check(rule) { return {}; } }; },',
        '  minLength(value) { return {}; },',
        '  number() { return {}; },',
        '  object(shape) { return { extend(extra) { return {}; } }; }',
        '};'
    ]
        .join('\n'));
}

function schemaExpression(content: readonly string[], packageFile: ProjectFile): Expression {
    return initializerFromProjectFiles([
        { filePath: '/project/src/index.ts', content: content.join('\n') },
        schemaPackageManifest(),
        packageFile
    ]);
}

suite('pure-expression builder facts', function () {
    test('proves local constants initialized from external builder chains', function () {
        const expression = schemaExpression([
            'import { z } from "schema-lib";',
            'const nameSchema = z.string().check(z.minLength(1));',
            'const userSchema = z.object({ name: nameSchema });',
            'const schema = userSchema.extend({ id: z.number() });'
        ], pureBuilderPackage());

        assert.strictEqual(isPureExpression(expression, undefined), true);
    });

    test('proves namespace builder aliases from external summaries', function () {
        const expression = schemaExpression(
            [
                'import * as schemaLib from "schema-lib";',
                'const z = schemaLib.z;',
                'const baseSchema = z.object({});',
                'const schema = baseSchema.extend({ value: z.string() });'
            ],
            schemaPackageFile([
                'export const z = {',
                '  string() { return {}; },',
                '  object(shape) { return { extend(extra) { return {}; } }; }',
                '};'
            ]
                .join('\n'))
        );

        assert.strictEqual(isPureExpression(expression, undefined), true);
    });

    test('proves reexported builder imports from external summaries', function () {
        const expression = initializerFromProjectFiles([
            {
                filePath: '/project/src/index.ts',
                content: [
                    'import { z } from "schema-lib";',
                    'const userSchema = z.object({ name: z.string() });',
                    'const schema = userSchema.extend({ id: z.number() });'
                ]
                    .join('\n')
            },
            schemaPackageManifest(),
            schemaPackageFile('export { z } from "./schema.js";'),
            {
                filePath: '/project/node_modules/schema-lib/schema.js',
                content: [
                    'export const z = {',
                    '  string() { return {}; },',
                    '  number() { return {}; },',
                    '  object(shape) { return { extend(extra) { return {}; } }; }',
                    '};'
                ]
                    .join('\n')
            }
        ]);

        assert.strictEqual(isPureExpression(expression, undefined), true);
    });

    test('proves arrays and object spreads of proven schema values', function () {
        const expression = schemaExpression([
            'import { z } from "schema-lib";',
            'const nameSchema = z.string();',
            'const userSchema = z.object({ name: nameSchema });',
            'const schema = { ...userSchema, entries: [nameSchema, z.number()] };'
        ], pureBuilderPackage());

        assert.strictEqual(isPureExpression(expression, undefined), true);
    });

    test('rejects object spreads of pure non-object values', function () {
        const expression = schemaExpression([
            'import { make } from "schema-lib";',
            'const value = make();',
            'const schema = { ...value };'
        ], schemaPackageFile('export function make() { return "value"; }'));

        assert.strictEqual(isPureExpression(expression, undefined), false);
    });

    test('rejects unknown schema-shaped calls', function () {
        const expression = firstVariableInitializerExpression(
            'declare const z: { object(shape: object): object; };\nconst schema = z.object({});'
        );

        assert.strictEqual(isPureExpression(expression, undefined), false);
    });

    test('rejects computed and element-access builder calls', function () {
        const settings: DeadCodeEliminationSettings = { enabled: true, pureImports: [ { from: 'schema-lib' } ] };

        assert.strictEqual(
            isPureExpression(
                variableInitializer(
                    'import { z } from "schema-lib";\nconst method = "object";\nconst schema = z[method]({});',
                    'schema'
                ),
                settings
            ),
            false
        );
        assert.strictEqual(
            isPureExpression(
                firstVariableInitializerExpression('import { z } from "schema-lib";\nconst schema = z["object"]({});'),
                settings
            ),
            false
        );
    });

    test('rejects getter-backed builder properties', function () {
        const expression = schemaExpression([
            'import { z } from "schema-lib";',
            'const schema = z.string();'
        ], schemaPackageFile('export const z = { get string() { return function () { return {}; }; } };'));

        assert.strictEqual(isPureExpression(expression, undefined), false);
    });

    test('rejects mutated local builder aliases', function () {
        const settings: DeadCodeEliminationSettings = { enabled: true, pureImports: [ { from: 'schema-lib' } ] };

        assert.strictEqual(
            isPureExpression(
                variableInitializer(
                    [
                        'import { z } from "schema-lib";',
                        'const builder = z;',
                        'builder.string = compute;',
                        'const schema = builder.string();'
                    ]
                        .join('\n'),
                    'schema'
                ),
                settings
            ),
            false
        );
        assert.strictEqual(
            isPureExpression(
                variableInitializer(
                    [
                        'import { z } from "schema-lib";',
                        'let builder = z;',
                        'builder = otherBuilder;',
                        'const schema = builder.string();'
                    ]
                        .join('\n'),
                    'schema'
                ),
                settings
            ),
            false
        );
    });
});
