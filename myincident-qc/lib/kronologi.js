/**
 * ============================================================================
 *  myIncident QC — Kronologi_Parser & Kronologi_Printer
 * ============================================================================
 *  Modul murni: tanpa DOM, tanpa chrome.*, tanpa jaringan. Tugasnya mengubah
 *  teks field `kronologi` menjadi daftar entri waktu terstruktur, dan
 *  sebaliknya.
 *
 *  Bentuk field `kronologi` pada myIncident selalu tiga baris:
 *      Description : Event-Mon - <judul>
 *      Start Time : dd/mm/yyyy HH:MM:SS
 *      Kronologi : <narasi bebas, di sinilah baris HH:MM berada>
 *
 *  Hanya teks setelah penanda `Kronologi :` yang diproses, sehingga pola
 *  `HH:MM:SS` pada baris `Start Time :` tidak pernah salah tertangkap.
 * ============================================================================
 */

(function attachKronologi(root) {
    const MQC = (root.MQC = root.MQC || {});

    /** Penanda awal bagian narasi pada field `kronologi`. */
    const MARKER = 'Kronologi :';

    /** Batas panjang pesan satu entri. */
    const MAX_MESSAGE_LENGTH = 1000;

    /** Batas jumlah entri yang diproses per field. */
    const MAX_ENTRIES = 500;

    /**
     * Pola baris entri: dua digit jam, titik dua, dua digit menit, lalu pesan.
     * `(?!:)` menolak pola berdetik seperti `08:15:30` agar baris `Start Time`
     * atau timestamp lengkap tidak ikut tertangkap.
     */
    const ENTRY_PATTERN = /^(\d{2}):(\d{2})(?!:)\s*(.*)$/;

    const pad2 = (n) => String(n).padStart(2, '0');

    /**
     * Ambil hanya bagian narasi, yaitu teks setelah kemunculan pertama
     * penanda `Kronologi :`.
     * @param {string} kronologi Isi field `kronologi`
     * @returns {{hasMarker: boolean, narasi: string}}
     */
    function sliceNarasi(kronologi) {
        const text = String(kronologi ?? '');
        const at = text.indexOf(MARKER);

        if (at === -1) return { hasMarker: false, narasi: '' };

        return {
            hasMarker: true,
            narasi: text.slice(at + MARKER.length).replace(/^[ \t]+/, ''),
        };
    }

    /**
     * Buang tepat satu pasang tanda kurung yang membungkus keseluruhan pesan.
     * Tanda kurung yang hanya membungkus sebagian pesan dibiarkan utuh.
     * @param {string} message Pesan mentah
     * @returns {string} Pesan hasil normalisasi
     */
    function normalizeMessage(message) {
        const trimmed = String(message ?? '').trim();

        if (trimmed.length < 2) return trimmed;
        if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return trimmed;

        // Pastikan kurung pembuka pertama benar-benar pasangan kurung penutup
        // terakhir, supaya `(a) dan (b)` tidak dianggap terbungkus.
        let depth = 0;

        for (let i = 0; i < trimmed.length; i += 1) {
            if (trimmed[i] === '(') depth += 1;
            else if (trimmed[i] === ')') depth -= 1;

            if (depth === 0 && i < trimmed.length - 1) return trimmed;
        }

        return depth === 0 ? trimmed.slice(1, -1).trim() : trimmed;
    }

    /**
     * Ubah teks `kronologi` menjadi daftar Kronologi_Entry.
     *
     * Baris yang tidak diawali pola `HH:MM`, berjam/bermenit di luar rentang,
     * atau berpesan kosong akan dilewati tanpa menghentikan pemrosesan.
     *
     * @param {string} kronologi Isi field `kronologi`
     * @returns {{hasMarker: boolean, entries: Array<{hour: number, minute: number, message: string}>, truncated: boolean}}
     */
    function parseKronologi(kronologi) {
        const { hasMarker, narasi } = sliceNarasi(kronologi);
        const entries = [];
        let truncated = false;

        if (!hasMarker) return { hasMarker: false, entries, truncated };

        const lines = narasi.split(/\r?\n/);

        for (const line of lines) {
            const match = ENTRY_PATTERN.exec(line.replace(/^[ \t]+/, ''));
            if (!match) continue;

            const hour = Number(match[1]);
            const minute = Number(match[2]);

            if (hour < 0 || hour > 23) continue;
            if (minute < 0 || minute > 59) continue;

            let message = normalizeMessage(match[3]);
            if (!message) continue;

            if (message.length > MAX_MESSAGE_LENGTH) {
                message = message.slice(0, MAX_MESSAGE_LENGTH);
            }

            if (entries.length >= MAX_ENTRIES) {
                truncated = true;
                break;
            }

            entries.push({ hour, minute, message });
        }

        return { hasMarker: true, entries, truncated };
    }

    /**
     * Ubah daftar Kronologi_Entry kembali menjadi teks baris `HH:MM PESAN`.
     * @param {Array<{hour: number, minute: number, message: string}>} entries
     * @returns {string} Teks narasi
     */
    function printKronologi(entries) {
        const list = Array.isArray(entries) ? entries : [];

        return list
            .map((e) => `${pad2(e.hour)}:${pad2(e.minute)} ${String(e.message ?? '').trim()}`)
            .join('\n');
    }

    /**
     * Susun ulang field `kronologi` dengan mempertahankan baris `Description :`
     * dan `Start Time :`, lalu mengganti hanya teks setelah `Kronologi :`.
     *
     * Dipakai saat autofill agar metadata incident yang sedang dibuka tidak
     * ikut tertimpa oleh narasi incident lama.
     *
     * @param {string} kronologiSekarang Isi field `kronologi` saat ini
     * @param {string} narasiBaru Narasi pengganti
     * @returns {string} Field `kronologi` hasil penggabungan
     */
    function replaceNarasi(kronologiSekarang, narasiBaru) {
        const text = String(kronologiSekarang ?? '');
        const at = text.indexOf(MARKER);
        const narasi = String(narasiBaru ?? '');

        if (at === -1) return `${MARKER} ${narasi}`.trimEnd();

        return `${text.slice(0, at + MARKER.length)} ${narasi}`.trimEnd();
    }

    /** Ambil narasi mentah (teks setelah `Kronologi :`) dari sebuah incident. */
    function narasiOf(kronologi) {
        return sliceNarasi(kronologi).narasi.trim();
    }

    MQC.kronologi = {
        MARKER,
        MAX_MESSAGE_LENGTH,
        MAX_ENTRIES,
        parseKronologi,
        printKronologi,
        replaceNarasi,
        normalizeMessage,
        narasiOf,
    };
})(typeof self !== 'undefined' ? self : globalThis);
