import type { LoadFn } from 'dldr';
import { identify } from 'object-identity';

type Task<T> = {
	p: Promise<T>;
	s(v: T): void;
	r(e: Error): void;
};

type Batch<T, K> = Map<string, [key: K, task: Task<T>]>;

let batchContainer = new WeakMap<LoadFn<any, any>, Batch<any, any>>();

export function load<T, K = string>(
	loadFn: LoadFn<T, K>,
	key: K,
	identity?: string | undefined,
): Promise<T> {
	let batch = batchContainer.get(loadFn);

	if (!batch) {
		batchContainer.set(loadFn, (batch = new Map()));

		queueMicrotask(function () {
			batchContainer.delete(loadFn);

			let tasks: Task<T>[] = [];
			let keys: K[] = [];
			let tmp;
			for (tmp of batch!.values()) keys.push(tmp[0]), tasks.push(tmp[1]);

			loadFn(keys).then(function (values) {
				if (values.length !== tasks.length)
					return reject(new Error('loader value length mismatch'));

				let i = values.length;
				for (
					;
					(tmp = values[--i]), i >= 0;
					tmp instanceof Error ? tasks[i].r(tmp) : tasks[i].s(tmp)
				);
			}, reject);

			function reject(error: Error) {
				for (let task of tasks) task.r(error);
			}
		});
	}

	identity ||= identify(key);
	let b = batch.get(identity);
	let p: Task<T>;
	if (!b) batch.set(identity, [key, (p = {} as Task<T>)]);
	else return b[1].p;

	return (p.p = new Promise<T>(function (resolve, reject) {
		p.s = resolve;
		p.r = reject;
	}));
}
