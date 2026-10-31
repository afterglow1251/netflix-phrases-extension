// Opens the page with all saved episodes: from the toolbar icon, or from the
// "All episodes" link in the player panel (then with that episode selected).
const LIBRARY = chrome.runtime.getURL('library/library.html');

function openLibrary(videoId) {
  chrome.tabs.create({ url: videoId ? `${LIBRARY}#${videoId}` : LIBRARY });
}

chrome.action.onClicked.addListener(() => openLibrary());

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'openLibrary') openLibrary(message.videoId);
});
