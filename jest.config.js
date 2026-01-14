const config = {
    preset: "ts-jest/presets/default-esm",
    testEnvironment: "node",
    extensionsToTreatAsEsm: [".ts"],
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
    },
    transform: {
        "^.+\\.ts$": [
            "ts-jest",
            {
                useESM: true,
                tsconfig: {
                    module: "nodenext",
                    moduleResolution: "nodenext",
                },
            },
        ],
    },
    testMatch: ["**/__tests__/**/*.test.ts", "**/?(*.)+(spec|test).ts"],
    collectCoverageFrom: [
        "src/**/*.ts",
        "!src/**/*.d.ts",
        "!src/index.ts",
        "!src/database/config.ts",
        "!src/database/config.cjs",
    ],
    coverageDirectory: "coverage",
    coverageReporters: ["text", "lcov", "html"],
    setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
    testTimeout: 30000,
    verbose: true,
    transformIgnorePatterns: [],
    globals: {
        "ts-jest": {
            useESM: true,
        },
    },
};
export default config;
//# sourceMappingURL=jest.config.js.map