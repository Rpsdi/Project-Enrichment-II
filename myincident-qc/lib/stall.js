/**
 * ============================================================================
 *  myIncident QC — Stalled_Monitor
 * ============================================================================
 *  Modul murni: menentukan Reference_Time sebuah incident lalu menilai apakah
 *  incident tersebut mandek.
 *
 *  Baris kronologi hanya memuat jam dan menit tanpa tanggal, sehingga tanggal
 *  perlu direkonstruksi. Titik awalnya adalah tanggal lokal `created_at`.
 *  Setiap kali jam sebuah entri turun dibanding entri sebelumnya, tanggal
 *  dianggap bergeser satu hari (kasus lewat tengah malam).
 * ============================================================================
 */

(function attachStall(root) {
    const MQC = (root.MQC = root.MQC || {});
    const { parseKronologi } = MQC.kronologi;

    const MS_PER_MINUTE = 60000;

    /** Normalkan nilai status untuk perbandingan. */
    const normStatus = (v) => String(v ?? '').trim().toLowerCase();

    /** True bila incident berstatus Active. */
    const isActive = (incident) => normStatus(incident?.status) === 'active';

    /** Ubah nilai menjadi Date yang sah, atau null bila gagal. */
    function toDate(value) {
        if (!value) return null;

        const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    /**
     * Tentukan Reference_Time sebuah incident.
     *
     * @param {object} incident Incident_Record
     * @returns {{ok: boolean, refTime: Date|null, source: string, reason: string, entryCount: number}}
     */
    function referenceTimeOf(incident) {
        const createdAt = toDate(incident?.created_at);

        if (!createdAt) {
            return {
                ok: false,
                refTime: null,
                source: 'none',
                reason: 'created_at tidak sah',
                entryCount: 0,
            };
        }

        const { entries } = parseKronologi(incident?.kronologi);

        if (entries.length === 0) {
            return {
                ok: true,
                refTime: createdAt,
                source: 'created_at',
                reason: 'belum ada baris HH:MM pada kronologi',
                entryCount: 0,
            };
        }

        // Rekonstruksi tanggal: mulai dari tanggal lokal created_at, lalu geser
        // satu hari setiap kali jam entri turun dibanding entri sebelumnya.
        const cursor = new Date(
            createdAt.getFullYear(),
            createdAt.getMonth(),
            createdAt.getDate(),
        );

        let previousMinutes = null;

        for (const entry of entries) {
            const minutes = entry.hour * 60 + entry.minute;

            if (previousMinutes !== null && minutes < previousMinutes) {
                cursor.setDate(cursor.getDate() + 1);
            }

            previousMinutes = minutes;
        }

        const last = entries[entries.length - 1];
        const refTime = new Date(
            cursor.getFullYear(),
            cursor.getMonth(),
            cursor.getDate(),
            last.hour,
            last.minute,
            0,
            0,
        );

        return {
            ok: true,
            refTime,
            source: 'kronologi',
            reason: '',
            entryCount: entries.length,
        };
    }

    /** Bentuk Notification_Key dari problem_id dan Reference_Time. */
    function notificationKey(problemId, refTime) {
        const stamp = refTime instanceof Date ? refTime.toISOString() : String(refTime ?? '');
        return `${String(problemId ?? '-')}|${stamp}`;
    }

    /**
     * Nilai satu incident terhadap ambang batas.
     *
     * @param {object} incident Incident_Record
     * @param {number} thresholdMinutes Ambang batas menit
     * @param {Date} now Waktu sekarang
     */
    function evaluate(incident, thresholdMinutes, now) {
        const ref = referenceTimeOf(incident);

        if (!ref.ok) {
            return {
                assessable: false,
                stalled: false,
                minutes: 0,
                refTime: null,
                source: ref.source,
                reason: ref.reason,
            };
        }

        const rawMinutes = Math.floor((now.getTime() - ref.refTime.getTime()) / MS_PER_MINUTE);

        // Reference_Time di masa depan diperlakukan sebagai selisih nol supaya
        // data berjam ganjil tidak pernah tampil sebagai mandek.
        const minutes = rawMinutes < 0 ? 0 : rawMinutes;
        const future = rawMinutes < 0;

        return {
            assessable: true,
            stalled: minutes > thresholdMinutes,
            minutes,
            refTime: ref.refTime,
            source: ref.source,
            entryCount: ref.entryCount,
            reason: future ? 'waktu acuan berada di masa depan' : ref.reason,
        };
    }

    /** Teks pengganti untuk nilai yang kosong. */
    const orDash = (v) => {
        const s = String(v ?? '').trim();
        return s || 'tidak tersedia';
    };

    /**
     * Urutan baku: yang mandek lebih dulu, lalu selisih menit terbesar, lalu
     * incident paling lama, lalu problem_id.
     */
    function compareRows(a, b) {
        if (a.stalled !== b.stalled) return a.stalled ? -1 : 1;
        if (b.minutes !== a.minutes) return b.minutes - a.minutes;

        const ta = toDate(a.created_at)?.getTime() ?? 0;
        const tb = toDate(b.created_at)?.getTime() ?? 0;
        if (ta !== tb) return ta - tb;

        return String(a.problem_id).localeCompare(String(b.problem_id));
    }

    /**
     * Jalankan satu Check_Cycle atas seluruh incident.
     *
     * `monitored` memuat SELURUH incident Active beserta penilaiannya, supaya
     * panel di halaman bisa menampilkan daftar pantauan penuh, bukan hanya yang
     * bermasalah. `stalled` adalah bagian dari `monitored` yang melewati ambang.
     *
     * @param {Array<object>} incidents Daftar Incident_Record
     * @param {number} thresholdMinutes Ambang batas menit
     * @param {Date} [now] Waktu sekarang
     * @returns {{monitored: Array<object>, stalled: Array<object>, unassessable: Array<object>, activeCount: number, checkedAt: string, thresholdMinutes: number}}
     */
    function runCheck(incidents, thresholdMinutes, now = new Date()) {
        const list = Array.isArray(incidents) ? incidents : [];
        const threshold = Number(thresholdMinutes);
        const monitored = [];
        const unassessable = [];
        let activeCount = 0;

        for (const incident of list) {
            if (!isActive(incident)) continue;

            activeCount += 1;
            const verdict = evaluate(incident, threshold, now);

            const row = {
                id: incident.id ?? null,
                problem_id: orDash(incident.problem_id),
                judul: orDash(incident.judul),
                perangkat: orDash(incident.perangkat),
                created_at: incident.created_at ?? null,
                refTime: verdict.refTime ? verdict.refTime.toISOString() : null,
                refSource: verdict.source,
                minutes: verdict.minutes,
                assessable: verdict.assessable,
                stalled: verdict.stalled,
                reason: verdict.reason,
                key: verdict.assessable
                    ? notificationKey(incident.problem_id, verdict.refTime)
                    : null,
            };

            monitored.push(row);

            if (!verdict.assessable) {
                unassessable.push({
                    id: row.id,
                    problem_id: row.problem_id,
                    reason: verdict.reason,
                });
            }
        }

        monitored.sort(compareRows);

        return {
            monitored,
            stalled: monitored.filter((row) => row.stalled),
            unassessable,
            activeCount,
            checkedAt: now.toISOString(),
            thresholdMinutes: threshold,
        };
    }

    /** Kumpulkan problem_id yang sudah tidak berstatus Active. */
    function finalizedProblemIds(incidents) {
        const list = Array.isArray(incidents) ? incidents : [];
        const out = [];

        for (const incident of list) {
            const status = normStatus(incident?.status);
            if (status === 'resolved' || status === 'cancelled') {
                out.push(String(incident.problem_id ?? '-'));
            }
        }

        return out;
    }

    MQC.stall = {
        isActive,
        toDate,
        referenceTimeOf,
        notificationKey,
        evaluate,
        compareRows,
        runCheck,
        finalizedProblemIds,
    };
})(typeof self !== 'undefined' ? self : globalThis);
