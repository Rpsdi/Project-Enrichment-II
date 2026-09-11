/**
 * ============================================================================
 *  myIncident QC — Cache_Store
 * ============================================================================
 *  Pembungkus tipis di atas chrome.storage.local. Dipakai oleh service worker
 *  dan popup. Content script tidak menulis cache secara langsung, melainkan
 *  meminta service worker melakukannya, supaya hanya ada satu penulis.
 * ============================================================================
 */

(function attachStore(root) {
    const MQC = (root.MQC = root.MQC || {});
    const { storageKeys: KEY, defaults, limits } = MQC.config;

    /** Ambang perawatan ukuran cache, dalam byte. */
    const MAINTENANCE_BYTES = 4 * 1024 * 1024;

    const area = () => chrome.storage.local;

    /** Baca beberapa kunci sekaligus. */
    async function readAll(keys) {
        return area().get(keys);
    }

    /** Tulis beberapa kunci sekaligus, mengembalikan status keberhasilan. */
    async function write(patch) {
        try {
            await area().set(patch);
            return { ok: true };
        } catch (error) {
            // Kegagalan kuota tidak boleh menghentikan pemeriksaan.
            return { ok: false, error: String(error?.message ?? error) };
        }
    }

    /* ---------------------------------------------------------------------- */
    /*  Ambang batas                                                          */
    /* ---------------------------------------------------------------------- */

    /** Bilangan bulat menit dalam rentang 1..1440, atau null bila tidak sah. */
    function sanitizeThreshold(value) {
        const n = Number(value);
        if (!Number.isInteger(n)) return null;
        if (n < 1 || n > 1440) return null;
        return n;
    }

    /**
     * Baca Threshold_Minutes. Nilai tidak sah dipulihkan ke nilai bawaan dan
     * ditimpa di penyimpanan supaya tidak berulang.
     */
    async function getThreshold() {
        const data = await readAll(KEY.threshold);
        const value = sanitizeThreshold(data[KEY.threshold]);

        if (value !== null) return value;

        await write({ [KEY.threshold]: defaults.thresholdMinutes });
        return defaults.thresholdMinutes;
    }

    /** Simpan Threshold_Minutes setelah divalidasi. */
    async function setThreshold(value) {
        const clean = sanitizeThreshold(value);

        if (clean === null) {
            return { ok: false, error: 'Ambang batas harus bilangan bulat 1 sampai 1440 menit.' };
        }

        const result = await write({ [KEY.threshold]: clean });
        return result.ok ? { ok: true, value: clean } : result;
    }

    /* ---------------------------------------------------------------------- */
    /*  Daftar incident                                                       */
    /* ---------------------------------------------------------------------- */

    /** Baca daftar incident dan waktu pengambilannya. */
    async function getIncidents() {
        const data = await readAll([KEY.incidents, KEY.fetchedAt]);

        return {
            incidents: Array.isArray(data[KEY.incidents]) ? data[KEY.incidents] : [],
            fetchedAt: data[KEY.fetchedAt] ?? null,
        };
    }

    /** Perkiraan ukuran data dalam byte. */
    const sizeOf = (value) => {
        try {
            return JSON.stringify(value).length;
        } catch {
            return 0;
        }
    };

    /**
     * Pangkas daftar incident bila melewati ambang perawatan. Yang dibuang
     * hanya incident final (Resolved/Cancelled) dari yang paling lama.
     * Incident Active selalu dipertahankan.
     */
    function pruneIncidents(incidents) {
        let list = incidents.slice();
        if (sizeOf(list) <= MAINTENANCE_BYTES) return { list, pruned: 0 };

        const isFinal = (i) => {
            const s = String(i?.status ?? '').trim().toLowerCase();
            return s === 'resolved' || s === 'cancelled';
        };

        const time = (i) => new Date(i?.created_at ?? 0).getTime() || 0;

        const finals = list
            .map((incident, index) => ({ incident, index }))
            .filter((row) => isFinal(row.incident))
            .sort((a, b) => time(a.incident) - time(b.incident));

        const drop = new Set();

        for (const row of finals) {
            if (sizeOf(list.filter((_, i) => !drop.has(i))) <= MAINTENANCE_BYTES) break;
            drop.add(row.index);
        }

        if (drop.size > 0) list = list.filter((_, i) => !drop.has(i));

        return { list, pruned: drop.size };
    }

    /** Ganti seluruh daftar incident beserta waktu pengambilannya. */
    async function setIncidents(incidents) {
        const { list, pruned } = pruneIncidents(Array.isArray(incidents) ? incidents : []);
        const fetchedAt = new Date().toISOString();

        const result = await write({
            [KEY.incidents]: list,
            [KEY.fetchedAt]: fetchedAt,
        });

        return { ...result, fetchedAt, pruned, count: list.length };
    }

    /* ---------------------------------------------------------------------- */
    /*  Notification_Key                                                      */
    /* ---------------------------------------------------------------------- */

    /** Baca daftar Notification_Key yang sudah diterbitkan. */
    async function getNotifiedKeys() {
        const data = await readAll(KEY.notifiedKeys);
        return Array.isArray(data[KEY.notifiedKeys]) ? data[KEY.notifiedKeys] : [];
    }

    /** Catat Notification_Key baru, menjaga batas jumlah maksimum. */
    async function recordNotifiedKeys(keys) {
        if (!Array.isArray(keys) || keys.length === 0) return { ok: true };

        const existing = await getNotifiedKeys();
        const seen = new Set(existing.map((row) => row.key));
        const now = new Date().toISOString();

        for (const key of keys) {
            if (seen.has(key)) continue;
            existing.push({ key, at: now });
            seen.add(key);
        }

        existing.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

        const trimmed =
            existing.length > limits.maxNotificationKeys
                ? existing.slice(existing.length - limits.maxNotificationKeys)
                : existing;

        return write({ [KEY.notifiedKeys]: trimmed });
    }

    /**
     * Hapus Notification_Key milik incident yang sudah final, supaya bila
     * incident dibuka kembali sebagai Active notifikasinya bisa terbit lagi.
     */
    async function forgetProblemIds(problemIds) {
        if (!Array.isArray(problemIds) || problemIds.length === 0) return { ok: true };

        const existing = await getNotifiedKeys();
        const drop = new Set(problemIds.map(String));
        const kept = existing.filter((row) => !drop.has(String(row.key).split('|')[0]));

        if (kept.length === existing.length) return { ok: true };

        return write({ [KEY.notifiedKeys]: kept });
    }

    /* ---------------------------------------------------------------------- */
    /*  Hasil Check_Cycle terakhir                                            */
    /* ---------------------------------------------------------------------- */

    /** Simpan ringkasan Check_Cycle terakhir agar popup bisa menampilkannya. */
    async function setLastResult(result) {
        return write({ [KEY.lastResult]: result });
    }

    /** Baca ringkasan Check_Cycle terakhir. */
    async function getLastResult() {
        const data = await readAll(KEY.lastResult);
        return data[KEY.lastResult] ?? null;
    }

    /* ---------------------------------------------------------------------- */
    /*  Status jaringan                                                       */
    /* ---------------------------------------------------------------------- */

    /** Baca status jaringan: jumlah kegagalan berturut-turut dan masa tunda. */
    async function getNetwork() {
        const data = await readAll(KEY.network);
        const value = data[KEY.network] ?? {};

        return {
            failureStreak: Number(value.failureStreak ?? 0),
            backoffUntil: value.backoffUntil ?? null,
            lastError: value.lastError ?? null,
            lastFailureAt: value.lastFailureAt ?? null,
        };
    }

    /** Catat kegagalan jaringan, memasang penundaan bila mencapai batas. */
    async function recordFailure(error) {
        const current = await getNetwork();
        const failureStreak = current.failureStreak + 1;
        const now = Date.now();

        const backoffUntil =
            failureStreak >= limits.failureStreakLimit
                ? new Date(now + limits.backoffMs).toISOString()
                : current.backoffUntil;

        const next = {
            failureStreak,
            backoffUntil,
            lastError: String(error ?? 'kegagalan jaringan'),
            lastFailureAt: new Date(now).toISOString(),
        };

        await write({ [KEY.network]: next });
        return next;
    }

    /** Bersihkan status jaringan setelah pengambilan berhasil. */
    async function clearFailures() {
        await write({
            [KEY.network]: {
                failureStreak: 0,
                backoffUntil: null,
                lastError: null,
                lastFailureAt: null,
            },
        });
    }

    /** Sisa waktu penundaan dalam detik, 0 bila tidak sedang tertunda. */
    function backoffSecondsLeft(network) {
        if (!network?.backoffUntil) return 0;

        const left = new Date(network.backoffUntil).getTime() - Date.now();
        return left > 0 ? Math.ceil(left / 1000) : 0;
    }

    /** Bentuk template ringkas hanya dari incident yang sudah Resolved. */
    function resolvedTemplateOf(incident) {
        if (String(incident?.status ?? '').trim().toLowerCase() !== 'resolved') return null;

        const id = incident?.id ?? null;
        const problemId = incident?.problem_id ?? null;
        if (!id && !problemId) return null;

        const detail = incident?.detail_alert ?? {};
        const taskActions = [];
        const seenActions = new Set();

        for (const task of Array.isArray(incident?.tasks) ? incident.tasks : []) {
            const action = String(task?.action ?? '').trim();
            if (!action || seenActions.has(action)) continue;
            seenActions.add(action);
            taskActions.push(action);
        }

        return {
            id,
            problem_id: problemId,
            judul: String(incident?.judul ?? '').trim(),
            kategori_tim: String(incident?.kategori_tim ?? '').trim(),
            perangkat: String(incident?.perangkat ?? '').trim(),
            kronologiNarasi: MQC.kronologi.narasiOf(incident?.kronologi),
            root_cause: String(detail?.root_cause ?? '').trim(),
            impact: String(detail?.impact ?? '').trim(),
            resolution: String(incident?.resolution ?? '').trim(),
            problem_type: String(incident?.problem_type ?? '').trim(),
            taskActions,
            created_at: incident?.created_at ?? null,
            resolved_at: incident?.resolved_at ?? null,
            updated_at: incident?.updated_at ?? null,
        };
    }

    const templateKey = (template) =>
        String(template?.id || template?.problem_id || '').trim();

    const templateTime = (template) =>
        new Date(
            template?.resolved_at || template?.updated_at || template?.created_at || 0,
        ).getTime() || 0;

    /** Baca library template incident Resolved. */
    async function getResolvedTemplates() {
        const data = await readAll(KEY.resolvedTemplates);
        return Array.isArray(data[KEY.resolvedTemplates]) ? data[KEY.resolvedTemplates] : [];
    }

    /**
     * Gabungkan incident Resolved terbaru ke library secara idempoten. Template
     * lama tetap disimpan bila respons Firestore suatu saat terpotong.
     */
    async function syncResolvedTemplates(incidents) {
        const existing = await getResolvedTemplates();
        const byKey = new Map();

        for (const template of existing) {
            const key = templateKey(template);
            if (key) byKey.set(key, template);
        }

        for (const incident of Array.isArray(incidents) ? incidents : []) {
            const template = resolvedTemplateOf(incident);
            const key = templateKey(template);
            if (key) byKey.set(key, template);
        }

        const templates = Array.from(byKey.values())
            .filter((template) => templateKey(template))
            .sort((a, b) => {
                const timeDiff = templateTime(b) - templateTime(a);
                return timeDiff || templateKey(a).localeCompare(templateKey(b));
            });

        if (JSON.stringify(existing) === JSON.stringify(templates)) {
            return { ok: true, changed: false, count: templates.length, templates };
        }

        const result = await write({ [KEY.resolvedTemplates]: templates });
        return { ...result, changed: result.ok, count: templates.length, templates };
    }

    MQC.store = {
        MAINTENANCE_BYTES,
        sanitizeThreshold,
        getThreshold,
        setThreshold,
        getIncidents,
        setIncidents,
        pruneIncidents,
        resolvedTemplateOf,
        getResolvedTemplates,
        syncResolvedTemplates,
        getNotifiedKeys,
        recordNotifiedKeys,
        forgetProblemIds,
        setLastResult,
        getLastResult,
        getNetwork,
        recordFailure,
        clearFailures,
        backoffSecondsLeft,
    };
})(typeof self !== 'undefined' ? self : globalThis);
