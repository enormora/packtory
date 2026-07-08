import assert from 'node:assert';
import { builtinModules } from 'node:module';
import fc from 'fast-check';
import { suite, test } from 'mocha';
import { createProject } from '../test-libraries/typescript-project.ts';
import { getReferencedModules } from './source-file-references.ts';

const packageJsonPath = '/package.json';

const builtinImportArbitrary = fc.constantFrom(
    ...builtinModules.filter(function (moduleName) {
        return !moduleName.startsWith('_');
    })
);
const unresolvedImportArbitrary = fc.stringMatching(/^[a-z][\da-z-]{0,10}$/).filter(function (moduleName) {
    return !builtinModules.includes(moduleName) && !builtinModules.includes(`node:${moduleName}`);
});

suite('source-file-references', function () {
    test('getReferencedModules() does not throw for builtin imports', function () {
        fc.assert(
            fc.property(builtinImportArbitrary, function (moduleName) {
                const project = createProject({
                    withFiles: [ { filePath: 'main.ts', content: `import value from "${moduleName}";` } ]
                });

                const references = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

                assert.deepStrictEqual(references, []);
            })
        );
    });

    test('getReferencedModules() throws for unresolved non-builtin imports', function () {
        fc.assert(
            fc.property(unresolvedImportArbitrary, function (moduleName) {
                const project = createProject({
                    withFiles: [ { filePath: 'main.ts', content: `import value from "${moduleName}";` } ]
                });

                assert.throws(function () {
                    getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);
                }, Error);
            })
        );
    });
});
