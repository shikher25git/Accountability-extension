
document.getElementById('opts').onclick = () => chrome.runtime.openOptionsPage();

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = new URL(tabs[0].url);
    const domain = url.hostname.replace('www.', '');

    chrome.storage.local.get(['blockedSites'], (res) => {
        const site = res.blockedSites[domain];
        if (site) {
            document.getElementById('site').textContent = domain;
            document.getElementById('time').textContent = `${site.used} / ${site.limit} m`;
        }
    });
});
