export class SessionGeneration {
  private value = 0;

  next() {
    this.value += 1;
    return this.value;
  }

  current() {
    return this.value;
  }

  isCurrent(generation: number) {
    return generation === this.value;
  }

  async run<T>(generation: number, request: () => Promise<T>) {
    const value = await request();
    return this.isCurrent(generation)
      ? ({ current: true, value } as const)
      : ({ current: false } as const);
  }
}
