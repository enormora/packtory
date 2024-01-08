import test from 'ava';
import { string, filter, identifier, title, description } from '@effect/schema/Schema';
import { checkValidationFailure } from '../../test-libraries/verify-schema-validation.js';

test('formats anonymous refinements correctly', checkValidationFailure, {
    schema: string.pipe(
        filter((value) => {
            return value === 'foo';
        })
    ),
    data: 'bar',
    expectedMessages: ['Expected <anonymous refinement schema>; but got string']
});

test('formats anonymous refinements correctly when they have an id', checkValidationFailure, {
    schema: string
        .pipe(
            filter((value) => {
                return value === 'foo';
            })
        )
        .pipe(identifier('MyId')),
    data: 'bar',
    expectedMessages: ['Expected MyId; but got string']
});

test('formats anonymous refinements correctly when they have a title', checkValidationFailure, {
    schema: string
        .pipe(
            filter((value) => {
                return value === 'foo';
            })
        )
        .pipe(title('MyTitle')),
    data: 'bar',
    expectedMessages: ['Expected MyTitle; but got string']
});

test('formats anonymous refinements correctly when they have a description', checkValidationFailure, {
    schema: string
        .pipe(
            filter((value) => {
                return value === 'foo';
            })
        )
        .pipe(description('MyDescription')),
    data: 'bar',
    expectedMessages: ['Expected MyDescription; but got string']
});

test('formats anonymous refinements correctly when they have a description and title', checkValidationFailure, {
    schema: string
        .pipe(
            filter((value) => {
                return value === 'foo';
            })
        )
        .pipe(description('MyDescription'), title('MyTitle')),
    data: 'bar',
    expectedMessages: ['Expected MyTitle; but got string']
});

test('formats anonymous refinements correctly when they have a description, title and id', checkValidationFailure, {
    schema: string
        .pipe(
            filter((value) => {
                return value === 'foo';
            })
        )
        .pipe(description('MyDescription'), title('MyTitle'), identifier('MyId')),
    data: 'bar',
    expectedMessages: ['Expected MyId; but got string']
});
