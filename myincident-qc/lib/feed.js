/**
 * ============================================================================
 *  myIncident QC — Mesin umpan notifikasi
 * ============================================================================
 *  Modul murni. Membandingkan keadaan incident sekarang dengan keadaan pada
 *  pemeriksaan sebelumnya, lalu menurunkan daftar kejadian yang layak
 *  diberitakan ke pengguna.
 *
 *  Keadaan sebelumnya disimpan sebagai Snapshot: satu entri per problem_id yang
 *  memuat status terakhir, waktu acuan terakhir, dan kunci mandek yang sudah
 *  pernah diberitakan. Snapshot inilah yang membuat sebuah kejadian hanya
 *  muncul sekali, bukan berulang setiap 60 detik.
 * ============================================================================
 */

(function attachFeed(root) {
    const MQC = (root.MQC = root.MQC || {});
    const { stall } = MQC;
    const { limits } = MQC.config;

    /** Jenis kejadian yang dikenali. */
    const TYPES = {
        NEW: 'new',
        STALLED: 'stalled',
        UPDATE: 'update',
        RESOLVED: 'resolved',
        CANCELLED: 'cancelled',
        REOPENED: 'reopened',
    };

    /** Label ringkas per jenis kejadian, dipakai panel dan notifikasi. */
    const LABELS = {
        [TYPES.NEW]: 'Incident baru',
        [TYPES.STALLED]: 'Belum ada update',
        [TYPES.UPDATE]: 'Kronologi diperbarui',
        [TYPES.RESOLVED]: 'Selesai ditangani',
        [TYPES.CANCELLED]: 'Dibatalkan',
        [TYPES.REOPENED]: 'Dibuka kembali',
    };

    /** Kejadian yang layak memicu notifikasi desktop. */
    const DESKTOP_TYPES = new Set([TYPES.NEW, TYPES.STALLED]);

    const normStatus = (v) => String(v ?? '').trim().toLowerCase();

    const orDash = (v) => {
        const s = String(v ?? '').trim();
        return s || 'tidak tersedia';
    };

    /**
     * Turunkan daftar kejadian dari perbandingan Snapshot lama dan data baru.
     *
     * Pada pemeriksaan pertama (Snapshot masih kosong) kejadian "incident baru",
     * "kronologi diperbarui", dan perubahan status TIDAK diterbitkan, supaya
     * pengguna tidak dibanjiri riwayat lama. Incident yang sudah mandek tetap
     * diberitakan, karena itu justru informasi yang dicari.
     *
     * @param {object} prevSnapshot Snapshot pemeriksaan sebelumnya
     * @param {Array<object>} incidents Daftar Incident_Record terkini
     * @param {number} thresholdMinutes Ambang batas menit
     * @param {Date} [now] Waktu sekarang
     * @returns {{events: Array<object>, snapshot: object, firstRun: boolean}}
     */
    function diff(prevSnapshot, incidents, thresholdMinutes, now = new Date()) {
        const prev = prevSnapshot && typeof prevSnapshot === 'object' ? prevSnapshot : {};
        const firstRun = Object.keys(prev).length === 0;
        const list = Array.isArray(incidents) ? incidents : [];

        const snapshot = {};
        const events = [];
        const stamp = now.toISOString();

        for (const incident of list) {
            const pid = String(incident?.problem_id ?? '').trim();
            if (!pid) continue;

            const status = normStatus(incident.status);
            const active = status === 'active';
            const before = prev[pid];

            const verdict = active ? stall.evaluate(incident, thresholdMinutes, now) : null;
            const refTimeIso = verdict?.refTime ? verdict.refTime.toISOString() : null;
            const stalledKey =
                active && verdict?.stalled ? stall.notificationKey(pid, verdict.refTime) : null;

            /** Rangka kejadian dengan data incident yang dibutuhkan panel. */
            const base = {
                problem_id: pid,
                incidentId: incident.id ?? null,
                judul: orDash(incident.judul),
                perangkat: orDash(incident.perangkat),
                status: incident.status ?? null,
                minutes: verdict?.assessable ? verdict.minutes : null,
                refTime: refTimeIso,
                refSource: verdict?.source ?? null,
                at: stamp,
            };

            const push = (type, id) => events.push({ ...base, type, id });

            if (!firstRun) {
                if (!before && active) {
                    push(TYPES.NEW, `${TYPES.NEW}:${pid}`);
                }

                if (before && before.status !== 'active' && active) {
                    push(TYPES.REOPENED, `${TYPES.REOPENED}:${pid}:${stamp}`);
                }

                if (before && before.status !== 'resolved' && status === 'resolved') {
                    push(TYPES.RESOLVED, `${TYPES.RESOLVED}:${pid}:${stamp}`);
                }

                if (before && before.status !== 'cancelled' && status === 'cancelled') {
                    push(TYPES.CANCELLED, `${TYPES.CANCELLED}:${pid}:${stamp}`);
                }

                // Kronologi bertambah: waktu acuan bergeser ke depan.
                if (before && active && before.refTimeIso && refTimeIso && before.refTimeIso !== refTimeIso) {
                    push(TYPES.UPDATE, `${TYPES.UPDATE}:${pid}:${refTimeIso}`);
                }
            }

            // Kejadian mandek selalu diberitakan, termasuk pada pemeriksaan pertama.
            if (stalledKey && before?.notifiedStalledKey !== stalledKey) {
                push(TYPES.STALLED, `${TYPES.STALLED}:${stalledKey}`);
            }

            snapshot[pid] = {
                status,
                refTimeIso,
                // Kunci disimpan hanya bila kejadiannya sudah diterbitkan, supaya
                // incident yang kembali mandek setelah update bisa berbunyi lagi.
                notifiedStalledKey: stalledKey ?? null,
            };
        }

        return { events, snapshot, firstRun };
    }

    /**
     * Gabungkan kejadian baru ke umpan yang sudah ada.
     *
     * Kejadian dengan id yang sama tidak pernah ditambahkan dua kali, jadi
     * pemeriksaan yang berjalan berulang tidak menggandakan isi umpan.
     *
     * @param {Array<object>} existing Umpan tersimpan
     * @param {Array<object>} events Kejadian hasil diff
     * @param {number} [max] Batas jumlah entri
     * @returns {{feed: Array<object>, added: Array<object>}}
     */
    function merge(existing, events, max = limits.feedMax) {
        const current = Array.isArray(existing) ? existing.slice() : [];
        const known = new Set(current.map((row) => row.id));
        const added = [];

        for (const event of Array.isArray(events) ? events : []) {
            if (known.has(event.id)) continue;

            const entry = { ...event, unread: true };
            current.push(entry);
            known.add(event.id);
            added.push(entry);
        }

        // Terbaru di atas.
        current.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

        return { feed: current.slice(0, max), added };
    }

    /** Jumlah entri umpan yang belum dibaca. */
    const unreadCount = (feed) =>
        (Array.isArray(feed) ? feed : []).filter((row) => row.unread).length;

    /** Tandai seluruh entri umpan sebagai sudah dibaca. */
    const markAllRead = (feed) =>
        (Array.isArray(feed) ? feed : []).map((row) => (row.unread ? { ...row, unread: false } : row));

    /**
     * Susun teks notifikasi desktop untuk sebuah kejadian.
     * @param {object} event Entri umpan
     * @returns {{title: string, message: string}}
     */
    function describe(event) {
        const label = LABELS[event.type] ?? 'Kejadian incident';

        if (event.type === TYPES.STALLED) {
            return {
                title: `${event.problem_id} belum ada update`,
                message: `${event.judul}\nTerakhir diperbarui ${event.minutes} menit lalu.`,
            };
        }

        if (event.type === TYPES.NEW) {
            return {
                title: `${event.problem_id} incident baru`,
                message: `${event.judul}\nPerangkat ${event.perangkat}.`,
            };
        }

        return {
            title: `${event.problem_id} ${label.toLowerCase()}`,
            message: event.judul,
        };
    }

    MQC.feed = {
        TYPES,
        LABELS,
        DESKTOP_TYPES,
        diff,
        merge,
        unreadCount,
        markAllRead,
        describe,
    };
})(typeof self !== 'undefined' ? self : globalThis);
