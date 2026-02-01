
const urlParams = new URLSearchParams(window.location.search);
const domain = urlParams.get('domain');

document.getElementById('domainDisplay').textContent = domain || 'Blocked Site';

let selectedSecretId = null;

// Load options
chrome.runtime.sendMessage({ action: 'getUnlockOptions', domain: domain }, (response) => {
    const container = document.getElementById('unlockOptions');
    if (response.options && response.options.length > 0) {
        response.options.forEach(opt => {
            const btn = document.createElement('button');
            const label = opt.label || 'Unknown';
            const duration = opt.duration || 15;
            btn.textContent = `Unlock ${duration}m (${label})`;
            btn.onclick = () => showInput(opt.id, label);
            container.appendChild(btn);
        });
    } else {
        container.innerHTML = '<p>No accountability keys found for this site. Go to options to set them up.</p>';
        const btn = document.createElement('button');
        btn.textContent = 'Open Settings';
        btn.onclick = () => chrome.runtime.openOptionsPage();
        container.appendChild(btn);
    }
});

function showInput(secretId, label) {
    selectedSecretId = secretId;
    document.getElementById('unlockOptions').style.display = 'none';
    document.getElementById('inputSection').style.display = 'flex';
    document.getElementById('instructionText').innerHTML = `Ask <strong>${label}</strong> for the code.`;
    document.getElementById('code').focus();
    document.getElementById('errorMsg').style.display = 'none';
}

document.getElementById('backBtn').onclick = () => {
    document.getElementById('inputSection').style.display = 'none';
    document.getElementById('unlockOptions').style.display = 'flex';
    document.getElementById('code').value = '';
};

document.getElementById('unlockBtn').onclick = submitCode;
document.getElementById('code').onkeydown = (e) => {
    if (e.key === 'Enter') submitCode();
};

function submitCode() {
    const code = document.getElementById('code').value;
    if (code.length < 6) return;

    chrome.runtime.sendMessage({
        action: 'attemptUnlock',
        domain: domain,
        secretId: selectedSecretId,
        code: code
    }, (response) => {
        if (response.success) {
            // Reload the tab that was blocked? 
            // Or just close this tab and let user navigate?
            // Usually simpler to just "Go Back" or "Redirect to site"
            window.location.href = `https://${domain}`;
        } else {
            const err = document.getElementById('errorMsg');
            err.textContent = response.error || 'Invalid Code';
            err.style.display = 'block';

            // Shake animation
            const input = document.getElementById('code');
            input.animate([
                { transform: 'translateX(0)' },
                { transform: 'translateX(-10px)' },
                { transform: 'translateX(10px)' },
                { transform: 'translateX(0)' }
            ], { duration: 300 });
        }
    });
}
