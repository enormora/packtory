import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    allNamespaceProperties,
    mergeNamespaceDemand,
    namespaceMemberDemand,
    namespaceProperties,
    namespacePropertyDemand,
    noNamespaceProperties,
    type NamespaceDemand
} from './namespace-demand.ts';

suite('namespace property demands', function () {
    test('combines independent property reads without changing either input', function () {
        const left = namespaceMemberDemand('first', noNamespaceProperties);
        const right = namespaceMemberDemand('second', allNamespaceProperties);
        const result = mergeNamespaceDemand(left, right);
        assert.deepStrictEqual(namespaceProperties(result), new Set([ 'first', 'second' ]));
        assert.deepStrictEqual(namespaceProperties(left), new Set([ 'first' ]));
        assert.deepStrictEqual(namespaceProperties(right), new Set([ 'second' ]));
        assert.strictEqual(namespacePropertyDemand(result, 'second'), allNamespaceProperties);
    });

    test('merges nested demands from multiple consumers', function () {
        const left = namespaceMemberDemand('default', namespaceMemberDemand('first', noNamespaceProperties));
        const right = namespaceMemberDemand('default', namespaceMemberDemand('second', noNamespaceProperties));
        const result = mergeNamespaceDemand(left, right);
        assert.deepStrictEqual(namespaceProperties(result), new Set([ 'default' ]));
        assert.deepStrictEqual(
            namespaceProperties(namespacePropertyDemand(result, 'default')),
            new Set([ 'first', 'second' ])
        );
    });

    test('keeps all properties when either consumer observes the complete value', function () {
        const finite = namespaceMemberDemand('value', noNamespaceProperties);
        assert.strictEqual(mergeNamespaceDemand(allNamespaceProperties, finite), allNamespaceProperties);
        assert.strictEqual(mergeNamespaceDemand(finite, allNamespaceProperties), allNamespaceProperties);
        assert.strictEqual(namespaceProperties(allNamespaceProperties), undefined);
        assert.strictEqual(namespacePropertyDemand(allNamespaceProperties, 'anything'), allNamespaceProperties);
    });

    test('distinguishes an absent property from a property with an escaping result', function () {
        const demand = namespaceMemberDemand('present', allNamespaceProperties);
        assert.strictEqual(namespacePropertyDemand(demand, 'present'), allNamespaceProperties);
        assert.strictEqual(namespacePropertyDemand(demand, 'missing'), noNamespaceProperties);
    });

    test('retains an observed property whose result has no consumers', function () {
        const demand = namespaceMemberDemand('observed', noNamespaceProperties);
        assert.deepStrictEqual(namespaceProperties(demand), new Set([ 'observed' ]));
        assert.strictEqual(namespacePropertyDemand(demand, 'observed'), noNamespaceProperties);
        assert.deepStrictEqual(namespaceProperties(noNamespaceProperties), new Set());
    });

    test('reuses the previous demand when no new observations are added', function () {
        const demand = namespaceMemberDemand('value', namespaceMemberDemand('nested', allNamespaceProperties));
        const duplicate = namespaceMemberDemand('value', namespaceMemberDemand('nested', allNamespaceProperties));
        assert.strictEqual(mergeNamespaceDemand(demand, duplicate), demand);
        assert.strictEqual(mergeNamespaceDemand(demand, noNamespaceProperties), demand);
        assert.strictEqual(mergeNamespaceDemand(demand, demand), demand);
    });

    test('keeps an escaped subtree while merging its sibling observations', function () {
        const demand = new Map<string, NamespaceDemand>([ [ 'escaped', allNamespaceProperties ], [
            'other',
            noNamespaceProperties
        ] ]);
        const observation = namespaceMemberDemand('escaped', namespaceMemberDemand('nested', noNamespaceProperties));
        assert.strictEqual(mergeNamespaceDemand(demand, observation), demand);
    });

    test('merges deep property paths without recursive stack growth', function () {
        const depth = 20_000;
        let left = namespaceMemberDemand('first', allNamespaceProperties);
        let right = namespaceMemberDemand('second', allNamespaceProperties);
        for (let index = 0; index < depth; index += 1) {
            left = namespaceMemberDemand('path', left);
            right = namespaceMemberDemand('path', right);
        }
        let result = mergeNamespaceDemand(left, right);
        for (let index = 0; index < depth; index += 1) {
            result = namespacePropertyDemand(result, 'path');
        }
        assert.deepStrictEqual(namespaceProperties(result), new Set([ 'first', 'second' ]));
    });
});
