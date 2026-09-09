const AUTH_USER = "admin";
const AUTH_PASS_ENCODED = "MTIzNA=="; // Base64 encoding of "1234"
const DEFAULT_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwMf80sbdOU5Z2JTAudYFhCXYDHgxPk8pRuzUTyGCqeI2g1w6W02lbu6nlLTmAWG3m3/exec";

let WEB_APP_URL = DEFAULT_WEBAPP_URL;
let savedKeysSet = new Set();
let slipOriginalData = {};
let pendingConfirmAction = null;

let slipConfigs = JSON.parse(localStorage.getItem('custom_slip_configs')) || [
    { name: "১ম তলা — দোকান আকাশ", defaultCost: 17, slug: "shop_akash" },
    { name: "১ম তলা — দোকান সাহালম", defaultCost: 17, slug: "shop_sahalam" },
    { name: "১ম তলা — দোকান হেদায়েতুল্লাহ", defaultCost: 17, slug: "shop_hedayetullah" },
    { name: "২য় তলা — উত্তর দিক", defaultCost: 11, slug: "floor2_north" },
    { name: "২য় তলা — দক্ষিণ দিক", defaultCost: 11, slug: "floor2_south" },
    { name: "৩য় তলা — উত্তর দিক", defaultCost: 11, slug: "floor3_north" },
    { name: "৩য় তলা — দক্ষিণ দিক", defaultCost: 11, slug: "floor3_south" },
    { name: "৩য় তলা — নতুন ইউনিট", defaultCost: 11, slug: "floor3_new" }
];

const monthNumMap = {
    'জানুয়ারি': 1, 'ফেব্রুয়ারি': 2, 'মার্চ': 3, 'এপ্রিল': 4,
    'মে': 5, 'জুন': 6, 'জুলাই': 7, 'আগস্ট': 8,
    'সেপ্টেম্বর': 9, 'অক্টোবর': 10, 'নভেম্বর': 11, 'ডিসেম্বর': 12
};

const slipsContainer = document.getElementById('slips-container');
const globalDateInput = document.getElementById('global-date');
const globalMonthSelect = document.getElementById('global-month');
const globalYearSelect = document.getElementById('global-year');
const connectionStatusEl = document.getElementById('connection-status');

window.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem('isLoggedIn') === 'true') {
        showAppContent();
    }
});

function handleLogin(event) {
    event.preventDefault();
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value.trim();
    const err = document.getElementById('login-error');

    if (u === AUTH_USER && btoa(p) === AUTH_PASS_ENCODED) {
        sessionStorage.setItem('isLoggedIn', 'true');
        err.style.display = 'none';
        showAppContent();
    } else {
        err.style.display = 'block';
    }
}

function showAppContent() {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('main-app-content').style.display = 'block';
    
    setTodayDate();
    renderSlips();
    syncGlobalInfo();
    refreshSavedKeys();
}

function handleLogout() {
    sessionStorage.removeItem('isLoggedIn');
    document.getElementById('main-app-content').style.display = 'none';
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
}

function setTodayDate() {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    document.getElementById('global-date').value = `${dd}-${mm}-${yyyy}`;
}

function toBanglaNumeral(numStr) {
    if(numStr === undefined || numStr === null) return '';
    const banglaDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return numStr.toString().replace(/\d/g, d => banglaDigits[d]);
}

function banglaToEnglishNumeral(str) {
    const banglaDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return str.toString().split('').map(ch => {
        const idx = banglaDigits.indexOf(ch);
        return idx !== -1 ? idx : ch;
    }).join('');
}

function generateSlugFromName(name) {
    let clean = name.trim().toLowerCase()
        .replace(/—/g, ' ')
        .replace(/-/g, ' ')
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
    return clean || ("slip_" + Date.now());
}

function formatDecimalBangla(val) {
    if (val === null || val === undefined || isNaN(val)) return '০';
    let str = val.toString();
    let parts = str.split('.');
    let integerPart = toBanglaNumeral(parseFloat(parts[0]).toLocaleString('en-US'));
    if (parts.length > 1) {
        return integerPart + '.' + toBanglaNumeral(parts[1]);
    }
    return integerPart;
}

function getFullMonthText() {
    const month = globalMonthSelect.value || '';
    const year = globalYearSelect.value || '';
    if (!month && !year) return 'মাস ও সাল নির্বাচন করুন';
    if (!month) return `মাস নির্বাচন করুন ${year}`.trim();
    if (!year) return `${month} (সাল নির্বাচন করুন)`.trim();
    return `${month} ${year}`;
}

function renderSlips() {
    slipsContainer.innerHTML = '';
    slipConfigs.forEach((config, index) => {
        const slipDiv = document.createElement('div');
        slipDiv.className = 'bill-slip print-hide';
        slipDiv.id = `slip-${index}`;

        slipDiv.innerHTML = `
            <div class="slip-header">
                <span class="slip-title-main">বিদ্যুৎ বিলের রসিদ</span>
                <div class="slip-meta-info">
                    <span>মাস: <span class="header-month-highlight disp-month">${getFullMonthText()}</span></span>
                    <span>|</span>
                    <span>তারিখ: <span class="disp-date">${globalDateInput.value || '-'}</span></span>
                </div>
                <div class="slip-location-title-centered">${config.name}</div>
            </div>
            <div class="slip-body-grid">
                <div class="field-box">
                    <label>বর্তমান মাসের ইউনিট:</label>
                    <input type="number" step="any" class="curr-unit" placeholder="e.g. 350.5" oninput="calculateSlip(${index})">
                    <span class="print-val print-curr-val">-</span>
                </div>
                <div class="field-box">
                    <label>আগের মাসের ইউনিট:</label>
                    <input type="number" step="any" class="prev-unit" placeholder="e.g. 250" oninput="calculateSlip(${index})">
                    <span class="print-val print-prev-val">-</span>
                </div>
                <div class="field-box">
                    <label>ব্যবহৃত ইউনিট:</label>
                    <input type="number" step="any" class="used-unit" readonly value="0">
                    <span class="print-val print-used-val">০</span>
                </div>
                <div class="field-box">
                    <label>প্রতি ইউনিটের মূল্য:</label>
                    <input type="number" step="any" class="unit-cost" value="${config.defaultCost}" oninput="calculateSlip(${index})">
                    <span class="print-val print-cost-val">৳ ${toBanglaNumeral(config.defaultCost)}</span>
                </div>
            </div>
            <div class="slip-footer-summary">
                <div class="calc-breakdown">হিসাব: <span class="calc-formula">০ × ৳${toBanglaNumeral(config.defaultCost)} = ৳০/=</span></div>
                <div class="total-bill-display">
                    <span class="total-amount-highlight">মোট বিল: <span class="total-val">৳ ০/=</span></span>
                </div>
            </div>
            <div class="save-row">
                <span class="save-status" id="save-status-${index}"></span>
            </div>
            <div class="record-actions-row" id="record-actions-${index}">
                <span class="record-loaded-note">📌 এই মাসের ডেটা Sheet থেকে লোড হয়েছে — এডিট করে আপডেট/ডিলিট করুন</span>
                <button type="button" class="btn-mini btn-update" onclick="confirmUpdateSlip(${index})">✏️ আপডেট করুন</button>
                <button type="button" class="btn-mini btn-delete" onclick="confirmDeleteSlip(${index})">🗑️ ডিলিট করুন</button>
                <button type="button" class="btn-mini btn-download-img" onclick="downloadSlipImage(${index})">🖼️ ছবি ডাউনলোড</button>
            </div>
        `;
        slipsContainer.appendChild(slipDiv);
    });

    document.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('wheel', function(e) { e.preventDefault(); }, { passive: false });
    });
}

function syncGlobalInfo() {
    const dateVal = globalDateInput.value || '-';
    const monthVal = getFullMonthText();

    document.querySelectorAll('.disp-date').forEach(el => el.textContent = dateVal);
    document.querySelectorAll('.disp-month').forEach(el => el.textContent = monthVal);
}

globalDateInput.addEventListener('input', syncGlobalInfo);
globalMonthSelect.addEventListener('change', syncGlobalInfo);
globalYearSelect.addEventListener('change', syncGlobalInfo);

function calculateSlip(index) {
    const slip = document.getElementById(`slip-${index}`);
    if (!slip) return;
    
    const currInput = slip.querySelector('.curr-unit');
    const prevInput = slip.querySelector('.prev-unit');
    const costInput = slip.querySelector('.unit-cost');
    const usedInput = slip.querySelector('.used-unit');

    const currValStr = currInput.value.trim();
    const prevValStr = prevInput.value.trim();
    const costValStr = costInput.value.trim();

    if (currValStr === '') {
        slip.classList.add('print-hide');
    } else {
        slip.classList.remove('print-hide');
    }

    const curr = currValStr !== '' ? parseFloat(currValStr) : 0;
    const prev = prevValStr !== '' ? parseFloat(prevValStr) : 0;
    const cost = costValStr !== '' ? parseFloat(costValStr) : 0;

    let used = curr - prev;
    if (used < 0 || isNaN(used)) used = 0;

    used = Math.round(used * 100) / 100;
    usedInput.value = used;

    const totalBill = used * cost;
    const roundedTotal = Math.round(totalBill * 100) / 100;

    slip.querySelector('.print-curr-val').textContent = currValStr !== '' ? formatDecimalBangla(currValStr) : '-';
    slip.querySelector('.print-prev-val').textContent = prevValStr !== '' ? formatDecimalBangla(prevValStr) : '-';
    slip.querySelector('.print-used-val').textContent = formatDecimalBangla(used);
    slip.querySelector('.print-cost-val').textContent = '৳ ' + formatDecimalBangla(costValStr);

    const formattedTotal = formatDecimalBangla(roundedTotal);
    const formulaText = `${formatDecimalBangla(used)} × ${formatDecimalBangla(cost)} = ${formattedTotal}/=`;
    
    slip.querySelector('.calc-formula').textContent = formulaText;
    slip.querySelector('.total-val').textContent = '৳ ' + formattedTotal + '/=';
}

function buildBillKey(index) {
    const config = slipConfigs[index];
    const monthBn = globalMonthSelect.value;
    const yearBn = globalYearSelect.value;
    if (!config || !monthBn || !yearBn) return null;
    const monthNum = monthNumMap[monthBn];
    const yearNum = banglaToEnglishNumeral(yearBn);
    if (!monthNum || !yearNum) return null;
    return `${config.slug}_${yearNum}_${monthNum}`;
}

const confirmOverlay = document.getElementById('confirm-overlay');
const confirmBoxTitle = document.getElementById('confirm-box-title');
const confirmBoxMsg = document.getElementById('confirm-box-msg');
const confirmPassInput = document.getElementById('confirm-pass-input');
const confirmPassError = document.getElementById('confirm-pass-error');
const confirmBoxOk = document.getElementById('confirm-box-ok');
const confirmBoxCancel = document.getElementById('confirm-box-cancel');

function showConfirm(title, msg, onOk) {
    confirmBoxTitle.textContent = title;
    confirmBoxMsg.textContent = msg;
    pendingConfirmAction = onOk;
    
    confirmPassInput.value = '';
    confirmPassError.style.display = 'none';
    confirmBoxOk.disabled = true;
    
    confirmOverlay.classList.add('open');
    setTimeout(() => confirmPassInput.focus(), 100);
}

function hideConfirm() {
    confirmOverlay.classList.remove('open');
    pendingConfirmAction = null;
}

confirmPassInput.addEventListener('input', () => {
    const val = confirmPassInput.value.trim();
    if (btoa(val) === AUTH_PASS_ENCODED) {
        confirmBoxOk.disabled = false;
        confirmPassError.style.display = 'none';
    } else {
        confirmBoxOk.disabled = true;
    }
});

confirmBoxCancel.addEventListener('click', hideConfirm);
confirmOverlay.addEventListener('click', (e) => { if (e.target === confirmOverlay) hideConfirm(); });

confirmBoxOk.addEventListener('click', () => {
    const val = confirmPassInput.value.trim();
    if (btoa(val) === AUTH_PASS_ENCODED) {
        const action = pendingConfirmAction;
        hideConfirm();
        if (typeof action === 'function') action();
    } else {
        confirmPassError.style.display = 'block';
    }
});

/* --- Edit Slips Feature & Drag and Drop Logic --- */
function promptEditClips() {
    showConfirm(
        'সুরক্ষা যাচাই',
        'স্লিপের নাম ও রেট পরিবর্তন করতে পাসওয়ার্ড দিন।',
        openEditClipsModal
    );
}

function openEditClipsModal() {
    const container = document.getElementById('edit-slips-list');
    container.innerHTML = '';
    slipConfigs.forEach((cfg, idx) => {
        const div = document.createElement('div');
        div.className = 'edit-slip-item';
        div.draggable = true;
        div.dataset.slug = cfg.slug;
        div.innerHTML = `
            <span class="drag-handle" title="ধরে উপরে/নিচে সরান">☰</span>
            <input type="text" class="name-input" value="${cfg.name}" id="edit-name-${idx}">
            <input type="number" class="cost-input" value="${cfg.defaultCost}" id="edit-cost-${idx}">
            <button class="btn-icon-del" onclick="deleteSlipConfig(${idx})" title="মুছে ফেলুন">🗑️</button>
        `;
        container.appendChild(div);
    });

    initDragAndDrop();
    document.getElementById('edit-slips-overlay').classList.add('open');
}

function initDragAndDrop() {
    const container = document.getElementById('edit-slips-list');
    let draggedItem = null;

    container.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.edit-slip-item');
        if (item) {
            draggedItem = item;
            setTimeout(() => item.classList.add('dragging'), 0);
        }
    });

    container.addEventListener('dragend', (e) => {
        const item = e.target.closest('.edit-slip-item');
        if (item) {
            item.classList.remove('dragging');
            draggedItem = null;
        }
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        if (draggedItem) {
            if (afterElement == null) {
                container.appendChild(draggedItem);
            } else {
                container.insertBefore(draggedItem, afterElement);
            }
        }
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.edit-slip-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function closeEditClipsModal() {
    document.getElementById('edit-slips-overlay').classList.remove('open');
}

function addNewSlipConfig() {
    const name = document.getElementById('new-slip-name').value.trim();
    const cost = parseFloat(document.getElementById('new-slip-cost').value.trim());

    if (!name || isNaN(cost)) {
        alert('অনুগ্রহ করে নাম এবং সঠিক ইউনিট প্রাইস লিখুন।');
        return;
    }

    const isDuplicate = slipConfigs.some(cfg => cfg.name.toLowerCase() === name.toLowerCase());
    if (isDuplicate) {
        alert('এই নামের স্লিপ ইতিমধ্যে তালিকায় রয়েছে! দয়া করে অন্য নাম ব্যবহার করুন।');
        return;
    }

    const slug = generateSlugFromName(name);
    slipConfigs.push({ name, defaultCost: cost, slug });
    
    document.getElementById('new-slip-name').value = '';
    document.getElementById('new-slip-cost').value = '';
    openEditClipsModal();
}

function deleteSlipConfig(idx) {
    if (confirm(`আপনি কি "${slipConfigs[idx].name}" ডিলিট করতে চান?`)) {
        slipConfigs.splice(idx, 1);
        openEditClipsModal();
    }
}

function saveEditedClips() {
    const container = document.getElementById('edit-slips-list');
    const items = [...container.querySelectorAll('.edit-slip-item')];

    let newConfigs = [];
    let names = [];
    let hasDuplicate = false;

    items.forEach((item) => {
        const nameInput = item.querySelector('.name-input');
        const costInput = item.querySelector('.cost-input');
        const name = nameInput ? nameInput.value.trim() : '';
        const defaultCost = costInput ? parseFloat(costInput.value.trim()) || 0 : 0;
        
        if (name) {
            if (names.map(n => n.toLowerCase()).includes(name.toLowerCase())) {
                hasDuplicate = true;
            }
            names.push(name);

            // পুরাতন slug খোঁজা বা নতুন তৈরি করা
            const existingConfig = slipConfigs.find(c => c.slug === item.dataset.slug);
            const slug = existingConfig && existingConfig.name === name ? existingConfig.slug : generateSlugFromName(name);

            newConfigs.push({ name, defaultCost, slug });
        }
    });

    if (hasDuplicate) {
        alert('দুটি স্লিপের নাম একই রাখা যাবে না! দয়া করে ইউনিক নাম লিখুন।');
        return;
    }

    slipConfigs = newConfigs;
    localStorage.setItem('custom_slip_configs', JSON.stringify(slipConfigs));
    closeEditClipsModal();
    renderSlips();
    syncGlobalInfo();
    loadMonthData();
    alert('স্লিপ লিস্ট সফলভাবে আপডেট ও ক্রমানুসারে সাজানো হয়েছে!');
}

async function refreshSavedKeys() {
    if (!WEB_APP_URL) return;
    
    connectionStatusEl.textContent = '🔄 যাচাই করা হচ্ছে...';
    connectionStatusEl.className = 'connection-status';
    try {
        const res = await fetch(WEB_APP_URL + '?action=list');
        const data = await res.json();
        if (data.status === 'success') {
            savedKeysSet = new Set(data.keys || []);
            connectionStatusEl.textContent = `✅ গুগল শিটের সাথে সংযুক্ত আছে (${toBanglaNumeral(savedKeysSet.size)}টি বিল সংরক্ষিত আছে)`;
            connectionStatusEl.className = 'connection-status ok';
        } else {
            connectionStatusEl.textContent = '❌ গুগল শিটের সাথে সংযোগ ব্যর্থ হয়েছে';
            connectionStatusEl.className = 'connection-status error';
        }
    } catch (err) {
        connectionStatusEl.textContent = '❌ সংযোগ ব্যর্থ (URL ভুল বা সংযোগ সমস্যা)';
        connectionStatusEl.className = 'connection-status error';
    }
    updateAllSaveButtonsState();
    loadMonthData();
}

async function loadMonthData() {
    const monthBn = globalMonthSelect.value;
    const yearBn = globalYearSelect.value;

    slipOriginalData = {};
    slipConfigs.forEach((cfg, idx) => toggleRecordActions(idx, false));

    if (!WEB_APP_URL || !monthBn || !yearBn) return;

    const monthNum = monthNumMap[monthBn];
    const yearNum = banglaToEnglishNumeral(yearBn);
    if (!monthNum || !yearNum) return;

    try {
        const res = await fetch(`${WEB_APP_URL}?action=getMonth&yearNum=${encodeURIComponent(yearNum)}&monthNum=${encodeURIComponent(monthNum)}`);
        const data = await res.json();
        if (data.status !== 'success') return;

        const recordsByKey = {};
        (data.records || []).forEach(rec => { recordsByKey[rec.key] = rec; });

        slipConfigs.forEach((cfg, idx) => {
            const key = buildBillKey(idx);
            const rec = key ? recordsByKey[key] : null;
            if (rec) {
                applyRecordToSlip(idx, rec);
                slipOriginalData[idx] = rec;
                toggleRecordActions(idx, true);
            }
        });
    } catch (err) {}
}

function applyRecordToSlip(index, rec) {
    const slip = document.getElementById(`slip-${index}`);
    if (!slip) return;
    slip.querySelector('.curr-unit').value = rec.currUnit || '';
    slip.querySelector('.prev-unit').value = rec.prevUnit || '';
    slip.querySelector('.unit-cost').value = rec.unitCost || slipConfigs[index].defaultCost;
    calculateSlip(index);
}

function toggleRecordActions(index, visible) {
    const row = document.getElementById(`record-actions-${index}`);
    if (row) row.classList.toggle('visible', !!visible);
}

function confirmUpdateSlip(index) {
    const config = slipConfigs[index];
    showConfirm(
        'আপডেট নিশ্চিত করুন',
        `আপনি কি "${config.name}"-এর নতুন ইনপুট অনুযায়ী গুগল শিটের তথ্য আপডেট করতে চান?`,
        () => updateSlip(index)
    );
}

async function updateSlip(index) {
    const key = buildBillKey(index);
    const statusEl = document.getElementById(`save-status-${index}`);
    if (!key || !slipOriginalData[index]) return;

    const slip = document.getElementById(`slip-${index}`);
    const currVal = slip.querySelector('.curr-unit').value.trim();
    if (currVal === '') {
        alert('বর্তমান ইউনিট খালি রাখা যাবে না।');
        return;
    }

    const prevVal = slip.querySelector('.prev-unit').value.trim();
    const costVal = slip.querySelector('.unit-cost').value.trim();
    const usedVal = slip.querySelector('.used-unit').value;
    const totalText = slip.querySelector('.total-val').textContent;

    const payload = {
        action: 'update',
        key: key,
        shop: slipConfigs[index].name,
        month: globalMonthSelect.value,
        year: globalYearSelect.value,
        monthNum: monthNumMap[globalMonthSelect.value],
        yearNum: banglaToEnglishNumeral(globalYearSelect.value),
        date: globalDateInput.value,
        currUnit: currVal,
        prevUnit: prevVal || '0',
        usedUnit: usedVal,
        unitCost: costVal,
        totalBill: totalText
    };

    if (statusEl) {
        statusEl.textContent = '⏳ আপডেট হচ্ছে...';
        statusEl.className = 'save-status';
    }

    try {
        const res = await fetch(WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === 'success') {
            slipOriginalData[index] = payload;
            if (statusEl) {
                statusEl.textContent = '✅ সফলভাবে আপডেট হয়েছে।';
                statusEl.className = 'save-status success';
            }
        }
    } catch (err) {
        if (statusEl) {
            statusEl.textContent = '❌ আপডেট করতে সমস্যা হয়েছে।';
            statusEl.className = 'save-status error';
        }
    }
}

function confirmDeleteSlip(index) {
    const config = slipConfigs[index];
    showConfirm(
        'ডিলিট নিশ্চিত করুন',
        `আপনি কি নিশ্চিত যে "${config.name}"-এর এই মাসের রেকর্ডটি Google Sheet থেকে ডিলিট করতে চান?`,
        () => deleteSlip(index)
    );
}

async function deleteSlip(index) {
    const key = buildBillKey(index);
    const statusEl = document.getElementById(`save-status-${index}`);
    if (!key || !slipOriginalData[index]) return;

    if (statusEl) {
        statusEl.textContent = '⏳ ডিলিট হচ্ছে...';
        statusEl.className = 'save-status';
    }

    try {
        const res = await fetch(WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'delete', key: key })
        });
        const data = await res.json();
        if (data.status === 'success') {
            delete slipOriginalData[index];
            savedKeysSet.delete(key);
            toggleRecordActions(index, false);

            const slip = document.getElementById(`slip-${index}`);
            slip.querySelector('.curr-unit').value = '';
            slip.querySelector('.prev-unit').value = '';
            slip.querySelector('.unit-cost').value = slipConfigs[index].defaultCost;
            calculateSlip(index);

            if (statusEl) {
                statusEl.textContent = '✅ সফলভাবে ডিলিট হয়েছে।';
                statusEl.className = 'save-status success';
            }
        }
    } catch (err) {
        if (statusEl) {
            statusEl.textContent = '❌ ডিলিট করতে ব্যর্থ হয়েছে।';
            statusEl.className = 'save-status error';
        }
    }
}

function updateAllSaveButtonsState() {
    slipConfigs.forEach((config, index) => updateSlipStatusDisplay(index));
}

function updateSlipStatusDisplay(index) {
    const statusEl = document.getElementById(`save-status-${index}`);
    if (!statusEl) return;
    const key = buildBillKey(index);

    if (key && savedKeysSet.has(key)) {
        statusEl.textContent = '✅ এই মাসের বিল সংগৃহীত আছে';
        statusEl.className = 'save-status duplicate';
    } else if (statusEl.className.indexOf('success') === -1) {
        statusEl.textContent = '';
        statusEl.className = 'save-status';
    }
}

function clearAllInputs() {
    window.location.reload();
}

async function saveAllSlips() {
    if (!WEB_APP_URL) {
        alert('Google Sheet Web App URL নির্ধারণ করা নেই।');
        return;
    }
    if (!globalMonthSelect.value || !globalYearSelect.value) {
        alert('অনুগ্রহ করে বিলের মাস ও সাল নির্বাচন করুন।');
        return;
    }

    const saveAllBtn = document.getElementById('btn-save-all');
    const saveAllStatusEl = document.getElementById('save-all-status');
    saveAllBtn.disabled = true;
    saveAllBtn.textContent = '⏳ সংরক্ষণ হচ্ছে...';

    let savedCount = 0;
    let duplicateCount = 0;

    for (let index = 0; index < slipConfigs.length; index++) {
        const slip = document.getElementById(`slip-${index}`);
        const statusEl = document.getElementById(`save-status-${index}`);
        const currVal = slip.querySelector('.curr-unit').value.trim();

        if (currVal === '') continue;

        const key = buildBillKey(index);
        if (!key || savedKeysSet.has(key)) {
            duplicateCount++;
            continue;
        }

        const prevVal = slip.querySelector('.prev-unit').value.trim();
        const costVal = slip.querySelector('.unit-cost').value.trim();
        const usedVal = slip.querySelector('.used-unit').value;
        const totalText = slip.querySelector('.total-val').textContent;

        const payload = {
            key: key,
            shop: slipConfigs[index].name,
            month: globalMonthSelect.value,
            year: globalYearSelect.value,
            monthNum: monthNumMap[globalMonthSelect.value],
            yearNum: banglaToEnglishNumeral(globalYearSelect.value),
            date: globalDateInput.value,
            currUnit: currVal,
            prevUnit: prevVal || '0',
            usedUnit: usedVal,
            unitCost: costVal,
            totalBill: totalText
        };

        try {
            const res = await fetch(WEB_APP_URL, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.status === 'success') {
                savedKeysSet.add(key);
                savedCount++;
                if (statusEl) {
                    statusEl.textContent = '✅ সফলভাবে সংরক্ষিত হয়েছে।';
                    statusEl.className = 'save-status success';
                }
            }
        } catch (err) {}
    }

    saveAllBtn.disabled = false;
    saveAllBtn.textContent = '💾 সব বিল Google Sheet-এ সংরক্ষণ করুন';
    
    if (savedCount > 0) {
        saveAllStatusEl.textContent = `✅ ${toBanglaNumeral(savedCount)}টি বিল সফলভাবে সংরক্ষিত হয়েছে!`;
        saveAllStatusEl.className = 'save-all-status success';
        
        setTimeout(() => {
            window.location.reload();
        }, 1200);
    } else if (duplicateCount > 0 && savedCount === 0) {
        saveAllStatusEl.textContent = '⚠️ নির্বাচিত বিলগুলো ইতিমধ্যে গুগল শিটে সংগৃহীত আছে।';
        saveAllStatusEl.className = 'save-all-status duplicate';
    }
}

globalMonthSelect.addEventListener('change', () => { updateAllSaveButtonsState(); loadMonthData(); });
globalYearSelect.addEventListener('change', () => { updateAllSaveButtonsState(); loadMonthData(); });

/* --- HIGH QUALITY & PERFECT LAYOUT SLIP DOWNLOAD FUNCTION --- */
async function downloadSlipImage(index) {
    const slip = document.getElementById(`slip-${index}`);
    if (!slip) return;

    const btn = slip.querySelector('.btn-download-img');
    const originalBtnText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ ডাউনলোড হচ্ছে...';
    }

    calculateSlip(index);

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = '500px';

    const config = slipConfigs[index];
    const monthText = getFullMonthText();
    const dateText = globalDateInput.value || '-';
    
    const currVal = slip.querySelector('.curr-unit').value.trim();
    const prevVal = slip.querySelector('.prev-unit').value.trim();
    const usedVal = slip.querySelector('.used-unit').value;
    
    const formulaText = slip.querySelector('.calc-formula').textContent;
    const totalValText = slip.querySelector('.total-val').textContent;

    container.innerHTML = `
        <div style="background: #ffffff; padding: 25px; border: 2px solid #0f4c81; border-radius: 10px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1f2937; box-sizing: border-box;">
            <div style="text-align: center; border-bottom: 2px dashed #0f4c81; padding-bottom: 12px; margin-bottom: 15px;">
                <h2 style="margin: 0; font-size: 20px; color: #0f4c81; text-transform: uppercase; letter-spacing: 0.5px;">বিদ্যুৎ বিলের রসিদ</h2>
                <div style="font-size: 13px; font-weight: 600; color: #4b5563; margin-top: 6px; display: flex; justify-content: space-between; align-items: center; padding: 0 10px;">
                    <span>মাস: <strong style="background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; border: 1px solid #bfdbfe;">${monthText}</strong></span>
                    <span>তারিখ: <strong>${dateText}</strong></span>
                </div>
                <div style="margin-top: 12px; font-size: 18px; font-weight: 800; color: #0f172a; background: #f1f5f9; padding: 6px; border-radius: 6px; border: 1px solid #cbd5e1;">
                    ${config.name}
                </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; table-layout: fixed;">
                <thead>
                    <tr style="background-color: #f8fafc;">
                        <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 13px; color: #4b5563; width: 60%;">বিবরণ</th>
                        <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: right; font-size: 13px; color: #4b5563; width: 40%;">পরিমাণ</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 8px; font-size: 13px; font-weight: 600;">বর্তমান মাসের ইউনিট</td>
                        <td style="border: 1px solid #cbd5e1; padding: 8px; font-size: 13px; text-align: right; font-weight: 700;">${currVal !== '' ? formatDecimalBangla(currVal) : '-'}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 8px; font-size: 13px; font-weight: 600;">আগের মাসের ইউনিট</td>
                        <td style="border: 1px solid #cbd5e1; padding: 8px; font-size: 13px; text-align: right; font-weight: 700;">${prevVal !== '' ? formatDecimalBangla(prevVal) : '-'}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 8px; font-size: 13px; font-weight: 600;">ব্যবহৃত ইউনিট</td>
                        <td style="border: 1px solid #cbd5e1; padding: 8px; font-size: 13px; text-align: right; font-weight: 700; color: #2563eb;">${formatDecimalBangla(usedVal)}</td>
                    </tr>
                </tbody>
            </table>

            <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; padding: 10px 14px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                <div style="font-size: 13px; color: #334155; font-weight: 700;">
                    হিসাব: <span style="color: #0f4c81;">${formulaText}</span>
                </div>
                <div style="font-size: 16px; font-weight: 900; color: #000; background: #fef08a; padding: 4px 10px; border-radius: 5px; border: 1px solid #eab308;">
                    মোট বিল: <span style="color: #dc2626;">${totalValText}</span>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(container);

    try {
        const canvas = await html2canvas(container.firstElementChild, {
            scale: 3, 
            useCORS: true,
            backgroundColor: '#ffffff'
        });

        const monthBn = globalMonthSelect.value || 'মাস';
        const yearBn = globalYearSelect.value || '';
        const slipName = config ? config.name.replace(/[^a-zA-Z0-9ঀ-৿]/g, '_') : `slip_${index + 1}`;
        const fileName = `${slipName}_${monthBn}_${yearBn}.png`;

        const link = document.createElement('a');
        link.download = fileName;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();
    } catch (err) {
        alert('ছবি ডাউনলোড করতে সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।');
        console.error(err);
    } finally {
        document.body.removeChild(container);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalBtnText;
        }
    }
}