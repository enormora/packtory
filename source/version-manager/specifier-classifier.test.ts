import assert from 'node:assert';
import { test } from 'mocha';
import { classifySpecifier } from './specifier-classifier.ts';

test('classifies an exact version as registry', () => {
    assert.deepStrictEqual(classifySpecifier('left-pad', '1.2.3'), { kind: 'registry' });
});

test('classifies a range as registry', () => {
    assert.deepStrictEqual(classifySpecifier('left-pad', '^1.0.0'), { kind: 'registry' });
});

test('classifies a tag as registry', () => {
    assert.deepStrictEqual(classifySpecifier('left-pad', 'latest'), { kind: 'registry' });
});

test('classifies git+https as mutable git', () => {
    assert.deepStrictEqual(classifySpecifier('react', 'git+https://github.com/our-fork/react#v18.0.0'), {
        kind: 'mutable',
        npaType: 'git'
    });
});

test('classifies git:// as mutable git', () => {
    assert.deepStrictEqual(classifySpecifier('react', 'git://github.com/our-fork/react#main'), {
        kind: 'mutable',
        npaType: 'git'
    });
});

test('classifies git+ssh:// as mutable git', () => {
    assert.deepStrictEqual(classifySpecifier('react', 'git+ssh://git@github.com/our-fork/react#main'), {
        kind: 'mutable',
        npaType: 'git'
    });
});

test('classifies an http url as mutable remote', () => {
    assert.deepStrictEqual(classifySpecifier('thing', 'https://example.test/thing.tgz'), {
        kind: 'mutable',
        npaType: 'remote'
    });
});

test('classifies a file:tarball as mutable file', () => {
    assert.deepStrictEqual(classifySpecifier('internal-tool', 'file:./vendor/internal-tool.tgz'), {
        kind: 'mutable',
        npaType: 'file'
    });
});

test('classifies a file: directory as mutable directory', () => {
    assert.deepStrictEqual(classifySpecifier('internal-tool', 'file:./vendor/internal-tool'), {
        kind: 'mutable',
        npaType: 'directory'
    });
});

test('classifies an alias of a registry version as registry', () => {
    assert.deepStrictEqual(classifySpecifier('aliased', 'npm:other-pkg@^2.0.0'), { kind: 'registry' });
});

test('classifies a non-registry alias as malformed because npa rejects it', () => {
    const result = classifySpecifier('aliased', 'npm:other-pkg@git+https://github.com/foo/bar#main');

    if (result.kind !== 'malformed') {
        assert.fail(`Expected malformed, got ${result.kind}`);
    }
    assert.match(result.reason, /aliases only work for registry deps/u);
});

test('classifies an alias of a registry tag as registry', () => {
    assert.deepStrictEqual(classifySpecifier('aliased', 'npm:other-pkg@latest'), { kind: 'registry' });
});

test('classifies workspace: protocol as malformed with the workspace reason', () => {
    assert.deepStrictEqual(classifySpecifier('shared-utils', 'workspace:*'), {
        kind: 'malformed',
        reason: 'workspace protocol is yarn/pnpm/bun-specific; resolved at install time by the workspace, not valid in a published manifest'
    });
});

test('classifies portal: protocol as malformed with the portal reason', () => {
    assert.deepStrictEqual(classifySpecifier('shared-utils', 'portal:./packages/shared'), {
        kind: 'malformed',
        reason: 'portal protocol is yarn-specific; resolved as a local symlink, not valid in a published manifest'
    });
});

test('classifies a specifier that npa cannot parse as malformed using the npa error message', () => {
    const result = classifySpecifier('shared-utils', 'whatever:~~~broken');

    if (result.kind !== 'malformed') {
        assert.fail(`Expected malformed, got ${result.kind}`);
    }
    assert.match(result.reason, /Unsupported URL Type/u);
});
