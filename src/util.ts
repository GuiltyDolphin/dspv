import { Either, Maybe } from './functional.ts';

function isNonEmptyArray<T>(x: T[]): x is [T, ...T[]] {
    return x.length > 0;
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

    private setThere([k, ...ks]: [K, ...K[]], v: V): NestMap<K, V> {
        if (isNonEmptyArray(ks)) {
            this.getHereOrCreate(k).setThere(ks, v);
        } else {
            this.setHere(k, v);
        }
        return this;
    }

    get([k, ...ks]: [K, ...K[]]): Maybe<V> {
        return this.getHere(k).maybe(Maybe.none(),
            v => {
                if (isNonEmptyArray(ks)) {
                    return v.either(_ => Maybe.none(), r => r.either(l => l.get(ks), r => r[1].get(ks)));
                } else {
                    return v.either(l => Maybe.some(l), r => r.either(_ => Maybe.none(), r => Maybe.some(r[0])));
                }
            });
    }

    getBestAndRest([k, ...ks]: [K, ...K[]]): Maybe<[V, K[]]> {
        return Maybe.join(this.getHere(k).map(lr => lr.either(l => Maybe.some([l, ks]), r => {
            if (isNonEmptyArray(ks)) {
                return r.either(l => l.getBestAndRest(ks), r => r[1].getBestAndRest(ks));
            }
            return r.either(l => Maybe.none(), rr => Maybe.some([rr[0], []]));
        })));
    }

    getBestAndRestWithPath(ks: [K, ...K[]]): Maybe<[[K, ...K[]], V, K[]]> {
        return this.getBestAndRest(ks).map(x => [ks.slice(0, ks.length - x[1].length) as [K, ...K[]], x[0], x[1]]);
    }

    set([k, ...ks]: [K, ...K[]], v: V): NestMap<K, V> {
        return this.setThere([k, ...ks], v);
    }

    private traverseR<S>(path: [K, ...K[]], start: S, f: (acc: S, ks: [K, ...K[]], v: V) => S): S {
        for (const [k, v] of this.map) {
            v.either((l: V) => f(start, [...path, k], l), (r: Either<NestMap<K, V>, [V, NestMap<K, V>]>) => r.either(l => l.traverseR([...path, k], start, f),
                rr => {
                    let res = f(start, [...path, k], rr[0]);
                    return rr[1].traverseR([...path, k], res, f);
                }));
        }
        return start;
    }

    private traverse<S>(start: S, f: (acc: S, ks: [K, ...K[]], v: V) => S): S {
        for (const [k, v] of this.map) {
            v.either((l: V) => f(start, [k], l), (r: Either<NestMap<K, V>, [V, NestMap<K, V>]>) => r.either(l => l.traverseR([k], start, f),
                rr => {
                    let res = f(start, [k], rr[0]);
                    return rr[1].traverseR([k], res, f);
                }));
        }
        return start;
    }

    mergeWith(m: NestMap<K, V>): NestMap<K, V> {
        return m.traverse(this, (acc, p, v) => { acc.set(p, v); return acc });
    }
}
