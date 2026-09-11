/**
 * ============================================================================
 *  myIncident QC — Background_Worker
 * ============================================================================
 *  Service worker klasik (bukan module) supaya bisa memakai importScripts dan
 *  berbagi modul yang sama dengan content script maupun popup tanpa build step.
 *
 *  Perannya sengaja dibatasi pada tiga hal:
 *    1. Satu-satunya pihak yang memanggil Firestore dan menulis Cache_Store.
 *    2. Penerbit notifikasi desktop.
 *    3. Penyimpan ringkasan Check_Cycle terakhir untuk popup.
 *
 *  Pemicu pemantauan tetap berada di content script sesuai keputusan desain,
 *  jadi tidak ada alarm periodik di sini.
 * ============================================================================
 */

importScripts(
    'config.js',
    'lib/kronologi.js',
    'lib/stall.js',
    'lib/store.js',
    'lib/firestore.js',
);

const { config, store, firestore, stall } = self.MQC;

/** Ikon yang dipakai pada notifikasi desktop. */
const NOTIFICATION_ICON = 'icons/icon128.png';

/* ==========================================================================
   1. PENGAMBILAN DATA
   ========================================================================== */

/**
 * Ambil data incident. Mengembalikan data cache bila jaringan sedang tertunda
 * atau pengambilan gagal, supaya pemeriksaan QC tidak pernah berhenti.
 *
 * @param {{force?: boolean}} options `force` melewati penundaan jaringan
 */
async function provideIncidents(options = {}) {
    const [cached, cachedTemplates, network] = await Promise.all([
        store.getIncidents(),
        store.getResolvedTemplates(),
        store.getNetwork(),
    ]);
    const secondsLeft = store.backoffSecondsLeft(network);

    // Sedang dalam masa tunda: pakai cache, kecuali pengguna menekan refresh.
    if (secondsLeft > 0 && !options.force) {
        return {
            ok: true,
            fromCache: true,
            incidents: cached.incidents,
            templates: cachedTemplates,
            fetchedAt: cached.fetchedAt,
            backoffSecondsLeft: secondsLeft,
            error: network.lastError,
        };
    }

    const result = await firestore.fetchIncidents();

    if (!result.ok) {
        const next = await store.recordFailure(result.error);

        return {
            ok: false,
            fromCache: true,
            incidents: cached.incidents,
            templates: cachedTemplates,
            fetchedAt: cached.fetchedAt,
            status: result.status ?? 0,
            timeout: Boolean(result.timeout),
            error: result.error,
            failureStreak: next.failureStreak,
            backoffSecondsLeft: store.backoffSecondsLeft(next),
        };
    }

    await store.clearFailures();
    const [saved, templateSync] = await Promise.all([
        store.setIncidents(result.incidents),
        store.syncResolvedTemplates(result.incidents),
    ]);

    // Incident yang sudah final tidak perlu lagi menahan Notification_Key.
    await store.forgetProblemIds(stall.finalizedProblemIds(result.incidents));

    return {
        ok: true,
        fromCache: false,
        incidents: result.incidents,
        templates: templateSync.templates,
        fetchedAt: saved.fetchedAt,
        truncated: Boolean(result.truncated),
        storageWarning: saved.ok && templateSync.ok
            ? null
            : saved.error || templateSync.error,
        pruned: saved.pruned ?? 0,
    };
}

/* ==========================================================================
   2. NOTIFIKASI DESKTOP
   ========================================================================== */

/** Baca tingkat izin notifikasi tanpa melempar galat. */
function permissionLevel() {
    return new Promise((resolve) => {
        try {
            chrome.notifications.getPermissionLevel((level) => resolve(level));
        } catch {
            resolve('granted');
        }
    });
}

/** Terbitkan satu notifikasi, mengembalikan true bila berhasil. */
function createNotification(id, options) {
    return new Promise((resolve) => {
        chrome.notifications.create(id, options, () => {
            if (chrome.runtime.lastError) {
                console.warn('[myIncident QC] notifikasi gagal:', chrome.runtime.lastError.message);
                resolve(false);
                return;
            }

            resolve(true);
        });
    });
}

const truncate = (value, max) => {
    const s = String(value ?? '');
    return s.length > max ? `${s.slice(0, max)}...` : s;
};

/**
 * Terbitkan notifikasi untuk incident mandek yang belum pernah diberitakan.
 * Notification_Key hanya dicatat setelah notifikasi benar-benar terbit,
 * sehingga kegagalan akan dicoba ulang pada Check_Cycle berikutnya.
 *
 * @param {Array<{key: string, problem_id: string, judul: string, minutes: number}>} items
 */
async function publishNotifications(items) {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) return { ok: true, issued: 0, skipped: 0 };

    const level = await permissionLevel();

    if (level === 'denied') {
        return { ok: false, issued: 0, denied: true, error: 'Izin notifikasi sedang ditolak.' };
    }

    const known = new Set((await store.getNotifiedKeys()).map((row) => row.key));
    const pending = list.filter((item) => item.key && !known.has(item.key));
    const batch = pending.slice(0, config.limits.maxNotificationsPerCycle);

    const issuedKeys = [];

    for (const item of batch) {
        const ok = await createNotification(`mqc:${item.key}`, {
            type: 'basic',
            iconUrl: NOTIFICATION_ICON,
            title: `${item.problem_id} belum ada update`,
            message: `${truncate(item.judul, 80)}\nTerakhir diperbarui ${item.minutes} menit lalu.`,
            priority: 2,
        });

        if (ok) issuedKeys.push(item.key);
    }

    if (issuedKeys.length > 0) await store.recordNotifiedKeys(issuedKeys);

    return {
        ok: true,
        issued: issuedKeys.length,
        skipped: pending.length - batch.length,
    };
}

/** Klik notifikasi membuka atau memfokuskan halaman myIncident. */
chrome.notifications.onClicked.addListener(async (notificationId) => {
    try {
        const tabPatterns = (config.appOrigins ?? [config.appOrigin])
            .map((origin) => `${origin}/*`);
        const tabs = await chrome.tabs.query({ url: tabPatterns });

        if (tabs.length > 0) {
            await chrome.tabs.update(tabs[0].id, { active: true });
            await chrome.windows.update(tabs[0].windowId, { focused: true });
        } else {
            await chrome.tabs.create({ url: `${config.appOrigin}/` });
        }
    } catch (error) {
        console.warn('[myIncident QC] gagal membuka tab myIncident:', error);
    }

    chrome.notifications.clear(notificationId);
});

/* ==========================================================================
   3. SALURAN PESAN
   ========================================================================== */

/** Peta penanganan pesan. Setiap handler mengembalikan objek balasan. */
const handlers = {
    /** Sediakan data incident untuk content script maupun popup. */
    async MQC_GET_DATA(payload) {
        return provideIncidents({ force: Boolean(payload?.force) });
    },

    /**
     * Alias kontrak baru. Dipertahankan agar popup/content script dari revisi
     * lain tetap dapat berbicara dengan worker ini setelah reload/revert.
     */
    async MQC_RUN_MONITOR(payload) {
        const data = await provideIncidents({ force: Boolean(payload?.force) });
        const thresholdMinutes = await store.getThreshold();
        const incidents = Array.isArray(data.incidents) ? data.incidents : [];
        const result = stall.runCheck(incidents, thresholdMinutes);

        await store.setLastResult({
            ...result,
            fetchedAt: data.fetchedAt ?? null,
            fromCache: Boolean(data.fromCache),
            fetchError: data.error ?? null,
        });

        if (result.stalled.length > 0) {
            await publishNotifications(
                result.stalled.map((row) => ({
                    key: row.key,
                    problem_id: row.problem_id,
                    judul: row.judul,
                    minutes: row.minutes,
                })),
            );
        }

        return { ...data, result, thresholdMinutes };
    },

    /** Terbitkan notifikasi desktop. */
    async MQC_NOTIFY(payload) {
        return publishNotifications(payload?.items);
    },

    /** Simpan ringkasan Check_Cycle terakhir agar popup bisa menampilkannya. */
    async MQC_SAVE_RESULT(payload) {
        await store.setLastResult(payload?.result ?? null);
        return { ok: true };
    },

    /** Baca status jaringan dan ambang batas untuk popup. */
    async MQC_GET_STATUS() {
        const [threshold, network, lastResult, cached, templates, level] = await Promise.all([
            store.getThreshold(),
            store.getNetwork(),
            store.getLastResult(),
            store.getIncidents(),
            store.getResolvedTemplates(),
            permissionLevel(),
        ]);

        return {
            ok: true,
            thresholdMinutes: threshold,
            network: { ...network, secondsLeft: store.backoffSecondsLeft(network) },
            lastResult,
            fetchedAt: cached.fetchedAt,
            incidentCount: cached.incidents.length,
            templates,
            templateCount: templates.length,
            notificationLevel: level,
        };
    },

    /**
     * Alias pembacaan state untuk klien dari revisi worker yang lebih baru.
     * Bentuk respons merupakan superset MQC_GET_STATUS dan menyertakan cache.
     */
    async MQC_GET_STATE() {
        const [status, cached] = await Promise.all([
            handlers.MQC_GET_STATUS(),
            store.getIncidents(),
        ]);

        return {
            ...status,
            incidents: cached.incidents,
            fetchedAt: cached.fetchedAt,
        };
    },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const handler = handlers[message?.type];

    if (!handler) {
        sendResponse({ ok: false, error: `Jenis pesan tidak dikenal: ${message?.type}` });
        return false;
    }

    handler(message)
        .then((result) => sendResponse(result))
        .catch((error) => {
            console.error('[myIncident QC] penanganan pesan gagal:', error);
            sendResponse({ ok: false, error: String(error?.message ?? error) });
        });

    // true menahan saluran tetap terbuka untuk balasan asinkron.
    return true;
});

/** Siapkan nilai bawaan saat extension baru dipasang. */
chrome.runtime.onInstalled.addListener(async () => {
    await store.getThreshold();
    console.info('[myIncident QC] extension siap.');
});
