import { Promisable } from '~common';

export class CacheMachine {
  private map = new Map<string, any>();

  public async call<T>(
    keyFn: () => Promisable<string>,
    callbackFn: () => Promisable<T>,
    timeOut?: number,
  ): Promise<T> {
    const key = await keyFn();
    if (this.map.has(key)) {
      return this.map.get(key);
    }

    const result = await callbackFn();
    this.map.set(key, result);

    if (timeOut) {
      setTimeout(() => {
        if (!this.map.has(key)) {
          return;
        }

        this.map.delete(key);
        // console.log(`${formatDate(new Date())} Deleted from cache ${key} key`);
      }, timeOut);
    }

    return result;
  }

  public getCacheSize() {
    this.map.size;
  }
}
