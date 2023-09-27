export default {
    files: ['./integration-tests/**/*.test.ts'],
    typescript: {
        rewritePaths: {
            'integration-tests/': 'target/build/integration-tests/'
        },
        compile: false
    }
};
