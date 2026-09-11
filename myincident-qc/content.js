/**
 * ============================================================================
 *  myIncident QC — Content_Script
 * ============================================================================
 *  Satu-satunya pemicu pemantauan. Selama halaman myIncident terbuka, skrip ini
 *  menjalankan Check_Cycle secara berkala, menampilkan banner peringatan di
 *  halaman, meminta service worker menerbitkan notifikasi desktop, dan
 *  menawarkan autofill saat pengguna mengisi form incident.
 *
 *  Skrip ini hanya MENAMBAH elemen berprefix `mqc-`. Tidak ada elemen milik
 *  aplikasi myIncident yang dihapus atau diubah, kecuali penambahan kelas
 *  sorotan sementara pada kartu incident.
 *
 *  Seluruh nilai data disisipkan lewat `textContent`, tidak pernah `innerHTML`,
 *  karena isi incident berasal dari sumber eksternal.
 * ============================================================================
 */

(function bootQc() {
    const { config, stall, kronologi, autofill } = window.MQC;
    const LIMITS = config.limits;

    /**
     * QC Tools tetap diaktifkan pada seluruh halaman yang cocok dengan pola
     * host di manifest. Form-specific behavior tetap dorman bila elemennya
     * tidak ada, sehingga window monitoring juga terlihat di luar dashboard.
     */

    /* ======================================================================
       1. UTILITAS DOM
       ====================================================================== */

    const byId = (id) => document.getElementById(id);

    /**
     * Buat elemen dengan kelas dan teks. Teks selalu lewat textContent.
     * @param {string} tag Nama tag
     * @param {string} [className] Daftar kelas
     * @param {string} [text] Isi teks
     */
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    /** Kosongkan sebuah elemen. */
    function clear(node) {
        while (node.firstChild) node.removeChild(node.firstChild);
    }

    /** Potong teks panjang untuk tampilan. */
    const cut = (value, max) => {
        const s = String(value ?? '');
        return s.length > max ? `${s.slice(0, max)}...` : s;
    };

    /** Format ISO menjadi jam lokal HH:MM. */
    function hhmm(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '-';

        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    /** Format ISO menjadi tanggal ringkas dd/mm/yyyy HH:MM. */
    function shortDate(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '-';

        const p = (n) => String(n).padStart(2, '0');
        return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    /* ======================================================================
       2. JEMBATAN KE SERVICE WORKER
       ====================================================================== */

    /**
     * Kirim pesan ke Background_Worker. Kegagalan saluran dikembalikan sebagai
     * objek, bukan exception, supaya Check_Cycle tidak pernah putus.
     */
    function send(message) {
        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage(message, (response) => {
                    if (chrome.runtime.lastError) {
                        resolve({ ok: false, error: chrome.runtime.lastError.message });
                        return;
                    }

                    resolve(response ?? { ok: false, error: 'tidak ada balasan' });
                });
            } catch (error) {
                resolve({ ok: false, error: String(error?.message ?? error) });
            }
        });
    }

    /** True bila worker belum mengenali jenis pesan tertentu. */
    function isUnknownMessage(response, type) {
        return response?.ok === false &&
            String(response.error ?? '').includes(`Jenis pesan tidak dikenal: ${type}`);
    }

    /**
     * Ambil data dengan kompatibilitas kontrak worker lama dan baru. Hasil juga
     * menandai apakah worker sudah mengurus penyimpanan hasil/notifikasi.
     */
    async function getDataCompatible(force) {
        const legacy = await send({ type: 'MQC_GET_DATA', force });
        if (!isUnknownMessage(legacy, 'MQC_GET_DATA')) {
            return { data: legacy, workerManaged: false };
        }

        const run = await send({ type: 'MQC_RUN_MONITOR', force });
        if (isUnknownMessage(run, 'MQC_RUN_MONITOR') || run?.ok === false && !run?.result) {
            return { data: run, workerManaged: true };
        }

        if (Array.isArray(run?.incidents)) {
            return { data: run, workerManaged: true };
        }

        const latest = await send({ type: 'MQC_GET_STATE' });
        return {
            workerManaged: true,
            data: {
                ...run,
                incidents: Array.isArray(latest?.incidents) ? latest.incidents : [],
                templates: Array.isArray(run?.templates)
                    ? run.templates
                    : (Array.isArray(latest?.templates) ? latest.templates : []),
                fetchedAt: run?.fetchedAt ?? latest?.fetchedAt ?? null,
                fromCache: run?.fromCache ?? latest?.lastResult?.fromCache ?? false,
                error: run?.error ?? latest?.lastResult?.fetchError ?? null,
            },
        };
    }

    /** Baca Threshold_Minutes langsung dari penyimpanan (hanya baca). */
    async function readThreshold() {
        try {
            const data = await chrome.storage.local.get(config.storageKeys.threshold);
            const n = Number(data[config.storageKeys.threshold]);

            if (Number.isInteger(n) && n >= 1 && n <= 1440) return n;
        } catch {
            /* jatuh ke nilai bawaan */
        }

        return config.defaults.thresholdMinutes;
    }

    /* ======================================================================
       3. STATE
       ====================================================================== */

    const state = {
        incidents: [],
        resolvedTemplates: [],
        thresholdMinutes: config.defaults.thresholdMinutes,
        lastResult: null,
        source: { fetchedAt: null, fromCache: false, error: null },

        busy: false,
        /** Panel diringkas menjadi bilah tipis, bukan dihapus. */
        collapsed: false,
        /** Penyaring daftar: 'all' atau 'stalled'. */
        filter: 'all',
        /** Posisi floating window pada viewport, null berarti default kiri bawah. */
        dockPosition: null,
        /** State pointer saat header sedang diseret. */
        drag: null,
        /** Pesan sementara pada panel, mis. kartu tidak ditemukan. */
        notice: '',

        highlightTimer: null,
        autofillTimer: null,
        candidates: [],
        selectedCandidate: null,
    };

    /* ======================================================================
       4. PANEL PEMANTAUAN DI HALAMAN
       ====================================================================== */

    const DOCK_ID = 'mqc-dock-root';

    /**
     * Panel ini sengaja selalu ada selama halaman myIncident terbuka. Pengguna
     * dapat meringkasnya menjadi bilah tipis, tetapi tidak menghapusnya, supaya
     * daftar pantauan tetap terlihat tanpa perlu membuka popup extension.
     *
     * Wadahnya dipasang langsung pada body, di luar #incidentGrid, sehingga
     * tidak ikut terhapus saat myIncident merender ulang kartu.
     */
    function dockRoot() {
        let root = byId(DOCK_ID);
        if (root) return root;

        root = el('div', 'mqc-root mqc-dock');
        root.id = DOCK_ID;
        root.setAttribute('role', 'region');
        root.setAttribute('aria-label', 'Pemantauan QC incident');
        document.body.appendChild(root);

        return root;
    }

    /** Bersihkan sorotan pada seluruh kartu. */
    function clearHighlight() {
        document.querySelectorAll('.mqc-highlight').forEach((n) => n.classList.remove('mqc-highlight'));

        if (state.highlightTimer) {
            clearTimeout(state.highlightTimer);
            state.highlightTimer = null;
        }
    }

    /**
     * Sorot kartu incident pada #incidentGrid dan gulirkan ke area tampak.
     * @param {object} entry Satu baris pantauan
     */
    function highlightCard(entry) {
        clearHighlight();

        const card = entry.id
            ? document.querySelector(`#incidentGrid .incident-card[data-id="${CSS.escape(entry.id)}"]`)
            : null;

        if (!card) {
            state.notice =
                `${entry.problem_id} tidak tampil pada filter dashboard saat ini. Pilih chip "All".`;
            renderDock();
            return;
        }

        state.notice = '';
        card.classList.add('mqc-highlight');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });

        state.highlightTimer = setTimeout(clearHighlight, 5000);
        renderDock();
    }

    /** Pastikan posisi panel selalu berada di dalam viewport. */
    function clampDockPosition(position, root = dockRoot()) {
        if (!position || !Number.isFinite(position.left) || !Number.isFinite(position.top)) {
            return null;
        }

        const margin = 8;
        const maxLeft = Math.max(margin, window.innerWidth - root.offsetWidth - margin);
        const maxTop = Math.max(margin, window.innerHeight - root.offsetHeight - margin);

        return {
            left: Math.min(Math.max(position.left, margin), maxLeft),
            top: Math.min(Math.max(position.top, margin), maxTop),
        };
    }

    /** Terapkan posisi tersimpan tanpa memengaruhi panel autofill. */
    function applyDockPosition() {
        if (!state.dockPosition) return;

        const root = dockRoot();
        const safe = clampDockPosition(state.dockPosition, root);
        if (!safe) return;

        state.dockPosition = safe;
        root.style.left = `${safe.left}px`;
        root.style.top = `${safe.top}px`;
        root.style.right = 'auto';
        root.style.bottom = 'auto';
    }

    /** Terapkan ulang setelah ukuran panel berubah karena render/collapse. */
    function settleDockPosition() {
        if (!state.dockPosition) return;
        requestAnimationFrame(applyDockPosition);
    }

    /** Simpan preferensi tampilan panel. */
    async function saveDockPrefs() {
        try {
            await chrome.storage.local.set({
                [config.storageKeys.dockCollapsed]: state.collapsed,
                [config.storageKeys.dockFilter]: state.filter,
                [config.storageKeys.dockPosition]: state.dockPosition,
            });
        } catch {
            /* preferensi tampilan bukan data kritis */
        }
    }

    /** Muat preferensi tampilan panel. */
    async function loadDockPrefs() {
        try {
            const data = await chrome.storage.local.get([
                config.storageKeys.dockCollapsed,
                config.storageKeys.dockFilter,
                config.storageKeys.dockPosition,
            ]);

            state.collapsed = Boolean(data[config.storageKeys.dockCollapsed]);
            state.filter = data[config.storageKeys.dockFilter] === 'stalled' ? 'stalled' : 'all';

            const stored = data[config.storageKeys.dockPosition];
            state.dockPosition = stored &&
                Number.isFinite(stored.left) && Number.isFinite(stored.top)
                ? { left: stored.left, top: stored.top }
                : null;
        } catch {
            /* pakai nilai bawaan */
        }
    }

    /**
     * Aktifkan drag pada header QC Tools. Kontrol di dalam header tetap dapat
     * diklik karena pointerdown pada button/input/link sengaja diabaikan.
     */
    function wireDockDrag(head) {
        head.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || event.isPrimary === false) return;
            if (event.target.closest('button, input, select, textarea, a, label')) return;

            const root = dockRoot();
            const rect = root.getBoundingClientRect();

            state.drag = {
                pointerId: event.pointerId,
                offsetX: event.clientX - rect.left,
                offsetY: event.clientY - rect.top,
            };

            state.dockPosition = { left: rect.left, top: rect.top };
            applyDockPosition();

            head.classList.add('mqc-dragging');
            head.setPointerCapture(event.pointerId);
            event.preventDefault();
        });

        head.addEventListener('pointermove', (event) => {
            if (!state.drag || state.drag.pointerId !== event.pointerId) return;

            state.dockPosition = clampDockPosition({
                left: event.clientX - state.drag.offsetX,
                top: event.clientY - state.drag.offsetY,
            });
            applyDockPosition();
        });

        const finish = (event) => {
            if (!state.drag || state.drag.pointerId !== event.pointerId) return;

            state.drag = null;
            head.classList.remove('mqc-dragging');

            if (head.hasPointerCapture(event.pointerId)) {
                head.releasePointerCapture(event.pointerId);
            }

            saveDockPrefs();
        };

        head.addEventListener('pointerup', finish);
        head.addEventListener('pointercancel', finish);
    }

    /** Bilah kepala panel, sama untuk keadaan ringkas maupun terbuka. */
    function buildHead(stalledCount) {
        const head = el('div', 'mqc-head mqc-drag-handle');
        head.title = 'Tahan dan geser untuk memindahkan QC Tools';

        head.appendChild(el('span', 'mqc-grip', '\u2807'));
        head.appendChild(el('span', stalledCount > 0 ? 'mqc-dot mqc-dot-alert' : 'mqc-dot'));
        head.appendChild(el('h2', 'mqc-title', 'QC Tools'));

        const badge = el(
            'span',
            stalledCount > 0 ? 'mqc-count mqc-count-alert' : 'mqc-count mqc-count-ok',
            stalledCount > 0 ? `${stalledCount} mandek` : 'aman',
        );
        head.appendChild(badge);

        const refresh = el('button', 'mqc-iconbtn', '\u27f3');
        refresh.type = 'button';
        refresh.title = 'Ambil ulang data sekarang';
        refresh.setAttribute('aria-label', 'Ambil ulang data incident');
        refresh.addEventListener('click', () => {
            refresh.disabled = true;
            runCycle({ force: true }).finally(() => {
                refresh.disabled = false;
            });
        });
        head.appendChild(refresh);

        const toggle = el('button', 'mqc-iconbtn', state.collapsed ? '\u2b06' : '\u2b07');
        toggle.type = 'button';
        toggle.title = state.collapsed ? 'Tampilkan daftar' : 'Ringkas panel';
        toggle.setAttribute('aria-expanded', String(!state.collapsed));
        toggle.setAttribute('aria-label', state.collapsed ? 'Tampilkan daftar' : 'Ringkas panel');
        toggle.addEventListener('click', () => {
            state.collapsed = !state.collapsed;
            saveDockPrefs();
            renderDock();
        });
        head.appendChild(toggle);

        wireDockDrag(head);
        return head;
    }

    /** Bilah penyaring: seluruh incident Active atau hanya yang mandek. */
    function buildToolbar(result) {
        const bar = el('div', 'mqc-toolbar');

        const mk = (value, label) => {
            const btn = el('button', `mqc-chip${state.filter === value ? ' mqc-chip-on' : ''}`, label);
            btn.type = 'button';
            btn.setAttribute('aria-pressed', String(state.filter === value));
            btn.addEventListener('click', () => {
                state.filter = value;
                saveDockPrefs();
                renderDock();
            });
            return btn;
        };

        bar.appendChild(mk('all', `Semua ${result.monitored.length}`));
        bar.appendChild(mk('stalled', `Mandek ${result.stalled.length}`));
        bar.appendChild(el('span', 'mqc-toolbar-note', `ambang ${state.thresholdMinutes}m`));

        return bar;
    }

    /** Satu baris incident pada daftar pantauan. */
    function buildRow(entry) {
        const li = el('li');
        const btn = el('button', `mqc-item${entry.stalled ? ' mqc-item-alert' : ''}`);
        btn.type = 'button';

        const top = el('div', 'mqc-item-top');
        top.appendChild(el('span', 'mqc-pid', entry.problem_id));

        if (!entry.assessable) {
            top.appendChild(el('span', 'mqc-min mqc-min-unknown', 'tak terbaca'));
        } else {
            top.appendChild(
                el(
                    'span',
                    entry.stalled ? 'mqc-min' : 'mqc-min mqc-min-ok',
                    `${entry.minutes} menit`,
                ),
            );
        }

        btn.appendChild(top);
        btn.appendChild(el('span', 'mqc-sub', cut(entry.judul, 80)));

        let meta;

        if (!entry.assessable) {
            meta = `${entry.perangkat} | ${entry.reason}`;
        } else if (entry.refSource === 'created_at') {
            meta = `${entry.perangkat} | belum ada baris HH:MM, acuan start time ${hhmm(entry.refTime)}`;
        } else {
            meta = `${entry.perangkat} | update terakhir ${hhmm(entry.refTime)}`;
        }

        btn.appendChild(el('span', 'mqc-meta', meta));
        btn.addEventListener('click', () => highlightCard(entry));

        li.appendChild(btn);
        return li;
    }

    /**
     * Gambar ulang panel pantauan. Dipanggil setiap Check_Cycle dan setiap kali
     * pengguna mengubah penyaring atau meringkas panel.
     */
    function renderDock() {
        const result = state.lastResult;
        const root = dockRoot();

        clear(root);
        root.classList.toggle('mqc-dock-collapsed', state.collapsed);

        const stalledCount = result?.stalled.length ?? 0;
        const card = el('div', 'mqc-card');
        card.appendChild(buildHead(stalledCount));

        // Keadaan ringkas hanya menampilkan bilah kepala.
        if (state.collapsed) {
            root.appendChild(card);
            settleDockPosition();
            return;
        }

        if (!result) {
            card.appendChild(el('div', 'mqc-empty', 'Menyiapkan data incident...'));
            root.appendChild(card);
            settleDockPosition();
            return;
        }

        card.appendChild(buildToolbar(result));

        const rows = state.filter === 'stalled' ? result.stalled : result.monitored;
        const body = el('div', 'mqc-body');

        if (rows.length === 0) {
            body.appendChild(
                el(
                    'div',
                    'mqc-empty',
                    state.filter === 'stalled'
                        ? 'Tidak ada incident mandek. Seluruh incident Active masih terpantau normal.'
                        : 'Belum ada incident berstatus Active untuk dipantau.',
                ),
            );
        } else {
            const list = el('ul', 'mqc-list');
            rows.slice(0, LIMITS.dockMaxEntries).forEach((entry) => list.appendChild(buildRow(entry)));
            body.appendChild(list);

            const hidden = rows.length - LIMITS.dockMaxEntries;
            if (hidden > 0) {
                body.appendChild(el('p', 'mqc-note', `${hidden} incident lainnya tidak ditampilkan.`));
            }
        }

        if (state.notice) body.appendChild(el('p', 'mqc-note', state.notice));

        card.appendChild(body);
        card.appendChild(el('div', 'mqc-foot', sourceLine()));

        root.appendChild(card);
        settleDockPosition();
    }

    /** Baris keterangan sumber data untuk kaki panel. */
    function sourceLine() {
        const { fetchedAt, fromCache, error } = state.source;

        if (!fetchedAt) return 'Data belum pernah diambil | geser header untuk memindahkan';

        const ageMin = Math.max(0, Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 60000));
        const parts = [
            fromCache
                ? `cache lokal ${hhmm(fetchedAt)} (${ageMin} menit lalu)`
                : `Firestore ${hhmm(fetchedAt)}`,
        ];

        if (fromCache && error) parts.push('Firestore tidak terjangkau');

        return parts.join(' | ');
    }

    /* ======================================================================
       5. PANEL AUTOFILL
       ====================================================================== */

    const AUTOFILL_ID = 'mqc-autofill-root';

    /** Definisi field aman. PIC, tim PIC, dan status task sengaja tidak ada. */
    const AUTOFILL_FIELDS = [
        { key: 'kategori_tim', inputId: 'fKategoriTim', label: 'Kategori Tim', event: 'change' },
        { key: 'kronologi', inputId: 'fKronologi', label: 'Kronologi', kronologi: true },
        { key: 'root_cause', inputId: 'fRootCause', label: 'Root Cause' },
        { key: 'impact', inputId: 'fImpact', label: 'Impact' },
        { key: 'resolution', inputId: 'fResolution', label: 'Resolution', allowDisabled: true },
        {
            key: 'problem_type',
            inputId: 'fProblemType',
            label: 'Problem Type',
            event: 'change',
            allowDisabled: true,
        },
        { key: 'task_action', inputId: 'fTaskAction', label: 'Task Action (opsional)' },
    ];

    /** True bila panel incident sedang terbuka. */
    const panelOpen = () => document.body.classList.contains('panel-open');

    /** Status incident yang sedang dibuka. */
    const openStatus = () => String(byId('fStatus')?.value ?? '').trim();

    /** problem_id incident yang sedang dibuka, tanpa penanda "(baru)". */
    function openProblemId() {
        const raw = String(byId('panelProblemId')?.textContent ?? '').trim();
        return raw.replace(/\s*\(baru\)\s*$/i, '');
    }

    function removeAutofill() {
        const root = byId(AUTOFILL_ID);
        if (root) root.remove();
        state.selectedCandidate = null;
    }

    function autofillRoot() {
        const tabDetail = byId('tabDetail');
        const mount = tabDetail?.parentElement;
        if (!mount) return null;

        let root = byId(AUTOFILL_ID);
        if (!root) {
            root = el('div', 'mqc-root mqc-autofill mqc-autofill-embedded');
            root.id = AUTOFILL_ID;
            root.setAttribute('role', 'complementary');
            root.setAttribute('aria-label', 'Usulan autofill dari incident sebelumnya');
        }

        // Panel menjadi bagian dari area scroll form, tepat sebelum tab detail.
        if (root.parentElement !== mount || root.nextElementSibling !== tabDetail) {
            mount.insertBefore(root, tabDetail);
        }

        return root;
    }

    /** Isi form saat ini sebagai konteks pencocokan. */
    function formContext() {
        return {
            perangkat: byId('fPerangkat')?.value ?? '',
            judul: byId('fJudul')?.value ?? '',
            kategoriTim: byId('fKategoriTim')?.value ?? '',
        };
    }

    /** Nilai yang akan ditulis ke sebuah field bila autofill diterapkan. */
    function targetValue(field, candidate) {
        const raw = candidate.values[field.key];
        if (!raw) return '';

        if (field.kronologi) {
            return kronologi.replaceNarasi(byId('fKronologi')?.value ?? '', raw);
        }

        return raw;
    }

    /** Isi field saat ini, khusus kronologi hanya bagian narasinya. */
    function currentText(field) {
        const node = byId(field.inputId);
        if (!node) return '';

        return field.kronologi ? kronologi.narasiOf(node.value) : String(node.value ?? '').trim();
    }

    /** Gambar daftar kandidat. */
    function renderCandidates() {
        const root = autofillRoot();
        if (!root) return;
        clear(root);

        const card = el('div', 'mqc-card');

        const head = el('div', 'mqc-head');
        head.appendChild(el('span', 'mqc-dot'));
        head.appendChild(el('h2', 'mqc-title', 'Hasil search template Resolved'));
        head.appendChild(el('span', 'mqc-count', String(state.candidates.length)));

        const close = el('button', 'mqc-iconbtn', '\u00d7');
        close.type = 'button';
        close.setAttribute('aria-label', 'Tutup usulan autofill');
        close.addEventListener('click', removeAutofill);
        head.appendChild(close);
        card.appendChild(head);

        const body = el('div', 'mqc-body');
        const list = el('ul', 'mqc-list');

        state.candidates.forEach((candidate) => {
            const li = el('li');
            const btn = el('button', 'mqc-item');
            btn.type = 'button';

            const top = el('div', 'mqc-item-top');
            top.appendChild(el('span', 'mqc-pid', candidate.problem_id));

            if (candidate.matchPerangkat) {
                top.appendChild(el('span', 'mqc-min', 'perangkat sama'));
            }

            btn.appendChild(top);
            btn.appendChild(el('span', 'mqc-sub', cut(candidate.judul, 80)));
            btn.appendChild(
                el(
                    'span',
                    'mqc-meta',
                    `${candidate.perangkat || 'tanpa perangkat'} | ${shortDate(candidate.created_at)}`,
                ),
            );

            btn.addEventListener('click', () => {
                state.selectedCandidate = candidate;
                renderPreview();
            });

            li.appendChild(btn);
            list.appendChild(li);
        });

        body.appendChild(list);
        card.appendChild(body);
        card.appendChild(
            el(
                'div',
                'mqc-foot',
                'Hasil dicari dari title incident Resolved. Pilih template untuk melihat autofill.',
            ),
        );

        root.appendChild(card);
    }

    /** Gambar pratinjau nilai kandidat terpilih beserta kendali per field. */
    function renderPreview() {
        const candidate = state.selectedCandidate;
        if (!candidate) return;

        const root = autofillRoot();
        if (!root) return;
        clear(root);

        const card = el('div', 'mqc-card');

        const head = el('div', 'mqc-head');
        head.appendChild(el('span', 'mqc-dot'));
        head.appendChild(el('h2', 'mqc-title', `Pratinjau ${candidate.problem_id}`));

        const back = el('button', 'mqc-iconbtn', '\u2039');
        back.type = 'button';
        back.title = 'Kembali ke daftar';
        back.setAttribute('aria-label', 'Kembali ke daftar kandidat');
        back.addEventListener('click', () => {
            state.selectedCandidate = null;
            renderCandidates();
        });
        head.appendChild(back);

        const close = el('button', 'mqc-iconbtn', '\u00d7');
        close.type = 'button';
        close.setAttribute('aria-label', 'Tutup usulan autofill');
        close.addEventListener('click', removeAutofill);
        head.appendChild(close);
        card.appendChild(head);

        const preview = el('div', 'mqc-preview');
        const rows = [];

        AUTOFILL_FIELDS.forEach((field) => {
            const node = byId(field.inputId);
            const value = candidate.values[field.key];

            const box = el('div', 'mqc-field');
            const fieldHead = el('div', 'mqc-field-head');

            const check = el('input', 'mqc-check');
            check.type = 'checkbox';
            check.id = `mqc-chk-${field.key}`;

            const label = el('label', 'mqc-field-name', field.label);
            label.setAttribute('for', check.id);

            let tag = null;
            let selectable = true;
            const current = currentText(field);
            const canFillWhileDisabled = Boolean(
                node?.disabled && field.allowDisabled && openStatus() === 'Active',
            );
            const optionAvailable = !node || node.tagName !== 'SELECT' ||
                Array.from(node.options).some((option) => option.value === String(value ?? ''));

            if (!node) {
                selectable = false;
                tag = el('span', 'mqc-tag mqc-tag-skip', 'field tidak ada');
            } else if (node.readOnly || node.disabled && !canFillWhileDisabled) {
                selectable = false;
                tag = el('span', 'mqc-tag mqc-tag-skip', 'terkunci');
            } else if (!value) {
                selectable = false;
                tag = el('span', 'mqc-tag mqc-tag-skip', 'kandidat kosong');
            } else if (!optionAvailable) {
                selectable = false;
                tag = el('span', 'mqc-tag mqc-tag-skip', 'opsi tidak tersedia');
            } else if (current) {
                // Field berisi teks pengguna hanya dipilih bila pengguna mencentangnya.
                tag = el('span', 'mqc-tag mqc-tag-warn', 'akan menimpa');
            } else if (canFillWhileDisabled) {
                tag = el('span', 'mqc-tag', 'disiapkan untuk resolve');
            }

            check.disabled = !selectable;
            check.checked = selectable && !current;

            fieldHead.appendChild(check);
            fieldHead.appendChild(label);
            if (tag) fieldHead.appendChild(tag);
            box.appendChild(fieldHead);

            box.appendChild(el('p', 'mqc-value', value ? cut(value, 200) : '(tidak tersedia)'));
            preview.appendChild(box);

            rows.push({ field, check, selectable });
        });

        card.appendChild(preview);

        const summary = el('p', 'mqc-note', '');

        const actions = el('div', 'mqc-actions');
        const apply = el('button', 'mqc-btn mqc-btn-primary', 'Terapkan');
        apply.type = 'button';
        apply.addEventListener('click', () => {
            const chosen = rows.filter((row) => row.selectable && row.check.checked);

            if (chosen.length === 0) {
                summary.textContent = 'Belum ada field yang dipilih.';
                return;
            }

            const applied = [];
            const skipped = [];

            chosen.forEach((row) => {
                const node = byId(row.field.inputId);
                const canFillWhileDisabled = Boolean(
                    node?.disabled && row.field.allowDisabled && openStatus() === 'Active',
                );

                if (!node || node.readOnly || node.disabled && !canFillWhileDisabled) {
                    skipped.push(row.field.label);
                    return;
                }

                node.value = targetValue(row.field, candidate);
                const eventType = row.field.event || 'input';
                node.dispatchEvent(new Event(eventType, { bubbles: true }));
                applied.push(row.field.label);
            });

            const parts = [];
            if (applied.length) parts.push(`Terisi: ${applied.join(', ')}.`);
            if (skipped.length) parts.push(`Dilewati: ${skipped.join(', ')}.`);
            parts.push('Tekan Simpan pada panel untuk menyimpan.');
            summary.textContent = parts.join(' ');
        });

        const cancel = el('button', 'mqc-btn', 'Tutup');
        cancel.type = 'button';
        cancel.addEventListener('click', removeAutofill);

        actions.appendChild(apply);
        actions.appendChild(cancel);
        card.appendChild(actions);
        card.appendChild(summary);

        root.appendChild(card);
    }

    /** Evaluasi ulang usulan autofill berdasarkan isi form terkini. */
    function refreshAutofill() {
        // Panel tertutup, incident sudah final, atau template belum ada: tidak ada usulan.
        if (!panelOpen() || openStatus() !== 'Active' || state.resolvedTemplates.length === 0) {
            removeAutofill();
            return;
        }

        const candidates = autofill.findSimilar(state.resolvedTemplates, formContext(), {
            excludeProblemId: openProblemId(),
            // Mode search: tampilkan seluruh template Resolved yang cocok.
            limit: state.resolvedTemplates.length,
        });

        if (candidates.length === 0) {
            removeAutofill();
            return;
        }

        const sameSet =
            state.candidates.length === candidates.length &&
            state.candidates.every((row, i) => row.id === candidates[i].id);

        state.candidates = candidates;

        // Jangan ganggu pratinjau yang sedang dibaca bila kandidat tidak berubah.
        if (sameSet && state.selectedCandidate) return;

        state.selectedCandidate = null;
        renderCandidates();
    }

    /** Jadwalkan refreshAutofill dengan debounce. */
    function scheduleAutofill() {
        if (state.autofillTimer) clearTimeout(state.autofillTimer);
        state.autofillTimer = setTimeout(refreshAutofill, LIMITS.autofillDebounceMs);
    }

    /* ======================================================================
       6. CHECK CYCLE
       ====================================================================== */

    /**
     * Jalankan satu Check_Cycle. Siklus yang bertumpuk dilewati supaya hasil
     * terakhir tidak tertimpa oleh siklus yang belum tuntas.
     */
    async function runCycle(options = {}) {
        if (state.busy) return;
        state.busy = true;

        try {
            state.thresholdMinutes = await readThreshold();

            const { data, workerManaged } = await getDataCompatible(Boolean(options.force));
            const incidents = Array.isArray(data?.incidents) ? data.incidents : [];
            let templates = Array.isArray(data?.templates) ? data.templates : null;

            // Kompatibilitas untuk worker lama yang belum menyertakan templates.
            if (!templates) {
                try {
                    const stored = await chrome.storage.local.get(config.storageKeys.resolvedTemplates);
                    const value = stored[config.storageKeys.resolvedTemplates];
                    templates = Array.isArray(value) ? value : [];
                } catch {
                    templates = [];
                }
            }

            state.incidents = incidents;
            state.resolvedTemplates = templates;
            state.source = {
                fetchedAt: data?.fetchedAt ?? null,
                fromCache: Boolean(data?.fromCache),
                error: data?.error ?? null,
            };

            const result = stall.runCheck(incidents, state.thresholdMinutes);
            state.lastResult = result;
            state.notice = '';

            renderDock();
            refreshAutofill();

            // Worker kontrak lama hanya menyediakan data, jadi content script
            // menyimpan hasil dan meminta notifikasi. Worker kontrak baru sudah
            // mengerjakan dua hal itu sendiri.
            if (!workerManaged) {
                await send({
                    type: 'MQC_SAVE_RESULT',
                    result: {
                        ...result,
                        fetchedAt: state.source.fetchedAt,
                        fromCache: state.source.fromCache,
                        fetchError: state.source.error,
                    },
                });

                if (result.stalled.length > 0) {
                    await send({
                        type: 'MQC_NOTIFY',
                        items: result.stalled.map((row) => ({
                            key: row.key,
                            problem_id: row.problem_id,
                            judul: row.judul,
                            minutes: row.minutes,
                        })),
                    });
                }
            }
        } catch (error) {
            console.warn('[myIncident QC] Check_Cycle gagal:', error);
            state.notice = 'Pemeriksaan terakhir gagal. Coba tombol ambil ulang.';
            renderDock();
        } finally {
            state.busy = false;
        }
    }

    /* ======================================================================
       7. PEMASANGAN
       ====================================================================== */

    let intervalId = null;

    function startSchedule() {
        if (intervalId !== null) return;
        intervalId = setInterval(runCycle, LIMITS.checkIntervalMs);
    }

    function stopSchedule() {
        if (intervalId === null) return;
        clearInterval(intervalId);
        intervalId = null;
    }

    /** Pemicu autofill: perangkat, judul, dan kategori tim. */
    function wireAutofillTriggers() {
        byId('fPerangkat')?.addEventListener('input', scheduleAutofill);
        byId('fJudul')?.addEventListener('input', scheduleAutofill);
        byId('fKategoriTim')?.addEventListener('change', scheduleAutofill);
        byId('fStatus')?.addEventListener('change', scheduleAutofill);

        // Panel yang ditutup atau berganti incident harus mengosongkan usulan.
        const observer = new MutationObserver(() => {
            if (!panelOpen()) {
                removeAutofill();
                return;
            }

            scheduleAutofill();
        });

        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    /** Perubahan ambang atau library template langsung diterapkan. */
    function wireThresholdSync() {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;

            if (config.storageKeys.resolvedTemplates in changes) {
                const value = changes[config.storageKeys.resolvedTemplates]?.newValue;
                state.resolvedTemplates = Array.isArray(value) ? value : [];
                scheduleAutofill();
            }

            if (config.storageKeys.threshold in changes) runCycle();
        });
    }

    /** Hentikan penjadwalan saat halaman ditinggalkan. */
    function wireLifecycle() {
        window.addEventListener('pagehide', stopSchedule);
        window.addEventListener('resize', () => {
            if (!state.dockPosition) return;
            state.dockPosition = clampDockPosition(state.dockPosition);
            applyDockPosition();
            saveDockPrefs();
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) return;

            // Kembali ke tab: segarkan agar selisih menit tidak basi.
            runCycle();
        });
    }

    /** Panel harus bertahan walau ada skrip lain yang mengubah body. */
    function wireDockPersistence() {
        const observer = new MutationObserver(() => {
            if (!byId(DOCK_ID)) renderDock();
        });

        observer.observe(document.body, { childList: true });
    }

    (async function start() {
        await loadDockPrefs();

        // Gambar panel lebih dulu supaya langsung terlihat tanpa menunggu data.
        renderDock();

        wireDockPersistence();
        wireAutofillTriggers();
        wireThresholdSync();
        wireLifecycle();
        startSchedule();

        // Jalankan sekali tanpa menunggu jadwal 60 detik berikutnya.
        setTimeout(runCycle, 800);

        console.info('[myIncident QC] panel pemantauan aktif pada halaman myIncident.');
    })();
})();
