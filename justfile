export PATH := './node_modules/.bin:' + env_var('PATH')

default:
    @just --list

compile:
    tsc --build

eslint *OPTIONS:
    eslint . --cache --cache-location './target/.eslintcache' --cache-strategy content --max-warnings 0 {{OPTIONS}}

eslint-fix: (eslint '--fix')

lint-dependencies:
    depcruise --config dependency-cruiser.config.js './source/**/*.ts' './integration-tests/*.ts' './integration-tests/**/*.test.ts' './*.js' './*.cjs'

lint-filename:
    ls-lint

lint-unused-code:
    knip
    knip --production

lint-duplication *OPTIONS:
    jscpd source --config jscpd.json {{OPTIONS}}

lint: eslint lint-dependencies lint-filename lint-unused-code lint-duplication

lint-fix: eslint-fix

test: test-unit-with-coverage test-unit-property test-types test-integration

test-unit:
    mocha --config mocha.config.unit-tests.json

test-unit-with-coverage:
    c8 --config .c8rc.json mocha --config mocha.config.unit-tests.json

test-unit-property:
    mocha --config mocha.config.property-tests.json

test-types:
    tstyche

test-mutation:
    stryker run
    node --experimental-strip-types --enable-source-maps ./source/build-support/mutation-timeout/check-mutation-timeouts.entry-point.ts

test-mutation-incremental *ARGS:
    stryker run --incremental {{ARGS}}

test-integration:
    mocha --config mocha.config.integration-tests.json

benchmark:
    node --experimental-strip-types --enable-source-maps ./benchmarks/run-benchmarks.ts

publish-dry-run:
    packtory publish
