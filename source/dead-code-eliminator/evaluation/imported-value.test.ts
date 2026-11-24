import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { resolveRuntimeModule } from '../runtime-module-resolution.ts';
import { schemaPackageFile, schemaPackageManifest } from '../pure-expression-test-support.ts';
import type { DeadCodeEliminationSettings } from '../../configuration/dead-code-elimination-settings.ts';
import { importedResult, opaqueResult, typeOfResult, type AbstractValue } from './abstract-value.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';
import { establishEvaluationEnvironment } from './evaluation-environment-establishment.ts';

function canDiscardValue(content: string): boolean {
    const source = createProject().createSourceFile('input.js', `${content}\nexport {};`);
    establishEvaluationEnvironment(
        [ source ],
        { enabled: true, pureImports: [ { from: 'lib' } ] },
        resolveRuntimeModule
    );
    const expression = source.getVariableDeclarationOrThrow('value').getInitializerOrThrow();
    return createSourceEvaluation(source).canDiscard(expression);
}

const summarizedPackage = [
    'export function make() { return {}; }',
    'export function count() { return 1; }',
    'export const tools = { make() { return {}; } };',
    'export const created = compute();'
]
    .join('\n');

function summarizedValue(
    content: string,
    settings: DeadCodeEliminationSettings | undefined
): AbstractValue | undefined {
    const project = createProject({
        withFiles: [
            { filePath: '/project/source/index.ts', content },
            schemaPackageManifest(),
            schemaPackageFile(summarizedPackage)
        ]
    });
    const source = project.getSourceFileOrThrow('/project/source/index.ts');
    establishEvaluationEnvironment(project.getSourceFiles(), settings, resolveRuntimeModule);
    const expression = source.getVariableDeclarationOrThrow('value').getInitializerOrThrow();
    return createSourceEvaluation(source).knownValue(expression);
}

suite('imported values', function () {
    for (
        const [ content, expected ] of [
            [
                'import { make } from "schema-lib";\nconst value = make;',
                importedResult('callable', { from: 'schema-lib', path: [ 'make' ] })
            ],
            [
                'import { tools } from "schema-lib";\nconst value = tools;',
                importedResult('object', { from: 'schema-lib', path: [ 'tools' ] })
            ],
            [ 'import { created } from "schema-lib";\nconst value = created;', opaqueResult('value') ],
            [ 'import { tools } from "schema-lib";\ntools.extra = 1;\nconst value = tools;', opaqueResult('value') ],
            [ 'import { count } from "schema-lib";\nconst value = count();', opaqueResult('value') ],
            [
                'import { make } from "schema-lib";\nconst value = make();',
                importedResult('object', { from: 'schema-lib', path: [ 'make', { type: 'call-result' } ] })
            ]
        ] as const
    ) {
        test(`reads a summarized import as described by its summary: ${content}`, function () {
            assert.deepStrictEqual(summarizedValue(content, undefined), expected);
        });
    }

    test('reads a trusted import as an object regardless of its summary', function () {
        assert.deepStrictEqual(
            summarizedValue(
                'import { created } from "schema-lib";\nconst value = created;',
                { enabled: true, pureImports: [ { from: 'schema-lib' } ] }
            ),
            importedResult('object', { from: 'schema-lib', path: [ 'created' ] })
        );
    });

    for (
        const content of [
            'import * as lib from "lib";\nconst value = lib.member;',
            'import * as lib from "lib";\nconst value = lib.member.nested;',
            'import { make } from "lib";\nconst value = make();',
            'import * as lib from "lib";\nconst value = lib.member.make();',
            'import { make } from "lib";\nconst alias = make;\nconst value = alias();'
        ]
    ) {
        test(`evaluates a trusted import without effects: ${content}`, function () {
            assert.strictEqual(canDiscardValue(content), true);
        });
    }

    for (
        const content of [
            'import { other } from "other-lib";\nconst value = other.member;',
            'import { other } from "other-lib";\nconst value = other();',
            'const value = missing.member;',
            'import { make } from "lib";\nfunction probe() { return make; }\nconst value = probe();'
        ]
    ) {
        test(`keeps an untrusted or unproven import observable: ${content}`, function () {
            assert.strictEqual(canDiscardValue(content), false);
        });
    }

    test('reports an imported callable as a function', function () {
        assert.strictEqual(typeOfResult(importedResult('callable', { from: 'lib', path: [ 'make' ] })), 'function');
    });
});
