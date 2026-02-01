import * as OTPAuth from './lib/otpauth.min.js';

// Helper to get state on demand
async function getState() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['secrets', 'blockedSites', 'tempUnlocks', 'lastReset'], (result) => {
            resolve({
                secrets: result.secrets || {},
                blockedSites: result.blockedSites || {},
                tempUnlocks: result.tempUnlocks || {},
                lastReset: result.lastReset || 0
            });
        });
    });
}

// Daily Reset Check
async function checkDailyReset() {
    const data = await getState();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    if (data.lastReset < todayStart) {
        console.log('Resetting daily usage');
        for (const domain in data.blockedSites) {
            data.blockedSites[domain].used = 0;
        }
        await chrome.storage.local.set({
            blockedSites: data.blockedSites,
            lastReset: todayStart
        });
        return { ...data, lastReset: todayStart }; // Return updated data
    }
    return data;
}

// Tracking Loop
chrome.alarms.create('trackingHeartbeat', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'trackingHeartbeat') {
        const state = await checkDailyReset(); // Ensure reset happens first
        await checkActiveTab(state);
    }
});

async function checkActiveTab(preloadedState) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.url) return;

    // If we didn't get state yet (called from elsewhere), fetch it
    const state = preloadedState || await getState();

    const url = new URL(tab.url);
    const domain = url.hostname.replace('www.', '');

    // Check if tracked
    if (state.blockedSites[domain]) {
        console.log(`Tracking usage for ${domain}`);
        state.blockedSites[domain].used += 1;

        // Save using local set immediately
        await chrome.storage.local.set({ blockedSites: state.blockedSites });

        checkBlockStatus(tab.id, domain, state);
    }
}

function checkBlockStatus(tabId, domain, state) {
    const siteConfig = state.blockedSites[domain];
    if (!siteConfig) return;

    const limitReached = siteConfig.used >= siteConfig.limit;
    const unlockExpiry = state.tempUnlocks[domain] || 0;
    const isUnlocked = Date.now() < unlockExpiry;

    if (limitReached && !isUnlocked) {
        console.log(`Blocking ${domain}. Used: ${siteConfig.used}, Limit: ${siteConfig.limit}`);
        const blockPageUrl = chrome.runtime.getURL('src/pages/blocked/blocked.html') + `?domain=${domain}`;
        chrome.tabs.update(tabId, { url: blockPageUrl });
    }
}

// Navigation Listener
chrome.webNavigation.onCommitted.addListener(async (details) => {
    if (details.frameId !== 0) return;
    try {
        const url = new URL(details.url);
        const domain = url.hostname.replace('www.', '');
        const state = await getState(); // Fetch fresh state

        if (state.blockedSites[domain]) {
            checkBlockStatus(details.tabId, domain, state);
        }
    } catch (e) {
        // ignore
    }
});

// Message Handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // We must return true immediately to keep channel open for async response
    handleMessage(request, sendResponse);
    return true;
});

async function handleMessage(request, sendResponse) {
    const state = await getState();

    if (request.action === 'getUnlockOptions') {
        const domain = request.domain;
        const site = state.blockedSites[domain];
        if (!site || !site.secretIds) {
            sendResponse({ options: [] });
            return;
        }
        const options = site.secretIds ? site.secretIds.map(id => state.secrets[id]).filter(Boolean) : [];
        sendResponse({ options });
    }

    else if (request.action === 'attemptUnlock') {
        await handleUnlockAttempt(request, sendResponse, state);
    }

    else if (request.action === 'updateConfig') {
        // No local cache to clear, just acknowledge
        sendResponse({ success: true });
    }
}

async function handleUnlockAttempt(request, sendResponse, state) {
    const secretObj = state.secrets[request.secretId];
    if (!secretObj) {
        sendResponse({ success: false, error: 'Invalid Secret ID' });
        return;
    }

    try {
        const totp = new OTPAuth.TOTP({
            secret: secretObj.secret,
            algorithm: 'SHA1',
            digits: 6,
            period: 30
        });

        const delta = totp.validate({ token: request.code, window: 1 });

        if (delta !== null) {
            const durationHeader = secretObj.duration || 15;
            const unlockExpiry = Date.now() + (durationHeader * 60 * 1000);

            state.tempUnlocks[request.domain] = unlockExpiry;
            await chrome.storage.local.set({ tempUnlocks: state.tempUnlocks });

            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'Invalid Code' });
        }
    } catch (e) {
        console.error(e);
        sendResponse({ success: false, error: 'Validation Error: ' + e.message });
    }
}
