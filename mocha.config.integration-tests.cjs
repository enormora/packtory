const baseConfig = require('./mocha.config.base.cjs');

module.exports = {
    ...baseConfig,
    spec: ['./integration-tests/**/*.test.ts'],
    timeout: 15_000
};
