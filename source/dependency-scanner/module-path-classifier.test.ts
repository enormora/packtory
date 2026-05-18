import assert from 'node:assert';
import { suite, test } from 'mocha';
import { determineExternalDependencies, determineLocalDependencies } from './module-path-classifier.ts';

suite('module-path-classifier', function () {
    test('determineLocalDependencies keeps paths that do not include /node_modules/', function () {
        assert.deepStrictEqual(determineLocalDependencies(['/src/a.ts', '/src/b.ts']), ['/src/a.ts', '/src/b.ts']);
    });

    test('determineLocalDependencies excludes any path that includes /node_modules/', function () {
        assert.deepStrictEqual(determineLocalDependencies(['/src/a.ts', '/proj/node_modules/lodash/index.js']), [
            '/src/a.ts'
        ]);
    });

    test('determineExternalDependencies returns the unscoped module name for a node_modules path', function () {
        assert.deepStrictEqual(determineExternalDependencies(['/proj/node_modules/lodash/index.js']), ['lodash']);
    });

    test('determineExternalDependencies returns the full scope/name pair for scoped packages', function () {
        assert.deepStrictEqual(determineExternalDependencies(['/proj/node_modules/@scope/pkg/index.js']), [
            '@scope/pkg'
        ]);
    });

    test('determineExternalDependencies deduplicates module names across multiple paths', function () {
        assert.deepStrictEqual(
            determineExternalDependencies([
                '/proj/node_modules/lodash/index.js',
                '/proj/node_modules/lodash/cloneDeep.js'
            ]),
            ['lodash']
        );
    });

    test('determineExternalDependencies ignores paths outside node_modules', function () {
        assert.deepStrictEqual(determineExternalDependencies(['/src/local.ts', '/proj/node_modules/react/index.js']), [
            'react'
        ]);
    });
});
