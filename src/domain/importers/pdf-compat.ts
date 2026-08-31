type PromiseResolvers<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

type PromiseConstructorWithResolvers = PromiseConstructor & {
  withResolvers?: <T>() => PromiseResolvers<T>;
};

export function installPdfCompatibility(): void {
  const promiseConstructor = Promise as PromiseConstructorWithResolvers;
  if (!promiseConstructor.withResolvers) {
    promiseConstructor.withResolvers = <T>() => {
      let resolve!: PromiseResolvers<T>["resolve"];
      let reject!: PromiseResolvers<T>["reject"];
      const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      return { promise, resolve, reject };
    };
  }

  const readablePrototype = typeof ReadableStream === "undefined" ? undefined : ReadableStream.prototype as ReadableStream<unknown> & { [Symbol.asyncIterator]?: unknown };
  if (readablePrototype && typeof readablePrototype[Symbol.asyncIterator] !== "function") {
    Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
      configurable: true,
      writable: true,
      value: async function* <T>(this: ReadableStream<T>): AsyncGenerator<T, void, unknown> {
        const reader = this.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) return;
            yield value;
          }
        } finally {
          reader.releaseLock();
        }
      },
    });
  }
}
