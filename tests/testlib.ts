type InnerTest = (topDesc: string) => void;

interface Testable {
    /** Run the test as a subtest of another test. */
    runAsInner: InnerTest;

    /** Run the test as a top-level test. */
    runAsMain: () => void;
}

export class Test implements Testable {
    description: string;
    runner: () => void;

    constructor(description: string, runner: () => void) {
        this.description = description;
        this.runner = runner;
    }

    runAsInner(topDesc: string) {
        Deno.test(`${topDesc}, ${this.description}`, this.runner);
    }

    runAsMain() {
        Deno.test(`${this.description}`, this.runner);
    }
}

class TestGroup implements Testable {
    private namePart: string;

    private tests: Testable[];

    constructor(namePart: string, ...tests: Testable[]) {
        this.namePart = namePart;
        this.tests = tests;
    }

    runAsInner(topDesc: string) {
        this.tests.map(t => t.runAsInner(`${topDesc}, ${this.namePart}`));
    }

    runAsMain() {
        this.tests.map(t => t.runAsInner(`${this.namePart}`));
    }
}

export function testGroup(topDesc: string, ...tests: Testable[]): TestGroup {
    return new TestGroup(topDesc, ...tests);
}
