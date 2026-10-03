import { expect, it } from "vitest";
import { sharedConfig } from "solid-js";
import { renderToStream } from "solid-js/web";

it("settles the SSR pipe when its reader disconnects before a late fragment", async () => {
  let finishFragment!: (value: string) => boolean;
  const stream = renderToStream(() => {
    finishFragment = sharedConfig.context.registerFragment("late");
    return "<main>shell</main><!--!$late-->loading<!--!$/late-->";
  });
  const { readable, writable } = new TransformStream<Uint8Array>();
  const pipe = stream.pipeTo(writable);
  const reader = readable.getReader();

  expect((await reader.read()).done).toBe(false);
  await reader.cancel();
  finishFragment("late data");

  await expect(pipe).resolves.toBeUndefined();
});
