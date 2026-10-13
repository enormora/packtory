import assert from 'node:assert';
import { builtinModules } from 'node:module';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import { createProject } from '../test-libraries/typescript-project.ts';
import { getReferencedModules } from './source-file-references.ts';

const packageManifestPath = '/package.json';

const builtinImportArbitrary = fastCheck.constantFrom(
    ...builtinModules.filter(function (moduleName) {
        return !moduleName.startsWith('_');
    })
);
const unresolvedImportArbitrary = fastCheck.stringMatching(/^[a-z][\da-z-]{0,10}$/).filter(function (moduleName) {
    return !builtinModules.includes(moduleName) && !builtinModules.includes(`node:${moduleName}`);
});

suite('source-file-references', function () {
    test('getReferencedModules() does not throw for builtin imports', function () {
        fastCheck.assert(
            fastCheck.property(builtinImportArbitrary, function (moduleName) {
                const project = createProject({
                    withFiles: [ { filePath: 'main.ts', content: `import value from "${moduleName}";` } ]
                });

                const references = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageManifestPath);

                assert.deepStrictEqual(references, []);
            })
        );
    });

    test('getReferencedModules() throws for unresolved non-builtin imports', function () {
        fastCheck.assert(
            fastCheck.property(unresolvedImportArbitrary, function (moduleName) {
                const project = createProject({
                    withFiles: [ { filePath: 'main.ts', content: `import value from "${moduleName}";` } ]
                });

                assert.throws(function () {
                    getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageManifestPath);
                }, Error);
            })
        );
    });
});
