import { suite, test } from 'mocha';
import { assertSingleFileCallReduction } from '../test-libraries/dead-code-elimination-single-file-case.ts';

suite('function-local variable evaluation', function () {
    for (
        const body of [
            'var value=42;return value;',
            'var sum=0;for(var index=0;index<3;index++)sum+=index;return sum;',
            'value=42;var value;return value;',
            'if(false){var value=1;}return value;',
            '{var value=42;}return value;',
            'var value;{value=42;}return value;',
            ';var value=42;;return value;',
            'do{}while(false);return 42;',
            'var initial=value;var value=42;return initial;'
        ]
    ) {
        test(`folds ${body}`, async function () {
            await assertSingleFileCallReduction({
                content: `function compute(){${body}}export function probe(){return compute();}`,
                targetFilePath: 'index.js',
                callee: 'compute',
                remainingCalls: 0
            });
        });
    }

    for (
        const [ parameters, body, argument ] of [
            [ '', 'var arguments;return arguments[0];', '42' ],
            [ 'value', 'var value;return value;', '42' ],
            [ '', 'var value=1;var value;return value;', '' ],
            [ '', 'return value;{let value=42;}', '' ],
            [ '', 'return value;function nested(){var value=42;}', '' ],
            [ '', 'class Local{static{var value=42;}}return value;', '' ],
            [ '', 'var {value}={get value(){console.log("read");return 42;}};return value;', '' ],
            [ '', 'var value=console.log("effect");return value;', '' ]
        ]
    ) {
        test(`retains unproven scope or effects in ${body}`, async function () {
            await assertSingleFileCallReduction({
                content:
                    `function compute(${parameters}){${body}}export function probe(){return compute(${argument});}`,
                targetFilePath: 'index.js',
                callee: 'compute',
                remainingCalls: 1
            });
        });
    }
});
