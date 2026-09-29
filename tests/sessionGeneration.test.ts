import { describe, expect, it } from "vitest";
import { SessionGeneration } from "../src/lib/sessionGeneration";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("SessionGeneration", () => {
  it("prevents an older session response from replacing a newer one", async () => {
    const generation = new SessionGeneration();
    const firstResponse = deferred<string>();
    const secondResponse = deferred<string>();
    const firstGeneration = generation.next();
    let visibleProfile = "";

    const firstRequest = generation
      .run(firstGeneration, () => firstResponse.promise)
      .then((result) => {
        if (result.current) visibleProfile = result.value;
      });

    const secondGeneration = generation.next();
    const secondRequest = generation
      .run(secondGeneration, () => secondResponse.promise)
      .then((result) => {
        if (result.current) visibleProfile = result.value;
      });

    secondResponse.resolve("new-session");
    await secondRequest;
    firstResponse.resolve("old-session");
    await firstRequest;

    expect(visibleProfile).toBe("new-session");
  });

  it("invalidates pending work when logout or a cross-tab event advances the session", async () => {
    const generation = new SessionGeneration();
    const response = deferred<string>();
    const activeGeneration = generation.next();
    const request = generation.run(activeGeneration, () => response.promise);

    generation.next();
    response.resolve("stale-private-data");

    await expect(request).resolves.toEqual({ current: false });
  });
});
