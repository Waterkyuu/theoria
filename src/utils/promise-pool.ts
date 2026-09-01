const DEFAULT_CONCURRENCY = 4;
const DEFAULT_RETRY_COUNT = 1;
const MAX_CONCURRENCY = 6;

/**
 * Runs items through an async worker with a default concurrency of four and a
 * hard maximum of six, while preserving the input order of the results.
 *
 * @example
 * const results = await promisePool(urls, (url) => fetch(url), 4);
 */
const promisePool = async <Item, Result>(
	items: readonly Item[],
	worker: (item: Item, index: number) => Promise<Result>,
	concurrency = DEFAULT_CONCURRENCY,
): Promise<Result[]> => {
	const results = new Array<Result>(items.length);
	const requestedConcurrency = Number.isFinite(concurrency)
		? Math.floor(concurrency)
		: DEFAULT_CONCURRENCY;
	const workerCount = Math.min(
		Math.max(requestedConcurrency, 1),
		MAX_CONCURRENCY,
		items.length,
	);
	let nextItemIndex = 0;

	/**
	 * Shares the queue cursor across workers so each completed slot immediately
	 * claims the next item; retries remain in the same slot and cannot exceed the cap.
	 */
	const runQueuedItems = async () => {
		while (nextItemIndex < items.length) {
			const itemIndex = nextItemIndex;
			nextItemIndex += 1;
			let retryCount = 0;

			while (true) {
				try {
					results[itemIndex] = await worker(items[itemIndex], itemIndex);
					break;
				} catch (error) {
					if (retryCount >= DEFAULT_RETRY_COUNT) {
						throw error;
					}
					retryCount += 1;
				}
			}
		}
	};

	const workers = Array.from({ length: workerCount }, () => runQueuedItems());

	await Promise.all(workers);
	return results;
};

export { promisePool };
