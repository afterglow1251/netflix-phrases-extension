// Runs in the page's own world, where Netflix's player API is visible (content
// scripts can't see page globals). Setting video.currentTime directly makes
// Netflix stop with an error, so jumps to a phrase go through the API.
window.addEventListener('netflix-phrases:seek', (event) => {
  try {
    const videoPlayer = netflix.appContext.state.playerApp.getAPI().videoPlayer;
    const ids = videoPlayer.getAllPlayerSessionIds();
    // Previews on the page have their own sessions; the episode's starts with "watch".
    const id = ids.find((s) => s.startsWith('watch')) || ids[0];
    videoPlayer.getVideoPlayerBySessionId(id).seek(Math.max(0, Number(event.detail)) * 1000);
  } catch (err) {
    console.warn('[Netflix Phrases] Could not jump to the phrase:', err);
  }
});
