/**
 * ============================================================================
 *  myIncident QC — Firestore_Client
 * ============================================================================
 *  Membaca collection `incidents` melalui Firestore REST API. Hanya HTTP GET,
 *  tidak pernah menulis. Dijalankan dari service worker sehingga permintaan
 *  memakai host permission extension dan bebas dari batasan CORS halaman.
 *
 *  Respons Firestore membungkus setiap nilai dalam penanda tipe
 *  (`stringValue`, `mapValue`, dan seterusnya). Modul ini membuka pembungkus
 *  tersebut agar lapisan lain bekerja dengan objek JavaScript biasa.
 * ============================================================================
 */

(function attachFirestore(root) {
    const MQC = (root.MQC = root.MQC || {});
    const { firebase, collection, limits } = MQC.config;

    /** Kedalaman maksimum pembukaan pembungkus tipe. */
    const MAX_DEPTH = 5;

    const BASE_URL =
        `https://firestore.googleapis.com/v1/projects/${firebase.projectId}` +
        `/databases/(default)/documents/${collection}`;

    /**
     * Buka satu nilai berpembungkus tipe Firestore.
     * @param {object} wrapped Nilai berpembungkus
     * @param {number} depth Kedalaman saat ini
     */
    function unwrapValue(wrapped, depth = 0) {
        if (wrapped === null || typeof wrapped !== 'object') return null;
        if (depth > MAX_DEPTH) return null;

        if ('nullValue' in wrapped) return null;
        if ('stringValue' in wrapped) return wrapped.stringValue;
        if ('booleanValue' in wrapped) return Boolean(wrapped.booleanValue);
        if ('integerValue' in wrapped) return Number(wrapped.integerValue);
        if ('doubleValue' in wrapped) return Number(wrapped.doubleValue);
        if ('timestampValue' in wrapped) return wrapped.timestampValue;
        if ('bytesValue' in wrapped) return wrapped.bytesValue;
        if ('referenceValue' in wrapped) return wrapped.referenceValue;
        if ('geoPointValue' in wrapped) return wrapped.geoPointValue;

        if ('arrayValue' in wrapped) {
            const values = wrapped.arrayValue?.values;
            if (!Array.isArray(values)) return [];
            return values.map((v) => unwrapValue(v, depth + 1));
        }

        if ('mapValue' in wrapped) {
            return unwrapFields(wrapped.mapValue?.fields, depth + 1);
        }

        return null;
    }

    /**
     * Buka seluruh field sebuah dokumen atau map.
     * @param {object} fields Objek field berpembungkus
     * @param {number} depth Kedalaman saat ini
     */
    function unwrapFields(fields, depth = 0) {
        const out = {};
        if (!fields || typeof fields !== 'object') return out;

        for (const [key, value] of Object.entries(fields)) {
            out[key] = unwrapValue(value, depth);
        }

        return out;
    }

    /** Ambil doc id dari properti `name` dokumen Firestore. */
    const docIdOf = (name) => String(name ?? '').split('/').pop() ?? null;

    /**
     * Bentuk Incident_Record lengkap, mengisi field yang hilang dengan nilai
     * bawaan supaya lapisan lain tidak perlu memeriksa keberadaan field.
     *
     * @param {object} doc Dokumen Firestore mentah
     * @returns {object} Incident_Record
     */
    function toIncidentRecord(doc) {
        const f = unwrapFields(doc?.fields);
        const detail = f.detail_alert && typeof f.detail_alert === 'object' ? f.detail_alert : {};

        return {
            id: docIdOf(doc?.name),
            problem_id: f.problem_id ?? null,
            judul: f.judul ?? null,
            kronologi: f.kronologi ?? null,
            kategori_tim: f.kategori_tim ?? null,
            perangkat: f.perangkat ?? null,
            status: f.status ?? null,
            created_at: f.created_at ?? doc?.createTime ?? null,
            updated_at: f.updated_at ?? doc?.updateTime ?? null,
            resolved_by: f.resolved_by ?? null,
            resolved_at: f.resolved_at ?? null,
            resolution: f.resolution ?? null,
            problem_type: f.problem_type ?? null,
            cancel_reason: f.cancel_reason ?? null,
            tasks: Array.isArray(f.tasks) ? f.tasks : [],
            detail_alert: {
                jam_muncul: detail.jam_muncul ?? null,
                jam_response: detail.jam_response ?? null,
                jam_solving: detail.jam_solving ?? null,
                root_cause: detail.root_cause ?? null,
                impact: detail.impact ?? null,
            },
        };
    }

    /** Bangun URL satu halaman. */
    function pageUrl(pageToken) {
        const url = new URL(BASE_URL);
        url.searchParams.set('key', firebase.apiKey);
        url.searchParams.set('pageSize', String(limits.pageSize));
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        return url.toString();
    }

    /** GET satu halaman dengan timeout per permintaan. */
    async function fetchPage(pageToken) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), limits.requestTimeoutMs);

        try {
            const response = await fetch(pageUrl(pageToken), {
                method: 'GET',
                signal: controller.signal,
                cache: 'no-store',
            });

            if (!response.ok) {
                return {
                    ok: false,
                    status: response.status,
                    error: `Firestore menolak permintaan (HTTP ${response.status}).`,
                };
            }

            return { ok: true, body: await response.json() };
        } catch (error) {
            const aborted = error?.name === 'AbortError';

            return {
                ok: false,
                status: 0,
                timeout: aborted,
                error: aborted
                    ? `Permintaan ke Firestore melewati ${limits.requestTimeoutMs / 1000} detik.`
                    : `Permintaan ke Firestore gagal: ${String(error?.message ?? error)}`,
            };
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Ambil seluruh dokumen collection `incidents`.
     *
     * @returns {Promise<{ok: boolean, incidents?: Array<object>, truncated?: boolean, status?: number, timeout?: boolean, error?: string}>}
     */
    async function fetchIncidents() {
        if (!firebase.apiKey || typeof firebase.apiKey !== 'string') {
            return { ok: false, status: 0, error: 'API key Firebase belum terisi pada config.js.' };
        }

        const startedAt = Date.now();
        const incidents = [];
        let pageToken = null;
        let pages = 0;
        let truncated = false;

        do {
            if (Date.now() - startedAt > limits.totalTimeoutMs) {
                return {
                    ok: false,
                    status: 0,
                    timeout: true,
                    error: `Pengambilan seluruh halaman melewati ${limits.totalTimeoutMs / 1000} detik.`,
                };
            }

            const page = await fetchPage(pageToken);
            if (!page.ok) return page;

            const documents = Array.isArray(page.body?.documents) ? page.body.documents : [];
            for (const doc of documents) incidents.push(toIncidentRecord(doc));

            pages += 1;
            pageToken = page.body?.nextPageToken || null;

            if (pageToken && (pages >= limits.maxPages || incidents.length >= limits.maxDocs)) {
                truncated = true;
                break;
            }
        } while (pageToken);

        return { ok: true, incidents, truncated };
    }

    MQC.firestore = {
        BASE_URL,
        MAX_DEPTH,
        unwrapValue,
        unwrapFields,
        toIncidentRecord,
        fetchIncidents,
    };
})(typeof self !== 'undefined' ? self : globalThis);
