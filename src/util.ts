import { Either, Maybe } from './functional.ts';

type IsNot<S, T> = T extends S ? never : T

type NotArray<T> = IsNot<Array<any>, T>

/** A list whose elements may be arbitrarily nested. */
export type Nested<T> = (T | Nested<T>)[]

/**
 * A list whose elements may be arbitrarily nested.
 *
 * The type of elements cannot itself be a list.
 */
export type SafeNested<T extends NotArray<any>> = Nested<T>

/** A non-empty list. */
export type NonEmpty<T> = [T, ...T[]]

function isNonEmptyArray<T>(x: T[]): x is NonEmpty<T> {
    return x.length > 0;
}

/** A non-empty list whose elements may themselves be nested, non-empty lists. */
export type NonEmptyNested<T> = [T | NonEmptyNested<T>, ...(T | NonEmptyNested<T>)[]]

/**
 * A non-empty list whose elements may themselves be nested, non-empty lists.
 *
 * The type of elements cannot itself be a list.
 */
export type SafeNonEmptyNested<T extends NotArray<any>> = NonEmptyNested<T>

function _flatten<T>(arr: SafeNested<T>, result: T[]): void {
    for (let i = 0; i < arr.length; i++) {
        const value = arr[i];
        Array.isArray(value) ? _flatten(value, result) : result.push(value);
    }
};

/** Flatten a list of nested lists into a single flat list. */
export function flatten<T>(arr: SafeNested<T>): T[] {
    const res: T[] = [];
    _flatten(arr, res);
    return res;
};

/** Flatten a list of non-empty, nested lists into a single flat non-empty list. */
export function flattenNonEmpty<T>(xs: SafeNonEmptyNested<T>): NonEmpty<T> {
    return flatten(xs) as NonEmpty<T>;
}

/** Essentially an AST for a list (without element values). */
type listAction = ["openParen", number] | "elem" | ["closeParen", number]

/**
 * Parse a nested list into a list of actions that describe how to
 * build a list of the same shape.
 */
function nestedActions<T>(xs: SafeNested<T>, paren: number = 0): listAction[] {
    const res: listAction[] = new Array();
    for (let i = 0; i < xs.length; i++) {
        const curr = xs[i];
        if (curr instanceof Array) {
            res.push(["openParen", paren]);
            res.push(...nestedActions(curr, paren + 1));
            res.push(["closeParen", paren]);
        } else {
            res.push("elem");
        }
    }
    return res;
}

function groupingFromStartAsBestYouCan<T>(actions: (listAction | 'skip')[], xs: T[]): Nested<T> {
    const xsRest = Array.from(xs);
    const actionsRest = Array.from(actions);
    const res: Nested<T> = new Array();
    while (true) {
        if (actionsRest.length === 0 || xsRest.length === 0) {
            break;
        }
        const action = actionsRest.shift() as listAction | 'skip';
        if (action === 'skip') {
            xsRest.shift();
        } else if (action === 'elem') {
            res.push(xsRest.shift() as T);
        } else if (action[0] === 'openParen') {
            // now handle everything until the closing paren
            const closingIndex = actionsRest.findIndex(c => c[0] === 'closeParen' && c[1] === action[1]);
            const actionsInner = actionsRest.splice(0, closingIndex);
            const xsInner = xsRest.splice(0, actionsInner.filter(c => c === 'elem' || c === 'skip').length);
            res.push(groupingFromStartAsBestYouCan(actionsInner, xsInner));
        } else if (action[0] === 'closeParen') {
            // already handled by recursion
            continue;
        }
    }
    return res;
}

function killEmpties<T>(xs: SafeNested<T>): (T | SafeNonEmptyNested<T>)[] {
    if (xs.length === 0) {
        return [];
    }
    const res: (T | SafeNonEmptyNested<T>)[] = new Array();
    for (let i = 0; i < xs.length; i++) {
        const e = xs[i];
        if (e instanceof Array) {
            const inner = killEmpties(e);
            if (isNonEmptyArray(inner)) {
                res.push(inner);
            }
        } else {
            res.push(e);
        }
    }
    return res;
}

function skipFirstN(actions: listAction[], n: number): (listAction | 'skip')[] {
    const res = Array.from(actions);
    return res.map(s => {
        if (s === 'elem' && n > 0) {
            n--;
            return 'skip';
        }
        return s;
    });
}

/**
 * Using the first list as a template to determine how items should be
 * grouped, group the first and second lists such that they represent
 * a version of the first list split in twain.
 *
 * Precondition: the number of actual elements of prefix + suffix must
 * match the number of elements in the grouped version.
 *
 * Postcondition: <pre><code>flatten(groupedVersion) = flatten(groupingStartAndEnd(groupedVersion, X, Y))</code></pre>
 */
export function groupingStartAndEnd<T extends NotArray<any>>(groupedVersion: SafeNested<T>, prefix: T[], suffix: T[]): [Nested<T>, Nested<T>] {
    const actions = nestedActions(groupedVersion);
    if (prefix.length + suffix.length !== actions.filter(c => c === 'elem').length) {
        throw new TypeError('number of elements in prefix + suffix is not the same as the number of grouped elements');
    }
    const skipLen = actions.filter(m => m === 'elem').length - suffix.length;
    const withSkips: (undefined | T)[] = [...Array(skipLen), ...suffix];
    const prefixGrouped = groupingFromStartAsBestYouCan(actions, prefix);
    const suffixGrouped = killEmpties(groupingFromStartAsBestYouCan(skipFirstN(actions, skipLen), withSkips) as Nested<T>);
    return [prefixGrouped, suffixGrouped]
}

type AtLeastOneOf<T1, T2> = Either<T1, Either<T2, [T1, T2]>>;

function atLeastOneOfFirst<T1, T2>(x: T1): AtLeastOneOf<T1, T2> {
    return Either.left(x);
}

function atLeastOneOfSecond<T1, T2>(x: T2): AtLeastOneOf<T1, T2> {
    return Either.right(Either.left(x));
}

function atLeastOneOfBoth<T1, T2>(x1: T1, x2: T2): AtLeastOneOf<T1, T2> {
    return Either.right(Either.right([x1, x2]));
}

type NestMapMap<K, V> = Map<K, AtLeastOneOf<V, NestMap<K, V>>>;

export class NestMap<K, V> {
    private map: NestMapMap<K, V>;

    constructor() {
        this.map = new Map();
    }

    private setHere(k: K, v: V): NestMap<K, V> {
        const here = this.map.get(k);
        if (here === undefined) {
            this.map.set(k, atLeastOneOfFirst(v));
        } else {
            this.map.set(k, here.either(_ => atLeastOneOfFirst(v), r => r.either(n => atLeastOneOfBoth(v, n), ([_, r]: [V, NestMap<K, V>]) => atLeastOneOfBoth(v, r))));
        }
        return this;
    }

    private setHereMap(k: K, m: NestMap<K, V>): NestMap<K, V> {
        const here = this.map.get(k);
        if (here === undefined) {
            this.map.set(k, atLeastOneOfSecond(m));
        } else {
            this.map.set(k, here.either(v => atLeastOneOfBoth(v, m), r => r.either(_ => atLeastOneOfSecond(m), ([v, _]: [V, NestMap<K, V>]) => atLeastOneOfBoth(v, m))));
        }
        return this;
    }

    private setHereBoth(k: K, v: V, m: NestMap<K, V>): NestMap<K, V> {
        const here = this.map.get(k);
        if (here === undefined) {
            this.map.set(k, atLeastOneOfBoth(v, m));
        } else {
            this.map.set(k, here.either(_ => atLeastOneOfBoth(v, m), r => r.either(_ => atLeastOneOfBoth(v, m), (_: [V, NestMap<K, V>]) => atLeastOneOfBoth(v, m))));
        }
        return this;
    }

    private getHere(k: K): Maybe<AtLeastOneOf<V, NestMap<K, V>>> {
        const res = this.map.get(k);
        return res === undefined ? Maybe.none() : Maybe.some(res);
    }

    private getHereOrCreate(k: K): NestMap<K, V> {
        const res = this.getHere(k);
        const newMap = new NestMap<K, V>();
        return res.maybef(() => {
            this.setHereMap(k, newMap);
            return newMap;
        }, (v: AtLeastOneOf<V, NestMap<K, V>>) => {
            return v.either((v: V) => {
                this.setHereBoth(k, v, newMap)
                return newMap;
            }, (r: Either<NestMap<K, V>, [V, NestMap<K, V>]>) => r.either(l => l, r2 => r2[1]));
        });
    }

    private setThere([k, ...ks]: NonEmpty<K>, v: V): NestMap<K, V> {
        if (isNonEmptyArray(ks)) {
            this.getHereOrCreate(k).setThere(ks, v);
        } else {
            this.setHere(k, v);
        }
        return this;
    }

    get([k, ...ks]: NonEmpty<K>): Maybe<V> {
        return this.getHere(k).maybe(Maybe.none(),
            v => {
                if (isNonEmptyArray(ks)) {
                    return v.either(_ => Maybe.none(), r => r.either(l => l.get(ks), r => r[1].get(ks)));
                } else {
                    return v.either(l => Maybe.some(l), r => r.either(_ => Maybe.none(), r => Maybe.some(r[0])));
                }
            });
    }

    getBestAndRest([k, ...ks]: NonEmpty<K>): Maybe<[V, K[]]> {
        return Maybe.join(this.getHere(k).map(lr => lr.either(l => Maybe.some([l, ks]), r => {
            if (isNonEmptyArray(ks)) {
                return r.either(l => l.getBestAndRest(ks), r => r[1].getBestAndRest(ks));
            }
            return r.either(_ => Maybe.none(), rr => Maybe.some([rr[0], []]));
        })));
    }

    getBestAndRestWithPath(ks: NonEmpty<K>): Maybe<[NonEmpty<K>, V, K[]]> {
        return this.getBestAndRest(ks).map(x => [ks.slice(0, ks.length - x[1].length) as NonEmpty<K>, x[0], x[1]]);
    }

    set([k, ...ks]: NonEmpty<K>, v: V): NestMap<K, V> {
        return this.setThere([k, ...ks], v);
    }

    private traverseR<S>(path: NonEmpty<K>, start: S, f: (acc: S, ks: NonEmpty<K>, v: V) => S): S {
        for (const [k, v] of this.map) {
            v.either((l: V) => f(start, [...path, k], l), (r: Either<NestMap<K, V>, [V, NestMap<K, V>]>) => r.either(l => l.traverseR([...path, k], start, f),
                rr => {
                    const res = f(start, [...path, k], rr[0]);
                    return rr[1].traverseR([...path, k], res, f);
                }));
        }
        return start;
    }

    private traverse<S>(start: S, f: (acc: S, ks: NonEmpty<K>, v: V) => S): S {
        for (const [k, v] of this.map) {
            v.either((l: V) => f(start, [k], l), (r: Either<NestMap<K, V>, [V, NestMap<K, V>]>) => r.either(l => l.traverseR([k], start, f),
                rr => {
                    const res = f(start, [k], rr[0]);
                    return rr[1].traverseR([k], res, f);
                }));
        }
        return start;
    }

    mergeWith(m: NestMap<K, V>): NestMap<K, V> {
        return m.traverse(this, (acc, p, v) => { acc.set(p, v); return acc });
    }
}
