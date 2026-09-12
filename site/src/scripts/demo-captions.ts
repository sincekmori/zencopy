// Captions over a demo video (DemoVideo.astro): the line of the latest beat
// reached is the one shown, once the video has started — so the poster, the
// closing frame, is never captioned as an opening — and seeking works too.
for (const stage of document.querySelectorAll<HTMLElement>(".demo-stage[data-cues]")) {
  const video = stage.querySelector("video");
  const lines = [...stage.querySelectorAll<HTMLElement>(".demo-captions > *")];
  const moments = JSON.parse(stage.dataset["cues"] ?? "[]") as number[];
  if (video !== null) {
    let started = false;
    const show = (): void => {
      let active = -1;
      for (const [index, at] of moments.entries()) {
        if (video.currentTime >= at) {
          active = index;
        }
      }
      for (const [index, line] of lines.entries()) {
        line.toggleAttribute("data-active", started && index === active);
      }
    };
    const tick = (): void => {
      show();
      if (!video.paused && !video.ended) {
        requestAnimationFrame(tick);
      }
    };
    video.addEventListener("play", () => {
      started = true;
      tick();
    });
    for (const event of ["seeked", "pause", "ended"]) {
      video.addEventListener(event, show);
    }
  }
}
