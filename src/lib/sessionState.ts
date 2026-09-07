const dataCache = new Map<string, unknown>();
const scrollCache = new Map<string, number>();

export const sessionData = {
  get<T>(key: string): T | undefined {
    return dataCache.get(key) as T | undefined;
  },
  set(key: string, value: unknown) {
    dataCache.set(key, value);
  },
};

export const sessionScroll = {
  save(path: string) {
    scrollCache.set(path, window.scrollY);
  },
  restore(path: string) {
    const y = scrollCache.get(path);
    if (y === undefined) {
      window.scrollTo(0, 0);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
  },
  peek(path: string) {
    return scrollCache.get(path);
  },
};