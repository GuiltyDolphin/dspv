import {
    flatten,
    groupingStartAndEnd,
    Nested,
    NestMap,
    NonEmpty,
    SafeNested,
} from '../src/util.ts';

import {
    Maybe
} from '../src/functional.ts';

import {
    assertEquals,
    assertThrows,
    Test,
    testGroup,
} from './deps.ts';

function testSetAndGetWithMap<K, V>(description: string, map: NestMap<K, V>, path: NonEmpty<K>, value: V): Test {
    return new Test(description, () => {
        assertEquals(map.set(path, value).get(path), Maybe.some(value));
    });
}

function testSetAndGet<K, V>(description: string, path: NonEmpty<K>, value: V): Test {
    return testSetAndGetWithMap(description, new NestMap<K, V>(), path, value);
}

function testGetBase<K, V>(description: string, map: NestMap<K, V>, path: NonEmpty<K>, expected: Maybe<V>): Test {
    return new Test(description, () => {
        assertEquals(map.get(path), expected);
    });
}

function testGet<K, V>(description: string, map: NestMap<K, V>, path: NonEmpty<K>, expected: V): Test {
    return testGetBase(description, map, path, Maybe.some(expected));
}

function testGetNotThere<K, V>(description: string, map: NestMap<K, V>, path: NonEmpty<K>): Test {
    return testGetBase(description, map, path, Maybe.none());
}

function testGetBestAndRestWithPathBase<K, V>(description: string, map: NestMap<K, V>, path: NonEmpty<K>, expected: Maybe<[[K, ...K[]], V, K[]]>): Test {
    return new Test(description, () => {
        assertEquals(map.getBestAndRestWithPath(path), expected);
    });
}

function testGetBestAndRestBase<K, V>(description: string, map: NestMap<K, V>, path: NonEmpty<K>, expected: Maybe<[V, K[]]>): Test {
    return new Test(description, () => {
        assertEquals(map.getBestAndRest(path), expected);
    });
}

function testGetBestAndRestWithPath<K, V>(description: string, map: NestMap<K, V>, path: NonEmpty<K>, expected: [NonEmpty<K>, V, K[]]): Test {
    return testGetBestAndRestWithPathBase(description, map, path, Maybe.some(expected));
}

function testGetBestAndRest<K, V>(description: string, map: NestMap<K, V>, path: NonEmpty<K>, expected: [V, K[]]): Test {
    return testGetBestAndRestBase(description, map, path, Maybe.some(expected));
}

function testGetBestAndRestNotThere<K, V>(description: string, map: NestMap<K, V>, path: NonEmpty<K>): Test {
    return testGetBestAndRestBase(description, map, path, Maybe.none());
}

function testSplitBasedOnGrouping<T>(description: string, grouped: SafeNested<T>, prefix: T[], suffix: T[], expectedPrefix: Nested<T>, expectedSuffix: Nested<T>): Test {
    return new Test(description, () => {
        const [actualPrefix, actualSuffix] = groupingStartAndEnd(grouped, prefix, suffix);
        assertEquals(actualPrefix, expectedPrefix);
        assertEquals(actualSuffix, expectedSuffix);
    });
}

function testSplitBasedOnGroupingFails<T>(description: string, grouped: SafeNested<T>, prefix: T[], suffix: T[]): Test {
    return new Test(description, () => {
        assertThrows(() => groupingStartAndEnd(grouped, prefix, suffix), TypeError);
    });
}

function testFlatten<T>(description: string, unflattened: Nested<T>, expected: T[]): Test {
    return new Test(description, () => {
        assertEquals(flatten(unflattened), expected);
    });
}

const m0 = new NestMap<string, number>();
const m1 = new NestMap<string, number>();
const m2 = new NestMap<string, number>();

m0.set(["k1"], 1);
m1.set(["k1"], 1);
m1.set(["k1", "k2"], 2);
m2.set(["k1", "k2"], 2);

testGroup('flatten',
    testFlatten("[]", [], []),
    testFlatten("[1234]", [1, 2, 3, 4], [1, 2, 3, 4]),
    testFlatten("[1,[2,[3,[4]]]]", [1, [2, [3, [4]]]], [1, 2, 3, 4]),
    testFlatten("[[[[1],2],3,],4]", [[[[1], 2], 3], 4], [1, 2, 3, 4]),
    testFlatten("[[1], [[[[2], [3]]]], 4]", [[1], [[[[2], [3]]]], 4], [1, 2, 3, 4]),
).runAsMain();

testGroup("list grouping",
    testGroup("with key grouping",
        testGroup("bad calls",
            testSplitBasedOnGroupingFails("[1234] with [123] and []", [1, 2, 3, 4], [1, 2, 3], []),
            testSplitBasedOnGroupingFails("[1234] with [1234] and [5]", [1, 2, 3, 4], [1, 2, 3, 4], [5]),
            testSplitBasedOnGroupingFails("[1234] with [123] and [45]", [1, 2, 3, 4], [1, 2, 3], [4, 5]),
            testSplitBasedOnGroupingFails("[1[2[3]]4] with [123] and [45]", [1, [2, [3]], 4], [1, 2, 3], [4, 5]),
        ),
        testGroup("no grouping",
            testSplitBasedOnGrouping("[1234|] -> [1234]|[]", [1, 2, 3, 4], [1, 2, 3, 4], [], [1, 2, 3, 4], []),
            testSplitBasedOnGrouping("[1234|56] -> [1234]|[56]", [1, 2, 3, 4, 5, 6], [1, 2, 3, 4], [5, 6], [1, 2, 3, 4], [5, 6]),
        ),
        testGroup("left grouping",
            testSplitBasedOnGrouping("[[[12]3]4]| -> [[[12]3]4]|[]", [[[1, 2], 3], 4], [1, 2, 3, 4], [], [[[1, 2], 3], 4], []),
            testSplitBasedOnGrouping("[[12]3]4|[56]] -> [[[12]3]4]|[56]", [[[1, 2], 3], 4, [5, 6]], [1, 2, 3, 4], [5, 6], [[[1, 2], 3], 4], [[5, 6]]),
            testSplitBasedOnGrouping("[[12]3][4|56]] -> [[[12]3][4]]|[56]", [[[1, 2], 3], [4, 5, 6]], [1, 2, 3, 4], [5, 6], [[[1, 2], 3], [4]], [[5, 6]]),
            testSplitBasedOnGrouping("[[12]3][4|5]6] -> [[[12]3][4]]|[[5]6]", [[[1, 2], 3], [4, 5], 6], [1, 2, 3, 4], [5, 6], [[[1, 2], 3], [4]], [[5], 6]),
        ),
        testGroup("right grouping",
            testSplitBasedOnGrouping("[1[2[3]]|4] -> [1[2[3]]] and [4]", [1, [2, [3]], 4], [1, 2, 3], [4], [1, [2, [3]]], [4]),
            testSplitBasedOnGrouping("[[1[23]][4|[5]]6] -> [[[1[23]][4]]|[[[5]]6]", [[1, [2, 3]], [4, [5]], 6], [1, 2, 3, 4], [5, 6], [[1, [2, 3]], [4]], [[[5]], 6]),
        ),
    ),
).runAsMain();

testGroup("NestMap",
    testGroup("set and get",
        testSetAndGet("path length 1", ["k"], 1),
        testSetAndGet("path length 3", ["k1", "k2", "k3"], 1),
    ),

    testGroup("get",
        testGroup("top level key",
            testGet("when there are no subkeys under this key", m0, ["k1"], 1),
            testGet("when there are subkeys under this key", m1, ["k1"], 1),
            testGetNotThere("that doesn't exist", m0, ["k"]),
        ),
        testGroup("subkey",
            testGet("when there are higher keys", m1, ["k1", "k2"], 2),
            testGet("when there are no higher keys", m2, ["k1", "k2"], 2),
            testGetNotThere("that doesn't exist when toplevel key exists", m1, ["k1", "k3"]),
        ),
    ),

    testGroup("getBestAndRestWithPath",
        testGroup("top level key",
            testGetBestAndRestWithPath("when there are no subkeys under this key", m0, ["k1"], [["k1"], 1, []]),
            testGetBestAndRestWithPath("when there are subkeys under this key", m1, ["k1"], [["k1"], 1, []]),
            testGetBestAndRestWithPath("when there are no subsequent keys", m0, ["k1", "k2"], [["k1"], 1, ["k2"]]),
        ),
        testGroup("subkey",
            testGetBestAndRestWithPath("when there are higher keys", m1, ["k1", "k2"], [["k1", "k2"], 2, []]),
            testGetBestAndRestWithPath("when there are no higher keys", m2, ["k1", "k2"], [["k1", "k2"], 2, []]),
            testGetBestAndRestWithPath("when there are no subsquent keys", m2, ["k1", "k2", "k3"], [["k1", "k2"], 2, ["k3"]]),
        ),
    ),

    testGroup("getBestAndRest",
        testGroup("top level key",
            testGetBestAndRest("when there are no subkeys under this key", m0, ["k1"], [1, []]),
            testGetBestAndRest("when there are subkeys under this key", m1, ["k1"], [1, []]),
            testGetBestAndRest("when there are no subsequent keys", m0, ["k1", "k2"], [1, ["k2"]]),
        ),
        testGroup("subkey",
            testGetBestAndRest("when there are higher keys", m1, ["k1", "k2"], [2, []]),
            testGetBestAndRest("when there are no higher keys", m2, ["k1", "k2"], [2, []]),
            testGetBestAndRest("when there are no subsquent keys", m2, ["k1", "k2", "k3"], [2, ["k3"]]),
            testGetBestAndRestNotThere("top level key that doesn't exist", m0, ["k"]),
            testGetBestAndRestNotThere("that doesn't exist when toplevel key exists", m1, ["k1", "k3"]),
        ),
    ),
).runAsMain();
