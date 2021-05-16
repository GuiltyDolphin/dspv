import {
    NestMap,
} from '../src/util.ts';

import {
    Maybe
} from '../src/functional.ts';

import {
    assertEquals,
    Test,
    testGroup,
} from './deps.ts';

type NonEmpty<T> = [T, ...T[]];

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

function testGetBestAndRestWithPath<K, V>(description: string, map: NestMap<K, V>, path: NonEmpty<K>, expected: [[K, ...K[]], V, K[]]): Test {
    return testGetBestAndRestWithPathBase(description, map, path, Maybe.some(expected));
}

function testGetBestAndRest<K, V>(description: string, map: NestMap<K, V>, path: NonEmpty<K>, expected: [V, K[]]): Test {
    return testGetBestAndRestBase(description, map, path, Maybe.some(expected));
}

function testGetBestAndRestNotThere<K, V>(description: string, map: NestMap<K, V>, path: NonEmpty<K>): Test {
    return testGetBestAndRestBase(description, map, path, Maybe.none());
}

const m0 = new NestMap<string, number>();
const m1 = new NestMap<string, number>();
const m2 = new NestMap<string, number>();

m0.set(["k1"], 1);
m1.set(["k1"], 1);
m1.set(["k1", "k2"], 2);
m2.set(["k1", "k2"], 2);

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
