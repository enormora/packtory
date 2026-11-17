import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createObservedProject, createProject } from '../test-libraries/typescript-project.ts';
import { getInjectedDynamicImportLiterals } from './injected-dynamic-imports.ts';

suite('injected import analysis work', function () {
    test('finds an injected loader among several function parameters', function () {
        const source = createProject().createSourceFile(
            'input.js',
            [
                'function invoke(context,load){return load("./module.js");}',
                'invoke(null,path=>import(path));'
            ]
                .join('\n')
        );

        assert.deepStrictEqual(
            getInjectedDynamicImportLiterals(source).map(function (literal) {
                return literal.getLiteralText();
            }),
            [ './module.js' ]
        );
    });

    test('ignores a nested callback parameter that shadows the injected loader', function () {
        const source = createProject().createSourceFile(
            'input.js',
            [
                'function invoke(load){const call=(load)=>load("./not-imported.js");call(value=>value);}',
                'invoke(value=>import(value));'
            ]
                .join('\n')
        );

        assert.deepStrictEqual(getInjectedDynamicImportLiterals(source), []);
    });

    for (
        const content of [
            'import {read} from "./dependency.js";export function invoke(load,value){load(value);}',
            'import {read} from "./dependency.js";export function invoke(value){read("literal");}',
            'import * as reader from "./dependency.js";export function invoke(value){reader.read("literal");}',
            'import {read} from "./dependency.js";export function invoke(reader,value){reader.read(value);}',
            'import {read} from "./dependency.js";export function unrelated(read){}read("literal");',
            'import * as reader from "./dependency.js";export function unrelated(reader){}reader.read("literal");',
            'import {read} from "./dependency.js";export function invoke({load}){load("literal");}'
        ]
    ) {
        test(`does not load semantic dependencies for an ineligible call in ${content}`, async function () {
            const dependencyPath = '/project/dependency.js';
            const { project, assertUnread } = await createObservedProject([
                { filePath: dependencyPath, content: 'export function read(value){return value;}' }
            ]);
            const source = project.createSourceFile('/project/index.js', content);

            assert.deepStrictEqual(getInjectedDynamicImportLiterals(source), []);
            assertUnread(dependencyPath);
        });
    }
});
