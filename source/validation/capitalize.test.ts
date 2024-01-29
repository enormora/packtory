import test from 'ava';
import { capitalize } from './capitalize.js';

test('returns an empty string when an empty string is given', (t) => {
    t.is(capitalize(''), '');
});

test('returns the string unchanged when the first letter is already a capital letter', (t) => {
    t.is(capitalize('Foo'), 'Foo');
});

test('changes the first letter to uppercase when it is lower case', (t) => {
    t.is(capitalize('foo'), 'Foo');
});

test('changes the first letter to uppercase when there is only a single lower case letter', (t) => {
    t.is(capitalize('f'), 'F');
});

test('doesn’t change symbols with no uppercase version', (t) => {
    t.is(capitalize('123'), '123');
});

test('changes special symbols like ß correctly', (t) => {
    t.is(capitalize('ßoo'), 'SSoo');
});

test('changes the first letter to uppercase when it is lower case and a unicode surrogate pair that has an uppercase letter', (t) => {
    t.is(capitalize('𐐨e'), '𐐀e');
});

test('doesn’t change surrogate pair symbols that don’t have an uppercase version', (t) => {
    t.is(capitalize('🦩oo'), '🦩oo');
});
