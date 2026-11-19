import assert from 'node:assert';
import { suite, test } from 'mocha';
import { inferredModuleReferences } from './module-reference-fixtures.ts';

suite('module reference fixtures', function () {
    for (
        const content of [
            'export const value = 1;',
            '/* import("./ignored.js") */ export const value = 1;',
            'export const value = `import("./ignored.js")`;',
            'import "#internal";'
        ]
    ) {
        test(`does not invent references in ${content}`, function () {
            assert.deepStrictEqual(inferredModuleReferences('/source/index.js', 'index.js', content), []);
        });
    }

    for (
        const content of [
            'export * as namespace from "./local.js";',
            'import("./local.js");',
            'import.meta.resolve("./local.js");',
            'require("./local.js");',
            String.raw`require("\u002e/local.js");`
        ]
    ) {
        test(`retains the local reference in ${content}`, function () {
            assert.deepStrictEqual(inferredModuleReferences('/source/index.js', 'index.js', content), [ {
                type: 'local-code',
                sourceSpecifier: './local.js',
                emittedSpecifier: './local.js',
                targetFilePath: 'local.js'
            } ]);
        });
    }
});
