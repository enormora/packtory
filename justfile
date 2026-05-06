export PATH := './node_modules/.bin:' + env_var('PATH')

default:
    @just --list

compile:
    tsc --build

eslint *OPTIONS:
    eslint . --cache --cache-location './target/.eslintcache' --cache-strategy content --max-warnings 0 {{OPTIONS}}

eslint-fix: (eslint '--fix')

prettier *OPTIONS:
    prettier './**/*.{yml,yaml,json,md}' {{OPTIONS}}

prettier-check: (prettier '--check')

prettier-fix: (prettier '--write')

lint-dependencies:
    depcruise --config dependency-cruiser.config.js './source/**/*.ts' './integration-tests/*.ts' './integration-tests/**/*.test.ts' './*.js' './*.cjs'

lint-filename:
    ls-lint

lint-unused-code:
    knip
    knip --production

lint: eslint prettier-check lint-dependencies lint-filename lint-unused-code

lint-fix: eslint-fix prettier-fix

test: test-unit-with-coverage test-unit-property test-types test-integration

test-unit:
    mocha --config mocha.config.unit-tests.cjs

test-unit-with-coverage:
    c8 --config .c8rc.json mocha --config mocha.config.unit-tests.cjs

test-unit-property:
    mocha --config mocha.config.property-tests.cjs

test-types:
    tstyche

test-mutation:
    stryker run

test-integration:
    mocha --config mocha.config.integration-tests.cjs

benchmark:
    node --experimental-strip-types --enable-source-maps ./benchmarks/run-benchmarks.ts

publish-dry-run:
    node ./target/build/source/packages/command-line-interface/command-line-interface.entry-point.js publish
