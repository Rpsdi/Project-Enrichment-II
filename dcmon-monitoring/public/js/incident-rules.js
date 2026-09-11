/**
 * ============================================================================
 *  myIncident — Aturan Bisnis (murni, tanpa DOM & tanpa Firestore)
 * ============================================================================
 *  Modul ini sengaja dipisahkan dari lapisan UI supaya aturan bisnis dapat
 *  diuji dan dibaca sendiri, tanpa bergantung pada browser.
 * ============================================================================
 */

/** Prefix wajib pada setiap judul alert. */
export const JUDUL_PREFIX = 'Event-Mon - ';

/** Status incident yang diperbolehkan. Tidak ada operasi hapus. */
export const INCIDENT_STATUSES = ['Active', 'Resolved', 'Cancelled'];

/** Pilihan kategori tim. */
export const KATEGORI_TIM = ['Network', 'Server', 'Database', 'Application', 'Security'];

/** Pilihan problem type. */
export const PROBLEM_TYPES = [
    'Configuration Error',
    'Hardware Failure',
    'Software Bug',
    'Human Error',
    'Capacity Issue',
    'Others',
];

/** Rantai status task: assigned -> accepted -> completed. */
export const TASK_FLOW = {
    assigned:  { next: 'accepted',  label: 'Accept',   icon: 'solar:check-read-linear' },
    accepted:  { next: 'completed', label: 'Complete', icon: 'solar:check-circle-bold' },
    completed: { next: null,        label: null,       icon: null },
};

/** Direktori PIC (data dummy) untuk pencarian owner pada tab Assign Task. */
export const PIC_DIRECTORY = [
    { nama: 'Andi Saputra',    tim: 'NOC L2' },
    { nama: 'Rina Wijaya',     tim: 'Database Admin' },
    { nama: 'Bayu Pratama',    tim: 'Network Engineer' },
    { nama: 'Siti Nurhaliza',  tim: 'Server Operation' },
    { nama: 'Dimas Anggara',   tim: 'Security Operation' },
    { nama: 'Clara Gunawan',   tim: 'Application Support' },
    { nama: 'Fajar Ramadhan',  tim: 'NOC L1' },
    { nama: 'Maya Kusuma',     tim: 'Cloud Infrastructure' },
    { nama: 'Reza Firmansyah', tim: 'Network Engineer' },
    { nama: 'Tania Halim',     tim: 'Database Admin' },
];

/* -------------------------------------------------------------------------- */
/*  Utilitas teks                                                             */
/* -------------------------------------------------------------------------- */

/** True bila nilai kosong atau hanya berisi spasi. */
export const isBlank = (value) => !String(value ?? '').trim();

/** Escape karakter HTML agar data tersimpan aman disisipkan ke markup. */
export function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/** Buang prefix judul sehingga hanya bagian yang diedit pengguna yang tersisa. */
export function stripJudulPrefix(judul) {
    const value = String(judul ?? '');
    return value.startsWith(JUDUL_PREFIX) ? value.slice(JUDUL_PREFIX.length) : value;
}

/** Susun judul lengkap dengan prefix wajib. */
export const buildJudulLengkap = (suffix) => JUDUL_PREFIX + String(suffix ?? '').trim();

/** Buat ID incident acak, mis. "INC-4821". */
export const generateProblemId = () => 'INC-' + Math.floor(1000 + Math.random() * 9000);

/* -------------------------------------------------------------------------- */
/*  Format tanggal                                                            */
/* -------------------------------------------------------------------------- */

const pad = (n) => String(n).padStart(2, '0');

/** Format ISO string menjadi "dd/mm/yyyy HH:MM:SS" pada waktu lokal. */
export function formatDateTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';

    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
           `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Format ISO string menjadi tanggal ringkas untuk kartu dashboard. */
export function formatShortDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';

    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
           `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* -------------------------------------------------------------------------- */
/*  Template kronologi                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Susun blok kronologi dengan Description & Start Time terisi otomatis.
 * @param {string} judulLengkap Judul termasuk prefix
 * @param {string} startTimeIso Waktu incident dibuat
 * @param {string} narasi       Uraian bebas dari pengguna
 */
export function composeKronologi(judulLengkap, startTimeIso, narasi) {
    return [
        `Description : ${judulLengkap}`,
        `Start Time : ${formatDateTime(startTimeIso)}`,
        `Kronologi : ${narasi ?? ''}`,
    ].join('\n');
}

/** Ambil kembali uraian pengguna, yaitu teks setelah penanda "Kronologi :". */
export function extractNarasi(kronologi) {
    const text = String(kronologi ?? '');
    const marker = text.indexOf('Kronologi :');
    if (marker === -1) return '';
    return text.slice(marker + 'Kronologi :'.length).replace(/^[ \t]+/, '');
}

/* -------------------------------------------------------------------------- */
/*  Aturan task                                                               */
/* -------------------------------------------------------------------------- */

/** Status berikutnya pada rantai task, atau null bila sudah completed. */
export const nextTaskStatus = (status) => TASK_FLOW[status]?.next ?? null;

/** True bila ada minimal satu task dan seluruhnya sudah completed. */
export function allTasksCompleted(tasks) {
    const list = Array.isArray(tasks) ? tasks : [];
    return list.length > 0 && list.every((t) => t.status === 'completed');
}

/** Cari PIC berdasarkan nama atau nama tim. */
export function searchPic(keyword) {
    const q = String(keyword ?? '').trim().toLowerCase();
    if (!q) return [];

    return PIC_DIRECTORY.filter(
        (p) => p.nama.toLowerCase().includes(q) || p.tim.toLowerCase().includes(q)
    );
}

/* -------------------------------------------------------------------------- */
/*  Aturan hak akses                                                          */
/* -------------------------------------------------------------------------- */

/** Incident bersifat final (terkunci permanen) bila bukan lagi Active. */
export const isIncidentLocked = (status) => status !== 'Active';

/** Hanya operator yang boleh mengubah, dan hanya selama incident masih Active. */
export const canEditIncident = (role, status) => role === 'operator' && !isIncidentLocked(status);

/**
 * Resolution & Problem Type baru terbuka setelah seluruh task completed.
 *
 * Catatan: syarat aslinya "diisi setelah status Resolved", namun status Resolved
 * sendiri mensyaratkan kedua kolom itu terisi. Agar tidak saling menunggu,
 * kolom dibuka begitu semua task completed sementara incident masih Active.
 */
export function canFillClosureFields(role, status, tasks) {
    return canEditIncident(role, status) && allTasksCompleted(tasks);
}

/* -------------------------------------------------------------------------- */
/*  Validasi perpindahan status                                               */
/* -------------------------------------------------------------------------- */

/**
 * Kumpulkan syarat yang belum terpenuhi untuk memindahkan incident ke Resolved.
 *
 * @param {object} payload Data incident lengkap
 * @returns {string[]} Daftar kekurangan; array kosong berarti sudah valid
 */
export function collectResolveBlockers(payload) {
    const blockers = [];
    const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    const alert = payload.detail_alert ?? {};

    // Tab A — identitas incident
    if (isBlank(stripJudulPrefix(payload.judul))) {
        blockers.push('Tab Incident Detail: Judul Alert belum diisi.');
    }
    if (isBlank(payload.perangkat)) {
        blockers.push('Tab Incident Detail: Perangkat / Service belum diisi.');
    }

    // Tab C — diperiksa lebih dulu karena menjadi prasyarat kolom penutupan
    if (!tasks.length) {
        blockers.push('Tab Assign Task: belum ada task yang di-assign.');
    } else {
        const pending = tasks.filter((t) => t.status !== 'completed');
        if (pending.length) {
            blockers.push(
                `Tab Assign Task: ${pending.length} task belum completed ` +
                `(${pending.map((t) => t.pic_nama).join(', ')}).`
            );
        }
    }

    // Tab A — penutupan
    if (isBlank(payload.resolution)) {
        blockers.push('Tab Incident Detail: Resolution belum diisi.');
    }
    if (isBlank(payload.problem_type)) {
        blockers.push('Tab Incident Detail: Problem Type belum dipilih.');
    }

    // Tab B — seluruh kolom wajib
    const alertFields = [
        ['jam_muncul', 'Jam Problem Muncul'],
        ['jam_response', 'Jam Response Tim'],
        ['jam_solving', 'Jam Solving'],
        ['root_cause', 'Root Cause'],
        ['impact', 'Impact Problem'],
    ];
    alertFields.forEach(([key, label]) => {
        if (isBlank(alert[key])) {
            blockers.push(`Tab Detail Alert: ${label} belum diisi.`);
        }
    });

    return blockers;
}

/** True bila incident memenuhi seluruh syarat untuk menjadi Resolved. */
export const canResolve = (payload) => collectResolveBlockers(payload).length === 0;

/**
 * Validasi alasan pembatalan.
 * @returns {{valid: boolean, reason: string}}
 */
export function validateCancelReason(reason) {
    const trimmed = String(reason ?? '').trim();
    return { valid: trimmed.length > 0, reason: trimmed };
}

/* -------------------------------------------------------------------------- */
/*  Sinkronisasi state setelah penyimpanan                                    */
/* -------------------------------------------------------------------------- */

/**
 * Gabungkan payload yang baru tersimpan ke state incident yang sedang dibuka.
 *
 * Seluruh field hasil penyimpanan harus disalin, bukan sebagian saja. Bila
 * hanya sebagian yang disalin, form akan terisi ulang dari nilai lama sehingga
 * perubahan tampak hilang, dan penyimpanan berikutnya dapat menimpa data di
 * server dengan nilai usang.
 *
 * Struktur bersarang (detail_alert & tasks) disalin agar hasilnya tidak
 * berbagi referensi dengan payload.
 *
 * @param {object} draft   State panel saat ini (termasuk id dokumen)
 * @param {object} payload Data yang baru ditulis ke penyimpanan
 */
export function mergeSavedPayload(draft, payload) {
    return {
        ...draft,
        ...payload,
        detail_alert: { ...(payload.detail_alert ?? {}) },
        tasks: Array.isArray(payload.tasks) ? payload.tasks.map((t) => ({ ...t })) : [],
    };
}
