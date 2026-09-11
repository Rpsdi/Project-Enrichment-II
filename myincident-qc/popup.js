/**
 * ============================================================================
 *  myIncident QC — Popup_Settings
 * ============================================================================
 *  Tiga fungsi: mengatur ambang batas, mengambil ulang data secara manual, dan
 *  menampilkan daftar incident mandek terakhir.
 *
 *  Popup tidak memanggil Firestore sendiri. Permintaan diteruskan ke
 *  Background_Worker supaya hanya ada satu jalur pengambilan dan satu penulis
 *  Cache_Store.
 * ============================================================================
 */

(function bootPopup() {
    const { config, store, stall } = window.MQC;

    /** Batas entri yang ditampilkan pada daftar. */
    const MAX_ROWS = 20;

    const byId = (id) => document.getElementById(id);

    const ui = {
        headSub: byId('headSub'),
        threshold: byId('inpThreshold'),
        saveThreshold: byId('btnSaveThreshold'),
        thresholdMsg: byId('thresholdMsg'),
        factFetched: byId('factFetched'),
        factCount: byId('factCount'),
        factNetwork: byId('factNetwork'),
        refresh: byId('btnRefresh'),
        refreshMsg: byId('refreshMsg'),
        stalledCount: byId('stalledCount'),
        stalledMsg: byId('stalledMsg'),
        stalledList: byId('stalledList'),
    };

    const state = {
        thresholdMinutes: config.defaults.thresholdMinutes,
        incidents: [],
        fetchedAt: null,
        fromCache: false,
        fetchError: null,
        hasData: false,
    };

    /* ======================================================================
       1. UTILITAS
       ====================================================================== */

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function clear(node) {
        while (node.firstChild) node.removeChild(node.firstChild);
    }

    const cut = (value, max) => {
        const s = String(value ?? '');
        return s.length > max ? `${s.slice(0, max)}...` : s;
    };

    function shortDate(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '-';

        const p = (n) => String(n).padStart(2, '0');
        return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    /** Tulis pesan pada elemen dengan gaya sesuai jenisnya. */
    function say(node, text, kind = '') {
        node.className = `msg${kind ? ` ${kind}` : ''}`;
        node.textContent = text;
    }

    /** Kirim pesan ke Background_Worker. */
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

    /** True bila service worker belum mengenali kontrak pesan yang dikirim. */
    function isUnknownMessage(response, type) {
        return response?.ok === false &&
            String(response.error ?? '').includes(`Jenis pesan tidak dikenal: ${type}`);
    }

    /**
     * Baca status dengan kompatibilitas dua kontrak worker. Ini membuat popup
     * tetap dapat pulih ketika service worker lama masih hidup sesaat setelah
     * extension di-reload.
     */
    async function getStatusCompatible() {
        const legacy = await send({ type: 'MQC_GET_STATUS' });
        if (!isUnknownMessage(legacy, 'MQC_GET_STATUS')) return legacy;

        return send({ type: 'MQC_GET_STATE' });
    }

    /**
     * Ambil data terbaru. Kontrak lama memakai MQC_GET_DATA, sedangkan revisi
     * worker sebelumnya memakai MQC_RUN_MONITOR + MQC_GET_STATE.
     */
    async function getDataCompatible(force) {
        const legacy = await send({ type: 'MQC_GET_DATA', force });
        if (!isUnknownMessage(legacy, 'MQC_GET_DATA')) return legacy;

        const run = await send({ type: 'MQC_RUN_MONITOR', force });
        if (isUnknownMessage(run, 'MQC_RUN_MONITOR') || run?.ok === false && !run?.result) {
            return run;
        }

        if (Array.isArray(run?.incidents)) return run;

        const latest = await send({ type: 'MQC_GET_STATE' });
        return {
            ...run,
            incidents: Array.isArray(latest?.incidents) ? latest.incidents : [],
            fetchedAt: run?.fetchedAt ?? latest?.fetchedAt ?? null,
            fromCache: run?.fromCache ?? latest?.lastResult?.fromCache ?? false,
            error: run?.error ?? latest?.lastResult?.fetchError ?? null,
        };
    }

    /* ======================================================================
       2. TAMPILAN
       ====================================================================== */

    /** Perbarui blok fakta data & jaringan. */
    function renderFacts(network, notificationLevel) {
        ui.factFetched.textContent = state.fetchedAt
            ? `${shortDate(state.fetchedAt)}${state.fromCache ? ' (cache)' : ''}`
            : 'belum pernah';

        ui.factCount.textContent = state.hasData ? `${state.incidents.length} incident` : 'belum tersedia';

        const secondsLeft = network?.secondsLeft ?? 0;

        if (secondsLeft > 0) {
            ui.factNetwork.textContent = `tertunda ${secondsLeft} detik`;
        } else if (network?.failureStreak > 0) {
            ui.factNetwork.textContent = `${network.failureStreak} kegagalan berturut`;
        } else {
            ui.factNetwork.textContent = 'normal';
        }

        const notes = [];
        if (state.fromCache && state.fetchError) notes.push('Firestore tidak terjangkau, memakai cache.');
        if (secondsLeft > 0) notes.push(`Permintaan otomatis ditunda ${secondsLeft} detik.`);
        if (notificationLevel === 'denied') notes.push('Izin notifikasi desktop sedang ditolak.');

        if (notes.length > 0) {
            say(ui.refreshMsg, notes.join(' '), 'warn');
        } else {
            say(ui.refreshMsg, '');
        }
    }

    /** Aktifkan tab myIncident yang sudah terbuka. */
    async function focusAppTab(problemId) {
        try {
            const tabPatterns = (config.appOrigins ?? [config.appOrigin])
                .map((origin) => `${origin}/*`);
            const tabs = await chrome.tabs.query({ url: tabPatterns });

            if (tabs.length === 0) {
                say(
                    ui.stalledMsg,
                    `Buka halaman myIncident dulu agar pemantauan aktif (${problemId}).`,
                    'warn',
                );
                return;
            }

            await chrome.tabs.update(tabs[0].id, { active: true });
            await chrome.windows.update(tabs[0].windowId, { focused: true });
            window.close();
        } catch (error) {
            say(ui.stalledMsg, `Tidak dapat mengaktifkan tab: ${String(error?.message ?? error)}`, 'error');
        }
    }

    /** Gambar daftar incident mandek. */
    function renderStalled() {
        clear(ui.stalledList);

        if (!state.hasData) {
            ui.stalledCount.textContent = '0';
            say(ui.stalledMsg, 'Data incident belum tersedia. Coba ambil ulang dari Firestore.', 'warn');
            return;
        }

        const result = stall.runCheck(state.incidents, state.thresholdMinutes);
        const rows = result.stalled;

        ui.stalledCount.textContent = String(rows.length);
        ui.headSub.textContent =
            `${result.activeCount} incident Active | ambang ${state.thresholdMinutes} menit`;

        if (rows.length === 0) {
            say(
                ui.stalledMsg,
                result.activeCount === 0
                    ? 'Tidak ada incident berstatus Active.'
                    : 'Seluruh incident Active masih terpantau normal.',
                'ok',
            );
            return;
        }

        say(ui.stalledMsg, 'Klik satu entri untuk berpindah ke halaman myIncident.');

        rows.slice(0, MAX_ROWS).forEach((entry) => {
            const li = el('li');
            const btn = el('button', 'item');
            btn.type = 'button';

            const top = el('div', 'item-top');
            top.appendChild(el('span', 'item-pid', entry.problem_id));
            top.appendChild(el('span', 'item-min', `${entry.minutes} menit`));
            btn.appendChild(top);

            btn.appendChild(el('span', 'item-sub', cut(entry.judul, 80)));
            btn.appendChild(
                el(
                    'span',
                    'item-meta',
                    entry.refSource === 'created_at'
                        ? `${entry.perangkat} | belum ada baris HH:MM, acuan start time`
                        : `${entry.perangkat} | update terakhir ${shortDate(entry.refTime)}`,
                ),
            );

            btn.addEventListener('click', () => focusAppTab(entry.problem_id));

            li.appendChild(btn);
            ui.stalledList.appendChild(li);
        });

        if (rows.length > MAX_ROWS) {
            ui.stalledList.appendChild(
                el('li', 'msg', `${rows.length - MAX_ROWS} incident lainnya tidak ditampilkan.`),
            );
        }
    }

    /* ======================================================================
       3. AKSI
       ====================================================================== */

    /** Muat status dan data, lalu gambar seluruh tampilan. */
    async function load({ force = false } = {}) {
        const status = await getStatusCompatible();

        if (status?.ok) {
            state.thresholdMinutes = status.thresholdMinutes;
            ui.threshold.value = String(status.thresholdMinutes);
        }

        const data = await getDataCompatible(force);

        state.incidents = Array.isArray(data?.incidents) ? data.incidents : [];
        state.fetchedAt = data?.fetchedAt ?? null;
        state.fromCache = Boolean(data?.fromCache);
        state.fetchError = data?.error ?? null;
        state.hasData = Boolean(state.fetchedAt) || state.incidents.length > 0;

        renderFacts(status?.network, status?.notificationLevel);
        renderStalled();

        return data;
    }

    /** Simpan ambang batas baru. */
    async function saveThreshold() {
        const raw = ui.threshold.value.trim();

        // Tolak bentuk non-bilangan bulat sebelum menyentuh penyimpanan.
        if (!/^\d{1,4}$/.test(raw)) {
            say(ui.thresholdMsg, 'Masukkan bilangan bulat 1 sampai 1440 menit.', 'error');
            ui.threshold.value = String(state.thresholdMinutes);
            return;
        }

        const result = await store.setThreshold(Number(raw));

        if (!result.ok) {
            say(ui.thresholdMsg, result.error ?? 'Gagal menyimpan ambang batas.', 'error');
            ui.threshold.value = String(state.thresholdMinutes);
            return;
        }

        state.thresholdMinutes = result.value;
        say(ui.thresholdMsg, `Ambang batas tersimpan: ${result.value} menit.`, 'ok');
        renderStalled();
    }

    /** Ambil ulang data dari Firestore atas permintaan pengguna. */
    async function refresh() {
        ui.refresh.disabled = true;
        ui.refresh.textContent = 'Mengambil data...';
        say(ui.refreshMsg, 'Menghubungi Firestore...');

        try {
            const data = await load({ force: true });

            if (data?.ok === false) {
                const reason = data.timeout
                    ? 'permintaan melewati batas waktu'
                    : data.status
                        ? `HTTP ${data.status}`
                        : (data.error ?? 'penyebab tidak diketahui');

                say(ui.refreshMsg, `Pengambilan gagal: ${reason}. Data sebelumnya dipertahankan.`, 'error');
                return;
            }

            if (data?.truncated) {
                say(ui.refreshMsg, 'Data terpotong karena melewati batas pengambilan.', 'warn');
                return;
            }

            say(ui.refreshMsg, `Data diperbarui: ${state.incidents.length} incident.`, 'ok');
        } finally {
            ui.refresh.disabled = false;
            ui.refresh.textContent = 'Ambil ulang dari Firestore';
        }
    }

    /* ======================================================================
       4. PEMASANGAN
       ====================================================================== */

    ui.saveThreshold.addEventListener('click', saveThreshold);

    ui.threshold.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') saveThreshold();
    });

    ui.refresh.addEventListener('click', refresh);

    load().catch((error) => {
        say(ui.refreshMsg, `Gagal memuat status: ${String(error?.message ?? error)}`, 'error');
    });
})();
