/**
 * ============================================================================
 *  myIncident QC — Konfigurasi
 * ============================================================================
 *  Berkas ini hanya memuat nilai publik. API key Firebase untuk aplikasi web
 *  memang bersifat publik dan tidak memberi hak tulis apa pun; extension ini
 *  hanya melakukan HTTP GET. Jangan pernah menaruh kunci service account,
 *  token OAuth, atau kata sandi di sini.
 *
 *  Berkas ini dimuat sebagai skrip klasik pada content script, service worker
 *  (lewat importScripts), dan popup, sehingga seluruh lapisan memakai satu
 *  sumber nilai yang sama.
 * ============================================================================
 */

(function attachConfig(root) {
    const MQC = (root.MQC = root.MQC || {});

    MQC.config = {
        /** Kredensial publik project Firebase myIncident. */
        firebase: {
            apiKey: 'AIzaSyAvEdgLXC_l6pxCDsSTLPwEtzeIYv0UJS4',
            projectId: 'dummy-dashboard-qc',
        },

        /** Collection Firestore yang menyimpan incident. */
        collection: 'incidents',

        /** Origin aplikasi myIncident yang dipantau. */
        appOrigin: 'https://projectmagang.my.id',
        appOrigins: [
            'https://projectmagang.my.id',
            'https://www.projectmagang.my.id',
            'http://localhost:8000',
            'http://127.0.0.1:8000',
        ],

        /** Nilai bawaan yang dipakai saat pengaturan belum tersimpan. */
        defaults: {
            thresholdMinutes: 30,
        },

        /** Batas operasional. */
        limits: {
            /** Jumlah dokumen per permintaan Firestore. */
            pageSize: 300,
            /** Batas jumlah halaman yang diambil. */
            maxPages: 50,
            /** Batas jumlah dokumen yang diambil. */
            maxDocs: 10000,
            /** Timeout satu permintaan HTTP, dalam milidetik. */
            requestTimeoutMs: 10000,
            /** Timeout total seluruh halaman, dalam milidetik. */
            totalTimeoutMs: 60000,
            /** Jeda antar Check_Cycle pada content script, dalam milidetik. */
            checkIntervalMs: 60000,
            /** Jeda tunda setelah tiga kegagalan jaringan, dalam milidetik. */
            backoffMs: 5 * 60 * 1000,
            /** Jumlah kegagalan berturut-turut yang memicu penundaan. */
            failureStreakLimit: 3,
            /** Batas notifikasi desktop per siklus pemantauan. */
            maxNotificationsPerCycle: 5,
            /** Batas kunci notifikasi yang disimpan untuk mencegah spam. */
            maxNotificationKeys: 1000,
            /** Batas entri yang ditampilkan pada panel di halaman. */
            dockMaxEntries: 25,
            /** Batas jumlah entri umpan notifikasi yang disimpan. */
            feedMax: 100,
            /** Jeda pemeriksaan latar oleh service worker, dalam menit. */
            alarmPeriodMinutes: 5,
            /** Jeda debounce pencarian title, dalam milidetik. */
            autofillDebounceMs: 400,
        },

        /** Kunci penyimpanan pada chrome.storage.local. */
        storageKeys: {
            incidents: 'mqc_incidents',
            resolvedTemplates: 'mqc_resolved_templates',
            fetchedAt: 'mqc_fetched_at',
            threshold: 'mqc_threshold',
            /** Kunci notifikasi desktop yang sudah diterbitkan. */
            notifiedKeys: 'mqc_notified_keys',
            lastResult: 'mqc_last_result',
            network: 'mqc_network',
            /** Umpan notifikasi yang ditampilkan panel. */
            feed: 'mqc_feed',
            /** Keadaan incident pada pemeriksaan sebelumnya. */
            snapshot: 'mqc_snapshot',
            /** Panel di halaman sedang diringkas atau tidak. */
            dockCollapsed: 'mqc_dock_collapsed',
            /** Tab aktif pada panel: 'feed' atau 'watch'. */
            dockTab: 'mqc_dock_tab',
            /** Penyaring daftar pantauan: 'all' atau 'stalled'. */
            dockFilter: 'mqc_dock_filter',
            /** Posisi floating window dalam koordinat viewport {left, top}. */
            dockPosition: 'mqc_dock_position',
        },
    };
})(typeof self !== 'undefined' ? self : globalThis);
