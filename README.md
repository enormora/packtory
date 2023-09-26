# Fancy Name

Programmatically describe, bundle and publish your NPM packages and unleash endless possibility to organize your code without the need to care about manual dependency linking/management/foo.

## About

Do you like monorepos?
But you hate to follow strict conventions or to squeeze your code into workspaces?
You want the monorepo to be as easily maintainable as one big fat codebase and just referencing to local files?
You think semver is not worth the effort and tread every version as potentially breaking?

No more workspaces!
No more package linking?
No more `.npmignore`!
Ship only those files which are neccessary (e.g. no CI config files or test files).
Automatic versioning.

Then this solution could be helpful for you.

## Concept

## Example

-   example 1: image-resizer-lib & image-resizer-cli (this needs bin entrypoints)
-   example 2: awesome-logger-adapter, awesome-logger, awesome-logger-adapter-awesome-target

Minimal package:

-   no published devDependencies
-   no unnecessary files (e.g. ci configs)
