import assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildPathTree, comparePathNodes, pathNodeSortKey } from './path-tree.ts';

type Item = { readonly path: string };

function item(value: string): Item {
    return { path: value };
}

suite('path-tree', function () {
    suite('pathNodeSortKey', function () {
        test('gives a package.json file the highest precedence', function () {
            assert.strictEqual(pathNodeSortKey({ name: 'package.json', type: 'file' }), '0:package.json');
        });

        test('gives a directory a higher precedence than a regular file', function () {
            assert.strictEqual(pathNodeSortKey({ name: 'src', type: 'directory' }), '1:src');
            assert.strictEqual(pathNodeSortKey({ name: 'README.md', type: 'file' }), '2:README.md');
        });

        test('treats a directory literally named "package.json" as a directory, not the root manifest', function () {
            assert.strictEqual(pathNodeSortKey({ name: 'package.json', type: 'directory' }), '1:package.json');
        });
    });

    suite('comparePathNodes', function () {
        test('orders the package.json file before directories', function () {
            assert.ok(comparePathNodes({ name: 'package.json', type: 'file' }, { name: 'src', type: 'directory' }) < 0);
        });

        test('orders directories before non-manifest files', function () {
            assert.ok(comparePathNodes({ name: 'src', type: 'directory' }, { name: 'a.txt', type: 'file' }) < 0);
        });

        test('returns zero for two nodes with the same sort key', function () {
            assert.strictEqual(comparePathNodes({ name: 'a', type: 'file' }, { name: 'a', type: 'file' }), 0);
        });
    });

    suite('buildPathTree', function () {
        test('returns an empty array when no items are given', function () {
            const nodes = buildPathTree<Item>([], (entry) => {
                return entry.path;
            });
            assert.deepStrictEqual(nodes, []);
        });

        test('returns a single file node for an item at the root', function () {
            const [node, ...rest] = buildPathTree([item('package.json')], (entry) => {
                return entry.path;
            });
            assert.ok(node);
            assert.strictEqual(node.type, 'file');
            assert.strictEqual(node.path, 'package.json');
            assert.deepStrictEqual(rest, []);
        });

        test('orders the root package.json before directories and nested files', function () {
            const nodes = buildPathTree([item('src/index.js'), item('package.json')], (entry) => {
                return entry.path;
            });

            const types = nodes.map((node) => {
                return node.type;
            });
            assert.deepStrictEqual(types, ['file', 'directory', 'file']);
            const [first, second, third] = nodes;
            assert.ok(first);
            assert.ok(second);
            assert.ok(third);
            assert.strictEqual(first.name, 'package.json');
            assert.strictEqual(second.name, 'src');
            assert.strictEqual(third.path, 'src/index.js');
        });

        test('assigns increasing depth to nested directories and the leaf file', function () {
            const nodes = buildPathTree([item('src/lib/util.js')], (entry) => {
                return entry.path;
            });
            const depths = nodes.map((node) => {
                return node.depth;
            });
            assert.deepStrictEqual(depths, [1, 2, 2]);
        });

        test('exposes the original item on file nodes via the item field', function () {
            const original = item('package.json');
            const [node] = buildPathTree([original], (entry) => {
                return entry.path;
            });
            if (node?.type !== 'file') {
                assert.fail('expected a file node');
            }
            assert.strictEqual(node.item, original);
        });

        test('builds the directory path by joining parent segments', function () {
            const nodes = buildPathTree([item('src/lib/util.js')], (entry) => {
                return entry.path;
            });
            const srcDirectory = nodes.find((node) => {
                return node.type === 'directory' && node.name === 'src';
            });
            const libDirectory = nodes.find((node) => {
                return node.type === 'directory' && node.name === 'lib';
            });
            assert.ok(srcDirectory);
            assert.ok(libDirectory);
            assert.strictEqual(srcDirectory.path, 'src');
            assert.strictEqual(libDirectory.path, 'src/lib');
        });
    });
});
