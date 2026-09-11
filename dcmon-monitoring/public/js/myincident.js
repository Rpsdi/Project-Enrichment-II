/**
 * ============================================================================
 *  myIncident — Lapisan UI
 * ============================================================================
 *  Menghubungkan aturan bisnis (incident-rules.js) dengan DOM dan Firestore.
 *
 *  Ringkasan aturan yang ditegakkan di sini:
 *   - Incident tidak dapat dihapus; status hanya Active -> Resolved / Cancelled.
 *   - Resolved & Cancelled bersifat final: seluruh data terkunci permanen.
 *   - Role "staff" read-only; hanya "operator" yang dapat mengubah data.
 * ============================================================================
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js';
import {
    getFirestore,
    collection,
    doc,
    addDoc,
    getDoc,
    updateDoc,
    onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js';

import {
    PIC_DIRECTORY,
    TASK_FLOW,
    allTasksCompleted,
    buildJudulLengkap,
    canEditIncident,
    canFillClosureFields,
    collectResolveBlockers,
    composeKronologi,
    esc,
    extractNarasi,
    formatDateTime,
    formatShortDate,
    generateProblemId,
    isBlank,
    isIncidentLocked,
    mergeSavedPayload,
    nextTaskStatus,
    searchPic,
    stripJudulPrefix,
    validateCancelReason,
} from './incident-rules.js';

/* ==========================================================================
   1. KONFIGURASI
   ========================================================================== */

const CONFIG = window.__APP_CONFIG;
const USER = CONFIG.user;
const IS_OPERATOR = USER.role === 'operator';

const COLLECTION_NAME = 'incidents';

const STATUS_STYLE = {
    Active:    'bg-[rgb(var(--accent))]/10 border-[rgb(var(--accent))]/40 text-[rgb(var(--accent))]',
    Resolved:  'bg-emerald-500/10 border-emerald-700/50 text-emerald-400',
    Cancelled: 'bg-rose-500/10 border-rose-800/50 text-rose-400',
};

const TASK_STATUS_STYLE = {
    assigned:  'bg-[#1a1a1a] border-[#3a3a3a] text-gray-300',
    accepted:  'bg-amber-500/10 border-amber-700/50 text-amber-400',
    completed: 'bg-emerald-500/10 border-emerald-700/50 text-emerald-400',
};

/* ==========================================================================
   2. INISIALISASI FIREBASE
   ========================================================================== */

const app = initializeApp(CONFIG.firebase);
const db = getFirestore(app);
const incidentsRef = collection(db, COLLECTION_NAME);

/* ==========================================================================
   3. STATE
   ========================================================================== */

/** Cache seluruh incident dari Firestore: [{ id, ...data }] */
let incidents = [];

/** Filter dashboard: 'all' | 'Active' | 'Resolved' | 'Cancelled' */
let activeFilter = 'all';

/** Incident yang sedang dibuka di panel. id === null berarti incident baru. */
let draft = null;

/** Salinan draft saat panel dibuka, untuk mendeteksi perubahan belum tersimpan. */
let draftBaseline = null;

/** PIC yang dipilih dari hasil pencarian pada form task. */
let selectedPic = null;

const $ = (id) => document.getElementById(id);

/* ==========================================================================
   4. TEMPLATE KRONOLOGI (terikat ke form)
   ========================================================================== */

/** Segarkan baris Description & Start Time tanpa menghapus uraian pengguna. */
function refreshKronologiTemplate() {
    if (!draft) return;

    const judulLengkap = buildJudulLengkap($('fJudul').value);
    const narasi = extractNarasi($('fKronologi').value);

    $('fKronologi').value = composeKronologi(judulLengkap, draft.created_at, narasi);
}

/* ==========================================================================
   5. DASHBOARD: STATISTIK, FILTER & GRID
   ========================================================================== */

function renderStats() {
    const count = (status) => incidents.filter((i) => i.status === status).length;

    $('statTotal').textContent = incidents.length;
    $('statActive').textContent = count('Active');
    $('statResolved').textContent = count('Resolved');
    $('statCancelled').textContent = count('Cancelled');
}

function renderGrid() {
    const grid = $('incidentGrid');
    const empty = $('emptyState');

    const rows = activeFilter === 'all'
        ? incidents
        : incidents.filter((i) => i.status === activeFilter);

    $('loadingState').classList.add('hidden');

    if (!rows.length) {
        grid.classList.add('hidden');
        empty.classList.remove('hidden');
        $('emptyStateMsg').textContent = incidents.length
            ? `Tidak ada incident dengan status "${activeFilter}".`
            : (IS_OPERATOR
                ? 'Mulai dengan menekan tombol "Buat Incident" di kanan atas.'
                : 'Belum ada incident yang tercatat.');
        return;
    }

    empty.classList.add('hidden');
    grid.classList.remove('hidden');

    grid.innerHTML = rows.map((item, index) => {
        const tasks = Array.isArray(item.tasks) ? item.tasks : [];
        const done = tasks.filter((t) => t.status === 'completed').length;
        const status = item.status || 'Active';

        const hoverBorder = status === 'Active'
            ? 'hover:border-[rgb(var(--accent))]'
            : 'hover:border-[#555]';

        return `
            <div class="incident-card reveal reveal-delay-${((index % 3) + 1) * 100} group cursor-pointer p-6 rounded-3xl bg-[#0a0a0a] border border-[#222] ${hoverBorder} hover:-translate-y-1 transition-all duration-300 relative overflow-hidden"
                 data-id="${esc(item.id)}" role="button" tabindex="0">

                <div class="absolute inset-0 bg-gradient-to-br from-[rgb(var(--accent))] to-transparent opacity-0 group-hover:opacity-[0.04] transition-opacity duration-500 pointer-events-none"></div>

                <div class="relative flex items-start justify-between gap-3 mb-4">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="px-2 py-1 rounded-md bg-[#111] border border-[#333] text-[10px] font-mono font-bold text-gray-400">
                            ${esc(item.problem_id || '-')}
                        </span>
                        <span class="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${STATUS_STYLE[status] || STATUS_STYLE.Active}">
                            ${esc(status)}
                        </span>
                    </div>
                    <iconify-icon icon="solar:arrow-right-up-linear"
                                  class="text-lg text-gray-600 group-hover:text-[rgb(var(--accent))] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0"></iconify-icon>
                </div>

                <h3 class="relative font-['Syne',sans-serif] text-base font-bold text-white mb-3 leading-snug group-hover:text-[rgb(var(--accent))] transition-colors duration-300">
                    ${esc(item.judul || '(tanpa judul)')}
                </h3>

                <div class="relative flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-gray-500">
                    <span class="flex items-center gap-1.5">
                        <iconify-icon icon="solar:widget-4-linear" class="text-sm"></iconify-icon>
                        ${esc(item.kategori_tim || '-')} &middot; ${esc(item.perangkat || '-')}
                    </span>
                    <span class="flex items-center gap-1.5">
                        <iconify-icon icon="solar:user-linear" class="text-sm"></iconify-icon>
                        ${esc(item.created_by || '-')}
                    </span>
                    <span class="flex items-center gap-1.5">
                        <iconify-icon icon="solar:calendar-linear" class="text-sm"></iconify-icon>
                        ${esc(formatShortDate(item.created_at))}
                    </span>
                    <span class="flex items-center gap-1.5 ${tasks.length && done === tasks.length ? 'text-emerald-400' : ''}">
                        <iconify-icon icon="solar:clipboard-check-linear" class="text-sm"></iconify-icon>
                        ${done}/${tasks.length} task
                    </span>
                </div>
            </div>
        `;
    }).join('');

    grid.querySelectorAll('.incident-card').forEach((card) => {
        const open = () => openPanel(card.dataset.id);
        card.addEventListener('click', open);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
            }
        });
    });

    window.initScrollReveal();
}

function bindFilterChips() {
    document.querySelectorAll('.filter-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            activeFilter = chip.dataset.filter;

            document.querySelectorAll('.filter-chip').forEach((c) => {
                const on = c.dataset.filter === activeFilter;
                c.className = 'filter-chip px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border transition-all duration-300 ' +
                    (on
                        ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-black'
                        : 'border-[#333] bg-[#111] text-gray-400 hover:border-[#555] hover:text-white');
            });

            renderGrid();
        });
    });
}

/* ==========================================================================
   6. LANGGANAN REALTIME FIRESTORE
   ========================================================================== */

function subscribeIncidents() {
    onSnapshot(
        incidentsRef,
        (snapshot) => {
            incidents = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

            // Terbaru di atas
            incidents.sort((a, b) =>
                String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
            );

            renderStats();
            renderGrid();
        },
        (error) => {
            console.error('[myIncident] Gagal memuat data:', error);
            $('loadingState').classList.add('hidden');
            window.showToast('Gagal terhubung ke Firestore: ' + error.message, 'error');
        }
    );
}

/* ==========================================================================
   7. PANEL: BUKA / TUTUP / TAB
   ========================================================================== */

function setPanelOpen(open) {
    const panel = $('incidentPanel');
    const backdrop = $('panelBackdrop');

    if (open) {
        document.body.classList.add('panel-open');
        panel.classList.remove('translate-x-full');
        panel.setAttribute('aria-hidden', 'false');
        backdrop.classList.remove('opacity-0', 'pointer-events-none');
    } else {
        document.body.classList.remove('panel-open');
        panel.classList.add('translate-x-full');
        panel.setAttribute('aria-hidden', 'true');
        backdrop.classList.add('opacity-0', 'pointer-events-none');
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.panel-tab').forEach((el) => {
        el.classList.toggle('hidden', el.id !== tabId);
    });

    document.querySelectorAll('.panel-tab-btn').forEach((btn) => {
        const on = btn.dataset.tab === tabId;
        btn.className = 'panel-tab-btn px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors duration-300 flex items-center gap-1.5 ' +
            (on
                ? 'bg-[rgb(var(--accent))]/10 text-[rgb(var(--accent))]'
                : 'text-gray-500 hover:text-white hover:bg-[#111]');
    });
}

/** Buka panel. id === null berarti membuat incident baru. */
function openPanel(id) {
    if (id === null) {
        if (!IS_OPERATOR) return;

        draft = {
            id: null,
            problem_id: generateProblemId(),
            judul: '',
            kronologi: '',
            kategori_tim: 'Network',
            perangkat: '',
            resolution: '',
            problem_type: '',
            detail_alert: { jam_muncul: '', jam_response: '', jam_solving: '', root_cause: '', impact: '' },
            tasks: [],
            status: 'Active',
            cancel_reason: '',
            created_by: USER.name,
            created_at: new Date().toISOString(),
        };
    } else {
        const found = incidents.find((i) => i.id === id);
        if (!found) {
            window.showToast('Incident tidak ditemukan.', 'error');
            return;
        }

        draft = {
            id: found.id,
            problem_id: found.problem_id || '-',
            judul: found.judul || '',
            kronologi: found.kronologi || '',
            kategori_tim: found.kategori_tim || 'Network',
            perangkat: found.perangkat || '',
            resolution: found.resolution || '',
            problem_type: found.problem_type || '',
            detail_alert: {
                jam_muncul:   found.detail_alert?.jam_muncul   || '',
                jam_response: found.detail_alert?.jam_response || '',
                jam_solving:  found.detail_alert?.jam_solving  || '',
                root_cause:   found.detail_alert?.root_cause   || '',
                impact:       found.detail_alert?.impact       || '',
            },
            tasks: Array.isArray(found.tasks) ? found.tasks.map((t) => ({ ...t })) : [],
            status: found.status || 'Active',
            cancel_reason: found.cancel_reason || '',
            created_by: found.created_by || '-',
            created_at: found.created_at || '',
        };
    }

    fillFormFromDraft();
    resetTaskForm();
    switchTab('tabDetail');
    hideValidation();
    applyPermissions();

    draftBaseline = JSON.stringify(collectDraftFromForm());
    setPanelOpen(true);
}

function closePanel(force = false) {
    if (!force && isDirty()) {
        const leave = confirm('Ada perubahan yang belum disimpan. Tutup panel dan buang perubahan tersebut?');
        if (!leave) return;
    }

    setPanelOpen(false);
    draft = null;
    draftBaseline = null;
}

/* ==========================================================================
   8. SINKRONISASI DRAFT <-> FORM
   ========================================================================== */

function fillFormFromDraft() {
    const isNew = draft.id === null;

    // Header panel
    $('panelProblemId').textContent = isNew ? draft.problem_id + ' (baru)' : draft.problem_id;
    $('panelTitle').textContent = isNew ? 'Incident Baru' : (draft.judul || '(tanpa judul)');
    $('panelMeta').textContent =
        `Dibuat oleh ${isNew ? USER.name : draft.created_by} · ${formatDateTime(draft.created_at)}`;

    const badge = $('panelStatusBadge');
    badge.textContent = draft.status;
    badge.className = 'px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ' +
        (STATUS_STYLE[draft.status] || STATUS_STYLE.Active);

    // Tab A
    $('fJudul').value = stripJudulPrefix(draft.judul);
    $('fKronologi').value = draft.kronologi ||
        composeKronologi(buildJudulLengkap(''), draft.created_at, '');
    $('fKategoriTim').value = draft.kategori_tim;
    $('fPerangkat').value = draft.perangkat;
    $('fResolution').value = draft.resolution;
    $('fProblemType').value = draft.problem_type;

    // Tab B
    $('fJamMuncul').value = draft.detail_alert.jam_muncul;
    $('fJamResponse').value = draft.detail_alert.jam_response;
    $('fJamSolving').value = draft.detail_alert.jam_solving;
    $('fRootCause').value = draft.detail_alert.root_cause;
    $('fImpact').value = draft.detail_alert.impact;

    // Status & tombol simpan
    $('fStatus').value = draft.status;
    $('btnSaveLabel').textContent = isNew ? 'Terbitkan' : 'Simpan';

    // Alasan pembatalan hanya relevan bila incident dibatalkan
    if (draft.status === 'Cancelled' && draft.cancel_reason) {
        $('cancelReasonView').classList.remove('hidden');
        $('cancelReasonText').textContent = draft.cancel_reason;
    } else {
        $('cancelReasonView').classList.add('hidden');
    }

    renderTasks();
}

/** Baca seluruh field form menjadi objek payload. */
function collectDraftFromForm() {
    return {
        problem_id: draft.problem_id,
        judul: buildJudulLengkap($('fJudul').value),
        kronologi: $('fKronologi').value,
        kategori_tim: $('fKategoriTim').value,
        perangkat: $('fPerangkat').value.trim(),
        resolution: $('fResolution').value.trim(),
        problem_type: $('fProblemType').value,
        detail_alert: {
            jam_muncul:   $('fJamMuncul').value,
            jam_response: $('fJamResponse').value,
            jam_solving:  $('fJamSolving').value,
            root_cause:   $('fRootCause').value.trim(),
            impact:       $('fImpact').value.trim(),
        },
        tasks: draft.tasks.map((t) => ({ ...t })),
        status: draft.status,
        cancel_reason: draft.cancel_reason,
        created_by: draft.created_by,
        created_at: draft.created_at,
    };
}

function isDirty() {
    if (!draft || !draftBaseline) return false;
    return JSON.stringify(collectDraftFromForm()) !== draftBaseline;
}

/* ==========================================================================
   9. HAK AKSES: ROLE & KUNCI STATUS
   ========================================================================== */

const canEdit = () => draft && canEditIncident(USER.role, draft.status);

/**
 * Terapkan enable/disable seluruh kontrol panel sesuai role pengguna
 * dan status incident.
 */
function applyPermissions() {
    if (!draft) return;

    const editable = canEdit();
    const locked = isIncidentLocked(draft.status);

    // Tab A & B
    ['fJudul', 'fKronologi', 'fKategoriTim', 'fPerangkat',
     'fJamMuncul', 'fJamResponse', 'fJamSolving', 'fRootCause', 'fImpact']
        .forEach((id) => { $(id).disabled = !editable; });

    // Resolution & Problem Type terbuka hanya bila seluruh task completed
    const closureOpen = canFillClosureFields(USER.role, draft.status, draft.tasks);
    $('fResolution').disabled = !closureOpen;
    $('fProblemType').disabled = !closureOpen;
    $('closureHint').classList.toggle('hidden', !editable || closureOpen);

    // Form penambahan task
    ['fPicSearch', 'fTaskAction', 'btnAddTask'].forEach((id) => { $(id).disabled = !editable; });
    $('taskForm').classList.toggle('hidden', !editable);

    // Kontrol status & simpan
    $('fStatus').disabled = !editable;
    $('btnSavePanel').classList.toggle('hidden', !editable);

    // Banner informasi
    $('panelLockBadge').classList.toggle('hidden', !locked);
    $('panelLockBadge').classList.toggle('inline-flex', locked);

    $('lockedBox').classList.toggle('hidden', !locked);
    if (locked) {
        $('lockedMsg').textContent = draft.status === 'Resolved'
            ? 'Incident sudah berstatus Resolved. Seluruh data bersifat final dan tidak dapat diubah lagi.'
            : 'Incident sudah dibatalkan (Cancelled). Seluruh data bersifat final dan tidak dapat diubah lagi.';
    }

    $('staffBox').classList.toggle('hidden', IS_OPERATOR || locked);

    renderTasks();
}

/* ==========================================================================
   10. TAB C: ASSIGN TASK
   ========================================================================== */

function renderTasks() {
    const list = $('taskList');
    const tasks = draft ? draft.tasks : [];
    const done = tasks.filter((t) => t.status === 'completed').length;

    $('tabTaskCount').textContent = `(${tasks.length})`;
    $('taskProgress').textContent = `${done} / ${tasks.length} completed`;
    $('taskProgress').className = 'text-[10px] font-bold uppercase tracking-widest ' +
        (allTasksCompleted(tasks) ? 'text-emerald-400' : 'text-gray-500');

    if (!tasks.length) {
        list.innerHTML = `
            <div class="rounded-2xl border border-dashed border-[#2a2a2a] bg-[#0d0d0d] px-4 py-8 text-center">
                <iconify-icon icon="solar:clipboard-remove-linear" class="text-3xl text-gray-700 mb-2"></iconify-icon>
                <p class="text-xs text-gray-500">Belum ada task yang di-assign.</p>
                <p class="text-[10px] text-gray-600 mt-1">Minimal satu task harus completed sebelum incident dapat di-resolve.</p>
            </div>`;
        return;
    }

    const editable = canEdit();

    list.innerHTML = tasks.map((task, index) => {
        const flow = TASK_FLOW[task.status] || TASK_FLOW.assigned;
        const accent = task.status === 'completed'
            ? 'border-l-emerald-500'
            : (task.status === 'accepted' ? 'border-l-amber-500' : 'border-l-[#3a3a3a]');

        const advanceBtn = (editable && flow.next)
            ? `<button class="task-advance px-2.5 py-1.5 rounded-md bg-[rgb(var(--accent))] text-black text-[10px] font-bold uppercase tracking-wider hover:bg-white transition-colors duration-300 flex items-center gap-1"
                       data-index="${index}">
                   <iconify-icon icon="${flow.icon}"></iconify-icon> ${flow.label}
               </button>`
            : '';

        // Task yang masih "assigned" boleh dihapus supaya salah assign
        // tidak memblokir incident dari status Resolved secara permanen.
        const removeBtn = (editable && task.status === 'assigned')
            ? `<button class="task-remove px-2 py-1.5 rounded-md bg-[#1a1a1a] border border-[#333] text-gray-400 text-[10px] font-bold uppercase tracking-wider hover:text-rose-400 hover:border-rose-900 transition-colors duration-300"
                       data-index="${index}" title="Hapus task">
                   <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon>
               </button>`
            : '';

        return `
            <div class="rounded-xl border border-[#222] border-l-4 ${accent} bg-[#0d0d0d] p-4">
                <div class="flex items-start justify-between gap-3 mb-2.5">
                    <div class="min-w-0">
                        <p class="text-[10px] font-bold text-[rgb(var(--accent))] uppercase tracking-wider mb-1">
                            ${esc(task.pic_tim || '-')}
                        </p>
                        <p class="text-sm font-bold text-white truncate">${esc(task.pic_nama || '-')}</p>
                    </div>
                    <span class="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border shrink-0 ${TASK_STATUS_STYLE[task.status] || TASK_STATUS_STYLE.assigned}">
                        ${esc(task.status)}
                    </span>
                </div>

                <p class="text-xs text-gray-400 leading-relaxed mb-3 whitespace-pre-wrap">
                    <span class="text-gray-600 font-semibold">Action:</span> ${esc(task.action || '-')}
                </p>

                ${(advanceBtn || removeBtn) ? `<div class="flex items-center gap-2">${advanceBtn}${removeBtn}</div>` : ''}
            </div>`;
    }).join('');

    list.querySelectorAll('.task-advance').forEach((btn) => {
        btn.addEventListener('click', () => advanceTask(Number(btn.dataset.index)));
    });

    list.querySelectorAll('.task-remove').forEach((btn) => {
        btn.addEventListener('click', () => removeTask(Number(btn.dataset.index)));
    });
}

function renderPicResults(keyword) {
    const box = $('picResults');
    const matches = searchPic(keyword);

    if (!String(keyword ?? '').trim()) {
        box.classList.add('hidden');
        return;
    }

    if (!matches.length) {
        box.innerHTML = `<p class="px-3 py-3 text-xs text-gray-500">Tidak ada owner yang cocok.</p>`;
        box.classList.remove('hidden');
        return;
    }

    box.innerHTML = matches.map((p) => `
        <button type="button"
                class="pic-option w-full text-left px-3 py-2.5 hover:bg-[#1a1a1a] transition-colors duration-200 border-b border-[#1f1f1f] last:border-b-0"
                data-nama="${esc(p.nama)}" data-tim="${esc(p.tim)}">
            <span class="block text-sm text-white font-semibold">${esc(p.nama)}</span>
            <span class="block text-[10px] text-[rgb(var(--accent))] uppercase tracking-wider font-bold mt-0.5">${esc(p.tim)}</span>
        </button>
    `).join('');

    box.classList.remove('hidden');

    box.querySelectorAll('.pic-option').forEach((opt) => {
        opt.addEventListener('click', () => {
            selectedPic = { nama: opt.dataset.nama, tim: opt.dataset.tim };
            $('fPicNama').value = selectedPic.nama;
            $('fPicTim').value = selectedPic.tim;
            $('fPicSearch').value = selectedPic.nama;
            box.classList.add('hidden');
        });
    });
}

function resetTaskForm() {
    selectedPic = null;
    $('fPicSearch').value = '';
    $('fPicNama').value = '';
    $('fPicTim').value = '';
    $('fTaskAction').value = '';
    $('picResults').classList.add('hidden');
}

function addTask() {
    if (!canEdit()) return;

    if (!selectedPic) {
        window.showToast('Pilih owner terlebih dahulu melalui kolom pencarian.', 'error');
        $('fPicSearch').focus();
        return;
    }

    const action = $('fTaskAction').value.trim();
    if (!action) {
        window.showToast('Kolom Action wajib diisi.', 'error');
        $('fTaskAction').focus();
        return;
    }

    draft.tasks.push({
        pic_nama: selectedPic.nama,
        pic_tim: selectedPic.tim,
        action,
        status: 'assigned',
    });

    resetTaskForm();
    applyPermissions();
    window.showToast('Task ditambahkan. Tekan Simpan untuk menyimpan perubahan.', 'info');
}

function advanceTask(index) {
    if (!canEdit()) return;

    const task = draft.tasks[index];
    if (!task) return;

    const next = nextTaskStatus(task.status);
    if (!next) return;

    task.status = next;
    applyPermissions();
    window.showToast(`Task ${task.pic_nama} → ${next}.`, 'info');
}

function removeTask(index) {
    if (!canEdit()) return;

    const task = draft.tasks[index];
    if (!task || task.status !== 'assigned') return;

    if (!confirm(`Hapus task untuk ${task.pic_nama}?`)) return;

    draft.tasks.splice(index, 1);
    applyPermissions();
}

/* ==========================================================================
   11. BANNER VALIDASI
   ========================================================================== */

function hideValidation() {
    $('validationBox').classList.add('hidden');
}

function showValidation(items) {
    $('validationList').innerHTML = items.map((t) => `<li>${esc(t)}</li>`).join('');

    const box = $('validationBox');
    box.classList.remove('hidden');
    box.classList.add('animate-shake');
    setTimeout(() => box.classList.remove('animate-shake'), 600);

    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ==========================================================================
   12. PENYIMPANAN KE FIRESTORE
   ========================================================================== */

/**
 * Pastikan incident di server masih Active sebelum ditulis, sehingga incident
 * yang sudah final tidak dapat tertimpa (misalnya dari tab lain yang terbuka).
 */
async function assertServerStillActive(id) {
    const snap = await getDoc(doc(db, COLLECTION_NAME, id));

    if (!snap.exists()) throw new Error('Incident sudah tidak tersedia.');

    const serverStatus = snap.data().status || 'Active';
    if (isIncidentLocked(serverStatus)) {
        throw new Error(`Incident sudah berstatus ${serverStatus} dan tidak dapat diubah lagi.`);
    }
}

function setSaving(on, label) {
    const btn = $('btnSavePanel');
    btn.disabled = on;
    btn.classList.toggle('opacity-60', on);
    $('btnSaveLabel').textContent = on
        ? (label || 'Menyimpan...')
        : (draft?.id ? 'Simpan' : 'Terbitkan');
}

/**
 * Tulis draft ke Firestore.
 * @param {object} extra Field tambahan yang menimpa payload (mis. perubahan status)
 */
async function persistDraft(extra = {}) {
    const payload = { ...collectDraftFromForm(), ...extra };

    if (draft.id === null) {
        const created = await addDoc(incidentsRef, payload);
        draft.id = created.id;
    } else {
        await assertServerStillActive(draft.id);
        await updateDoc(doc(db, COLLECTION_NAME, draft.id), payload);
    }

    // Panel bisa saja sudah ditutup saat penulisan berlangsung
    if (!draft) return;

    // Selaraskan seluruh state lokal dengan yang baru tersimpan
    draft = mergeSavedPayload(draft, payload);

    fillFormFromDraft();
    applyPermissions();
    draftBaseline = JSON.stringify(collectDraftFromForm());
}

/** Simpan tanpa mengubah status (hanya selama incident masih Active). */
async function handleSave() {
    if (!canEdit()) return;

    if (isBlank($('fJudul').value)) {
        switchTab('tabDetail');
        window.showToast('Judul Alert wajib diisi.', 'error');
        $('fJudul').focus();
        return;
    }

    if (isBlank($('fPerangkat').value)) {
        switchTab('tabDetail');
        window.showToast('Perangkat / Service wajib diisi.', 'error');
        $('fPerangkat').focus();
        return;
    }

    const isNew = draft.id === null;

    try {
        setSaving(true);
        await persistDraft();
        window.showToast(isNew ? 'Incident berhasil diterbitkan.' : 'Perubahan berhasil disimpan.');
    } catch (error) {
        console.error('[myIncident] Gagal menyimpan:', error);
        window.showToast('Gagal menyimpan: ' + error.message, 'error');
    } finally {
        setSaving(false);
    }
}

/* ==========================================================================
   13. PERUBAHAN STATUS INCIDENT
   ========================================================================== */

async function handleStatusChange(nextStatus) {
    const revert = () => { $('fStatus').value = draft.status; };

    if (!canEdit()) { revert(); return; }
    if (nextStatus === draft.status) { hideValidation(); return; }

    // Incident baru harus tersimpan lebih dulu agar punya dokumen di Firestore
    if (draft.id === null) {
        revert();
        window.showToast('Terbitkan incident terlebih dahulu sebelum mengubah statusnya.', 'error');
        return;
    }

    if (nextStatus === 'Resolved') {
        const blockers = collectResolveBlockers(collectDraftFromForm());

        if (blockers.length) {
            revert();
            showValidation(blockers);
            window.showToast('Belum bisa di-resolve. Lengkapi dulu syarat yang ditandai.', 'error');
            return;
        }

        hideValidation();

        try {
            setSaving(true, 'Resolving...');
            await persistDraft({
                status: 'Resolved',
                resolved_by: USER.name,
                resolved_at: new Date().toISOString(),
            });
            window.showToast('Incident berhasil di-resolve dan kini terkunci permanen.');
        } catch (error) {
            console.error('[myIncident] Gagal resolve:', error);
            revert();
            window.showToast('Gagal mengubah status: ' + error.message, 'error');
        } finally {
            setSaving(false);
        }
        return;
    }

    if (nextStatus === 'Cancelled') {
        openCancelModal();
        return;
    }

    revert();
}

/* ==========================================================================
   14. MODAL PEMBATALAN
   ========================================================================== */

function openCancelModal() {
    const modal = $('cancelModal');

    $('fCancelReason').value = '';
    $('cancelReasonError').classList.add('hidden');

    modal.classList.remove('hidden');
    void modal.offsetWidth; // paksa reflow agar transisi berjalan
    modal.classList.remove('opacity-0');
    $('cancelModalBox').classList.remove('scale-95');

    setTimeout(() => $('fCancelReason').focus(), 150);
}

function closeCancelModal(revertStatus = true) {
    const modal = $('cancelModal');

    modal.classList.add('opacity-0');
    $('cancelModalBox').classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);

    if (revertStatus && draft) $('fStatus').value = draft.status;
}

async function confirmCancelIncident() {
    const { valid, reason } = validateCancelReason($('fCancelReason').value);

    if (!valid) {
        $('cancelReasonError').classList.remove('hidden');
        $('cancelModalBox').classList.add('animate-shake');
        setTimeout(() => $('cancelModalBox').classList.remove('animate-shake'), 600);
        return;
    }

    try {
        setSaving(true, 'Membatalkan...');
        await persistDraft({
            status: 'Cancelled',
            cancel_reason: reason,
            cancelled_by: USER.name,
            cancelled_at: new Date().toISOString(),
        });

        closeCancelModal(false);
        hideValidation();
        window.showToast('Incident dibatalkan dan kini terkunci permanen.');
    } catch (error) {
        console.error('[myIncident] Gagal membatalkan:', error);
        closeCancelModal(true);
        window.showToast('Gagal membatalkan: ' + error.message, 'error');
    } finally {
        setSaving(false);
    }
}

/* ==========================================================================
   15. EVENT LISTENER
   ========================================================================== */

function bindEvents() {
    // Buat incident baru (tombol hanya dirender untuk operator)
    const btnNew = $('btnNewIncident');
    if (btnNew) btnNew.addEventListener('click', () => openPanel(null));

    // Tutup panel
    $('btnClosePanel').addEventListener('click', () => closePanel());
    $('panelBackdrop').addEventListener('click', () => closePanel());

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;

        if (!$('cancelModal').classList.contains('hidden')) {
            closeCancelModal();
        } else if (document.body.classList.contains('panel-open')) {
            closePanel();
        }
    });

    // Navigasi tab
    document.querySelectorAll('.panel-tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Judul -> perbarui template kronologi & judul pada header panel
    $('fJudul').addEventListener('input', () => {
        refreshKronologiTemplate();
        $('panelTitle').textContent = buildJudulLengkap($('fJudul').value);
    });

    // Pencarian owner untuk task
    $('fPicSearch').addEventListener('input', (e) => {
        selectedPic = null;
        $('fPicNama').value = '';
        $('fPicTim').value = '';
        renderPicResults(e.target.value);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#picResults') && !e.target.closest('#fPicSearch')) {
            $('picResults').classList.add('hidden');
        }
    });

    $('btnAddTask').addEventListener('click', addTask);

    // Simpan & ubah status
    $('btnSavePanel').addEventListener('click', handleSave);
    $('fStatus').addEventListener('change', (e) => handleStatusChange(e.target.value));

    // Modal pembatalan
    $('btnCancelModalAbort').addEventListener('click', () => closeCancelModal(true));
    $('btnCancelModalConfirm').addEventListener('click', confirmCancelIncident);

    // Cegah kehilangan perubahan saat meninggalkan halaman
    window.addEventListener('beforeunload', (e) => {
        if (isDirty()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

/* ==========================================================================
   16. BOOTSTRAP
   ========================================================================== */

bindFilterChips();
bindEvents();
subscribeIncidents();

console.info(`[myIncident] Siap. Pengguna: ${USER.name} (${USER.role}).`);
