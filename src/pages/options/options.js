
import * as OTPAuth from '../../lib/otpauth.min.js';

let state = {
    secrets: {},
    blockedSites: {}
};

// Start
loadData();

function loadData() {
    chrome.storage.local.get(['secrets', 'blockedSites'], (result) => {
        state.secrets = result.secrets || {};
        state.blockedSites = result.blockedSites || {};
        renderKeys();
        renderSites();
        updateKeySelector();
    });
}

function saveData() {
    chrome.storage.local.set({
        secrets: state.secrets,
        blockedSites: state.blockedSites
    }, () => {
        chrome.runtime.sendMessage({ action: 'updateConfig' });
        loadData(); // Re-render
    });
}

// --- KEYS ---

document.getElementById('addKeyBtn').onclick = () => {
    const label = document.getElementById('newKeyLabel').value;
    const duration = parseInt(document.getElementById('newKeyDuration').value);

    if (!label || !duration) return alert('Please fill in label and duration');

    // Generate Secret
    const secret = new OTPAuth.Secret({ size: 20 });
    const id = 'key_' + Date.now();

    state.secrets[id] = {
        id,
        label,
        duration,
        secret: secret.base32
    };

    saveData();
    showQR(label, secret.base32);

    document.getElementById('newKeyLabel').value = '';
};

// Close Modal
document.getElementById('closeQrModalBtn').onclick = () => {
    document.getElementById('qrModal').style.display = 'none';
};

function renderKeys() {
    const container = document.getElementById('keysList');
    container.innerHTML = '';

    Object.values(state.secrets).forEach(key => {
        const div = document.createElement('div');
        div.className = 'list-item';

        const infoDiv = document.createElement('div');
        infoDiv.innerHTML = `<strong>${key.label}</strong><div style="font-size:0.8rem; color:#94a3b8">${key.duration} mins</div>`;

        const actionsDiv = document.createElement('div');

        const qrBtn = document.createElement('button');
        qrBtn.className = 'secondary';
        qrBtn.textContent = 'QR';
        qrBtn.onclick = () => showQR(key.label, key.secret);

        const delBtn = document.createElement('button');
        delBtn.className = 'danger';
        delBtn.textContent = '×';
        delBtn.style.marginLeft = '8px';
        delBtn.onclick = () => deleteKey(key.id);

        actionsDiv.appendChild(qrBtn);
        actionsDiv.appendChild(delBtn);

        div.appendChild(infoDiv);
        div.appendChild(actionsDiv);
        container.appendChild(div);
    });
}

function deleteKey(id) {
    if (confirm('Delete this key?')) {
        delete state.secrets[id];
        saveData();
    }
}

function showQR(label, secretBase32) {
    const modal = document.getElementById('qrModal');
    const placeholder = document.getElementById('qrPlaceholder');
    const text = document.getElementById('modalSecretDisplay');

    placeholder.innerHTML = '';
    text.textContent = secretBase32;

    const totp = new OTPAuth.TOTP({
        issuer: 'Accountability',
        label: label,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secretBase32)
    });

    const uri = totp.toString();

    new QRCode(placeholder, {
        text: uri,
        width: 200,
        height: 200
    });

    modal.style.display = 'flex';
}

// --- SITES ---

function updateKeySelector() {
    const sel = document.getElementById('keySelector');
    sel.innerHTML = '';
    Object.values(state.secrets).forEach(key => {
        const opt = document.createElement('option');
        opt.value = key.id;
        opt.textContent = `${key.label} (${key.duration}m)`;
        sel.appendChild(opt);
    });
}

document.getElementById('addSiteBtn').onclick = () => {
    const domain = document.getElementById('newSiteDomain').value.trim().replace(/^www\./, '');
    const limit = parseInt(document.getElementById('newSiteLimit').value);
    const selectedOptions = Array.from(document.getElementById('keySelector').selectedOptions).map(o => o.value);

    if (!domain || !limit) return alert('Fill domain and limit');
    if (selectedOptions.length === 0) return alert('Select at least one key for unlocking');

    state.blockedSites[domain] = {
        limit: limit,
        used: 0,
        secretIds: selectedOptions
    };

    saveData();
    document.getElementById('newSiteDomain').value = '';
};

function renderSites() {
    const container = document.getElementById('sitesList');
    container.innerHTML = '';

    Object.keys(state.blockedSites).forEach(domain => {
        const site = state.blockedSites[domain];
        const div = document.createElement('div');
        div.className = 'list-item';

        const infoDiv = document.createElement('div');
        infoDiv.innerHTML = `<strong>${domain}</strong><div style="font-size:0.8rem; color:#94a3b8">Limit: ${site.limit}m</div>`;

        const delBtn = document.createElement('button');
        delBtn.className = 'danger';
        delBtn.textContent = '×';
        delBtn.onclick = () => deleteSite(domain);

        div.appendChild(infoDiv);
        div.appendChild(delBtn);
        container.appendChild(div);
    });
}

// Verification Variables
let pendingDeleteDomain = null;

// Verify Modal Config
const verifyModal = document.getElementById('verifyModal');
const verifyInput = document.getElementById('verifyInput');
const verifyError = document.getElementById('verifyError');

document.getElementById('cancelVerifyBtn').onclick = () => {
    verifyModal.style.display = 'none';
    pendingDeleteDomain = null;
    verifyInput.value = '';
    verifyError.style.display = 'none';
};

document.getElementById('confirmVerifyBtn').onclick = () => {
    const code = verifyInput.value;
    if (code.length < 6) return;

    verifyCodeAndExecute(code);
};

verifyInput.onkeydown = (e) => {
    if (e.key === 'Enter') document.getElementById('confirmVerifyBtn').click();
};

function deleteSite(domain) {
    const site = state.blockedSites[domain];
    if (!site) return;

    // Check if site has secretIds
    if (!site.secretIds || site.secretIds.length === 0) {
        // No security enabled for this site, just delete
        if (confirm(`Stop blocking ${domain}?`)) {
            performDelete(domain);
        }
        return;
    }

    // Prepare Modal
    pendingDeleteDomain = domain;
    const labels = site.secretIds.map(id => state.secrets[id]?.label).filter(Boolean).join(' or ');
    document.getElementById('verifyInstruction').textContent = `To stop blocking ${domain}, enter code from: ${labels}`;

    verifyModal.style.display = 'flex';
    verifyInput.focus();
}

function verifyCodeAndExecute(code) {
    const domain = pendingDeleteDomain;
    const site = state.blockedSites[domain];

    if (!site) return;

    let valid = false;

    // Check against ALL assigned secrets
    for (const id of site.secretIds) {
        const secretObj = state.secrets[id];
        if (!secretObj) continue;

        try {
            const totp = new OTPAuth.TOTP({
                secret: secretObj.secret,
                algorithm: 'SHA1',
                digits: 6,
                period: 30
            });

            if (totp.validate({ token: code, window: 1 }) !== null) {
                valid = true;
                break;
            }
        } catch (e) { console.error(e); }
    }

    if (valid) {
        performDelete(domain);
        verifyModal.style.display = 'none';
        verifyInput.value = '';
        verifyError.style.display = 'none';
    } else {
        verifyError.style.display = 'block';
        verifyInput.classList.add('shake'); // Optional visual
        setTimeout(() => verifyInput.classList.remove('shake'), 500);
    }
}

function performDelete(domain) {
    delete state.blockedSites[domain];
    saveData();
}
