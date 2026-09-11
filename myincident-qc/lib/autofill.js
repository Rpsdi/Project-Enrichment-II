/**
 * ============================================================================
 *  myIncident QC — Autofill_Engine
 * ============================================================================
 *  Modul murni untuk memeringkat template incident Resolved. Perangkat yang
 *  sama selalu menjadi sinyal terkuat. Judul berfungsi seperti pencarian:
 *  satu token bermakna seperti "High" langsung menampilkan semua template
 *  Resolved yang memuat token tersebut. Nilai persentase dibuang agar
 *  "High CPU GH231 90%" tetap cocok dengan "High CPU GH231 95%", sedangkan
 *  token alfanumerik hostname seperti GH231 tidak berubah.
 * ============================================================================
 */

(function attachAutofill(root) {
    const MQC = (root.MQC = root.MQC || {});
    const { toDate } = MQC.stall;

    const JUDUL_PREFIX = 'Event-Mon - ';
    /** Seluruh library template dipindai agar hasil search tidak terpotong. */
    const SCAN_LIMIT = Number.POSITIVE_INFINITY;
    const MIN_WORD_LENGTH = 2;
    const MIN_TITLE_SHARED = 1;

    const SCORE = {
        perangkat: 1000,
        perKeyword: 20,
        keywordCap: 120,
        kategori: 10,
        minimum: 20,
    };

    const STOP_WORDS = new Set([
        'event', 'mon', 'on', 'of', 'the', 'a', 'an', 'di', 'ke', 'dari',
        'pada', 'dan', 'atau', 'yang', 'server', 'service', 'alert',
    ]);

    const norm = (value) => String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

    function stripPrefix(judul) {
        return String(judul ?? '').replace(/^\s*event\s*-?\s*mon\s*-\s*/i, '');
    }

    /** Hapus angka persentase saja; digit hostname/perangkat tetap utuh. */
    function removePercentages(value) {
        return String(value ?? '').replace(/\b\d+(?:[.,]\d+)?\s*%/g, ' ');
    }

    function tokenize(judul) {
        const base = norm(removePercentages(stripPrefix(judul)));
        const words = base
            .split(/[^a-z0-9]+/)
            .filter((word) => word.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(word));
        return new Set(words);
    }

    function sharedTokenCount(left, right) {
        let count = 0;
        for (const token of left) {
            if (right.has(token)) count += 1;
        }
        return count;
    }

    function scoreIncident(template, ctx, ctxWords = tokenize(ctx?.judul)) {
        const templateDevice = norm(template?.perangkat);
        const contextDevice = norm(ctx?.perangkat);
        const matchPerangkat = Boolean(
            templateDevice && contextDevice && templateDevice === contextDevice,
        );
        const sharedWords = sharedTokenCount(tokenize(template?.judul), ctxWords);
        const titleEligible = sharedWords >= MIN_TITLE_SHARED;

        // Kategori saja tidak pernah cukup untuk menghasilkan usulan.
        if (!matchPerangkat && !titleEligible) {
            return { score: 0, matchPerangkat, sharedWords, titleEligible: false };
        }

        let score = matchPerangkat ? SCORE.perangkat : 0;
        score += Math.min(sharedWords * SCORE.perKeyword, SCORE.keywordCap);

        if (norm(ctx?.kategoriTim) && norm(template?.kategori_tim) === norm(ctx?.kategoriTim)) {
            score += SCORE.kategori;
        }

        return { score, matchPerangkat, sharedWords, titleEligible };
    }

    const candidateTime = (template) =>
        toDate(template?.resolved_at || template?.updated_at || template?.created_at)?.getTime() ?? 0;

    function findSimilar(templates, ctx, options = {}) {
        const list = Array.isArray(templates) ? templates : [];
        const limit = Number.isInteger(options.limit) ? options.limit : 5;
        const ctxWords = tokenize(ctx?.judul);

        // Jangan menawarkan apa pun sebelum ada perangkat atau judul yang cukup.
        if (norm(ctx?.perangkat).length < 2 && ctxWords.size < MIN_TITLE_SHARED) return [];

        const pool = list
            .slice()
            .sort((a, b) => candidateTime(b) - candidateTime(a))
            .slice(0, SCAN_LIMIT);
        const scored = [];

        for (const template of pool) {
            if (options.excludeId && String(template?.id ?? '') === String(options.excludeId)) continue;
            if (
                options.excludeProblemId &&
                String(template?.problem_id ?? '') === String(options.excludeProblemId)
            ) continue;

            const row = scoreIncident(template, ctx, ctxWords);
            if (row.score < SCORE.minimum) continue;
            scored.push({ template, ...row });
        }

        scored.sort((a, b) => {
            // Prioritas perangkat bersifat absolut, bukan sekadar tie breaker.
            if (a.matchPerangkat !== b.matchPerangkat) return a.matchPerangkat ? -1 : 1;
            if (b.score !== a.score) return b.score - a.score;
            return candidateTime(b.template) - candidateTime(a.template);
        });

        return scored.slice(0, Math.max(0, limit)).map((row) => ({
            id: row.template.id ?? null,
            problem_id: row.template.problem_id ?? '-',
            judul: row.template.judul ?? '',
            perangkat: row.template.perangkat ?? '',
            kategori_tim: row.template.kategori_tim ?? '',
            created_at: row.template.created_at ?? null,
            resolved_at: row.template.resolved_at ?? null,
            status: 'Resolved',
            score: row.score,
            matchPerangkat: row.matchPerangkat,
            sharedWords: row.sharedWords,
            values: valuesOf(row.template),
        }));
    }

    /**
     * Hanya field aman yang ditawarkan. PIC, tim PIC, dan status task sengaja
     * tidak pernah menjadi bagian values.
     */
    function valuesOf(template) {
        const detail = template?.detail_alert ?? {};
        const actions = Array.isArray(template?.taskActions)
            ? template.taskActions
            : (Array.isArray(template?.tasks)
                ? template.tasks.map((task) => task?.action)
                : []);
        const taskActions = actions.map((value) => String(value ?? '').trim()).filter(Boolean);

        return {
            kategori_tim: String(template?.kategori_tim ?? '').trim(),
            kronologi: String(
                template?.kronologiNarasi ?? MQC.kronologi?.narasiOf?.(template?.kronologi) ?? '',
            ).trim(),
            root_cause: String(template?.root_cause ?? detail?.root_cause ?? '').trim(),
            impact: String(template?.impact ?? detail?.impact ?? '').trim(),
            resolution: String(template?.resolution ?? '').trim(),
            problem_type: String(template?.problem_type ?? '').trim(),
            task_action: taskActions[0] ?? '',
            taskActions,
        };
    }

    MQC.autofill = {
        JUDUL_PREFIX,
        SCORE,
        SCAN_LIMIT,
        MIN_WORD_LENGTH,
        MIN_TITLE_SHARED,
        STOP_WORDS,
        norm,
        stripPrefix,
        removePercentages,
        tokenize,
        sharedTokenCount,
        scoreIncident,
        findSimilar,
        valuesOf,
    };
})(typeof self !== 'undefined' ? self : globalThis);
