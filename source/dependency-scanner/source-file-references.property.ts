import assert from 'node:assert';
import { builtinModules } from 'node:module';
import fc from 'fast-check';
import { suite, test } from 'mocha';
import { createProject } from '../test-libraries/typescript-project.ts';
import { getReferencedModules } from './source-file-references.ts';

const packageJsonPath = '/package.json';

const builtinImportArbitrary = fc.constantFrom(
    ...builtinModules.filter((moduleName) => {
        return !moduleName.startsWith('_');
    })
);
const unresolvedImportArbitrary = fc.stringMatching(/^[a-z][\da-z-]{0,10}$/).filter((moduleName) => {
    return !builtinModules.includes(moduleName) && !builtinModules.includes(`node:${moduleName}`);
});

suite('source-file-references', function () {
    test('getReferencedModules() does not throw for builtin imports', function () {
        fc.assert(
            fc.property(builtinImportArbitrary, (moduleName) => {
                const project = createProject({
                    withFiles: [{ filePath: 'main.ts', content: `import value from "${moduleName}";` }]
                });

                assert.doesNotThrow(() => {
                    getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);
                });
            })
        );
    });

    test('getReferencedModules() throws for unresolved non-builtin imports', function () {
        fc.assert(
            fc.property(unresolvedImportArbitrary, (moduleName) => {
                const project = createProject({
                    withFiles: [{ filePath: 'main.ts', content: `import value from "${moduleName}";` }]
                });

                assert.throws(() => {
                    getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);
                }, Error);
            })
        );
    });
});
