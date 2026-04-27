module.exports = {
    diff: true,
    'forbid-pending': true,
    extension: ['ts'],
    spec: [],
    exclude: [],
    jobs: 1,
    parallel: false,
    reporter: 'dot',
    slow: 75,
    timeout: 2000,
    ui: 'tdd',
    'node-option': ['experimental-strip-types', 'enable-source-maps']
};
