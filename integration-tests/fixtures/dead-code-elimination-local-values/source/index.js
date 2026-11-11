import values from './barrel.js';

function fibonacci(value) {
    return value < 2 ? value : fibonacci(value - 1) + fibonacci(value - 2);
}

export const value = fibonacci(values.count);
