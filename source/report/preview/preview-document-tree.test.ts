import assert from 'node:assert';
import { test } from 'mocha';
import { compareTreeNodes, treeNodeSortKey } from './preview-document-tree.ts';

test('treeNodeSortKey gives the root package.json file the highest precedence', () => {
    assert.strictEqual(treeNodeSortKey({ name: 'package.json', type: 'file' }), '0:package.json');
});

test('treeNodeSortKey gives a directory a higher precedence than a regular file', () => {
    assert.strictEqual(treeNodeSortKey({ name: 'src', type: 'directory' }), '1:src');
    assert.strictEqual(treeNodeSortKey({ name: 'README.md', type: 'file' }), '2:README.md');
});

test('compareTreeNodes orders the root package.json before directories', () => {
    assert.ok(compareTreeNodes({ name: 'package.json', type: 'file' }, { name: 'src', type: 'directory' }) < 0);
});

test('compareTreeNodes orders directories before non-manifest files', () => {
    assert.ok(compareTreeNodes({ name: 'src', type: 'directory' }, { name: 'a.txt', type: 'file' }) < 0);
});

test('compareTreeNodes returns zero for two nodes with the same sort key', () => {
    assert.strictEqual(compareTreeNodes({ name: 'a', type: 'file' }, { name: 'a', type: 'file' }), 0);
});

test('treeNodeSortKey treats a directory literally named "package.json" as a directory, not the root manifest', () => {
    assert.strictEqual(treeNodeSortKey({ name: 'package.json', type: 'directory' }), '1:package.json');
});
