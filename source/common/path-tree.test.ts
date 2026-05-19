import assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildPathTree } from './path-tree.ts';

type Item = { readonly path: string };

function item(value: string): Item {
    return { path: value };
}

function namesOf(nodes: readonly { readonly name: string }[]): readonly string[] {
    return nodes.map((node) => {
        return node.name;
    });
}

suite('path-tree', function () {
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

    test('orders package.json before any directory or other file at the root', function () {
        const nodes = buildPathTree(
            [item('readme.md'), item('src/index.js'), item('package.json'), item('zoo.txt')],
            (entry) => {
                return entry.path;
            }
        );
        assert.deepStrictEqual(namesOf(nodes), ['package.json', 'src', 'index.js', 'readme.md', 'zoo.txt']);
    });

    test('orders directories before non-manifest sibling files at the same depth', function () {
        const nodes = buildPathTree([item('a.txt'), item('z/inner.js')], (entry) => {
            return entry.path;
        });
        assert.deepStrictEqual(namesOf(nodes), ['z', 'inner.js', 'a.txt']);
    });

    test('orders sibling directories lexicographically', function () {
        const nodes = buildPathTree([item('z/a.js'), item('a/b.js')], (entry) => {
            return entry.path;
        });
        assert.deepStrictEqual(namesOf(nodes), ['a', 'b.js', 'z', 'a.js']);
    });

    test('orders sibling non-manifest files lexicographically at the root', function () {
        const nodes = buildPathTree([item('z.txt'), item('a.txt')], (entry) => {
            return entry.path;
        });
        assert.deepStrictEqual(namesOf(nodes), ['a.txt', 'z.txt']);
    });

    test('treats a directory literally named "package.json" as a directory rather than the root manifest', function () {
        const nodes = buildPathTree([item('package.json/inner.js'), item('actual.txt')], (entry) => {
            return entry.path;
        });
        assert.deepStrictEqual(namesOf(nodes), ['package.json', 'inner.js', 'actual.txt']);
    });

    test('keeps a directory literally named "package.json" sorted lexicographically among sibling directories (not promoted to manifest priority)', function () {
        const nodes = buildPathTree([item('package.json/inner.js'), item('aaa/outer.js')], (entry) => {
            return entry.path;
        });
        assert.deepStrictEqual(namesOf(nodes), ['aaa', 'outer.js', 'package.json', 'inner.js']);
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
