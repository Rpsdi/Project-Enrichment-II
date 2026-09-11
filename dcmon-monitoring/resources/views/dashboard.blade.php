@extends('layouts.app')

@section('title', 'Dashboard | myIncident')

@section('body')

    {{-- ============================================================
     KONTEN UTAMA (di-dim saat panel slide-in terbuka)
     ============================================================ --}}
    <div id="app-content" class="min-h-screen">

        {{-- ---------- NAVBAR ---------- --}}
        <nav class="sticky top-0 z-40 border-b border-white/5 bg-[#050505]/80 backdrop-blur-xl">
            <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between gap-4">

                <a href="/" class="font-['Syne',sans-serif] text-2xl font-bold tracking-tighter uppercase shrink-0">
                    <span class="text-white">my</span><span class="text-[rgb(var(--accent))]">Incident</span>
                </a>

                <div class="flex items-center gap-3 md:gap-4">

                    {{-- Identitas + role --}}
                    <div class="hidden sm:flex flex-col items-end leading-tight">
                        <span class="text-sm font-semibold text-white">{{ session('operator_name') }}</span>
                        @if (session('operator_role') === 'operator')
                            <span
                                class="text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--accent))] flex items-center gap-1">
                                <iconify-icon icon="solar:shield-check-bold"></iconify-icon> Operator
                            </span>
                        @else
                            <span
                                class="text-[10px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-1">
                                <iconify-icon icon="solar:eye-bold"></iconify-icon> Staff &middot; View Only
                            </span>
                        @endif
                    </div>

                    @if (session('operator_role') === 'operator')
                        <button id="btnNewIncident" aria-label="Buat incident baru"
                            class="group px-4 md:px-5 py-2.5 bg-[rgb(var(--accent))] text-black text-xs md:text-sm font-bold rounded-full hover:bg-white hover:shadow-[0_0_20px_rgba(var(--accent),0.35)] transition-all duration-300 flex items-center gap-1.5 shrink-0">
                            <iconify-icon icon="solar:add-circle-bold" class="text-base" aria-hidden="true"></iconify-icon>
                            <span class="hidden sm:inline">Buat Incident</span>
                        </button>
                    @endif

                    <a href="/logout" title="Logout" aria-label="Logout"
                        class="w-10 h-10 flex items-center justify-center rounded-full bg-[#111] border border-[#333] text-gray-400 hover:text-red-400 hover:border-red-900 transition-colors duration-300 shrink-0">
                        <iconify-icon icon="solar:logout-3-linear" class="text-lg" aria-hidden="true"></iconify-icon>
                    </a>
                </div>
            </div>
        </nav>

        {{-- ---------- HEADER + STATISTIK ---------- --}}
        <section class="relative overflow-hidden">
            <div class="absolute inset-0 z-0 pointer-events-none opacity-40 animate-blob"
                style="background: radial-gradient(circle at 75% 20%, rgba(var(--accent), 0.12) 0%, transparent 55%);">
            </div>
            <div class="absolute inset-0 z-0 pointer-events-none opacity-20 animate-blob animation-delay-2000"
                style="background: radial-gradient(circle at 20% 80%, rgba(138, 43, 226, 0.10) 0%, transparent 55%);"></div>

            <div class="relative z-10 max-w-7xl mx-auto px-6 pt-12 pb-8">

                <div
                    class="reveal inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm text-xs font-medium text-[rgb(var(--accent))] mb-6">
                    <span
                        class="w-1.5 h-1.5 rounded-full bg-[rgb(var(--accent))] animate-pulse shadow-[0_0_8px_rgb(var(--accent))]"></span>
                    Live Monitoring &middot; Realtime Firestore
                </div>

                <h1
                    class="reveal reveal-delay-100 font-['Syne',sans-serif] text-4xl md:text-6xl font-bold tracking-tighter uppercase leading-[0.95] mb-4">
                    Incident<br>
                    <span
                        class="text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-300 to-gray-500 animate-gradient-x">Tracker.</span>
                </h1>
                <p class="reveal reveal-delay-200 text-gray-400 text-sm md:text-base max-w-2xl mb-10">
                    Catat, telusuri, dan selesaikan gangguan operasional. Incident yang sudah dibuat tidak dapat dihapus
                    &mdash;
                    hanya berpindah status antara <span class="text-[rgb(var(--accent))] font-semibold">Active</span>,
                    <span class="text-emerald-400 font-semibold">Resolved</span>, dan
                    <span class="text-rose-400 font-semibold">Cancelled</span>.
                </p>

                {{-- Kartu statistik --}}
                <div class="reveal reveal-delay-300 grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div
                        class="p-6 border border-[#222] rounded-3xl bg-[#0a0a0a] hover:border-[#444] transition-colors duration-300">
                        <div id="statTotal"
                            class="font-['Syne',sans-serif] text-4xl font-bold text-white mb-2 tracking-tighter">0</div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Total Incident</div>
                    </div>
                    <div
                        class="p-6 border border-[#222] rounded-3xl bg-[#0a0a0a] hover:border-[rgb(var(--accent))] transition-colors duration-300">
                        <div id="statActive"
                            class="font-['Syne',sans-serif] text-4xl font-bold text-[rgb(var(--accent))] mb-2 tracking-tighter">
                            0</div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Active</div>
                    </div>
                    <div
                        class="p-6 border border-[#222] rounded-3xl bg-[#0a0a0a] hover:border-emerald-800 transition-colors duration-300">
                        <div id="statResolved"
                            class="font-['Syne',sans-serif] text-4xl font-bold text-emerald-400 mb-2 tracking-tighter">0
                        </div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Resolved</div>
                    </div>
                    <div
                        class="p-6 border border-[#222] rounded-3xl bg-[#0a0a0a] hover:border-rose-900 transition-colors duration-300">
                        <div id="statCancelled"
                            class="font-['Syne',sans-serif] text-4xl font-bold text-rose-400 mb-2 tracking-tighter">0</div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Cancelled</div>
                    </div>
                </div>
            </div>
        </section>

        {{-- ---------- FILTER + DAFTAR INCIDENT ---------- --}}
        <section class="max-w-7xl mx-auto px-6 pb-32">

            <div
                class="reveal flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 pt-8 border-t border-[#1a1a1a]">
                <div>
                    <h2 class="font-['Syne',sans-serif] text-2xl md:text-3xl font-bold tracking-tighter uppercase mb-2">
                        Daftar Incident
                    </h2>
                    <p class="text-gray-500 text-sm">Klik salah satu kartu untuk membuka detail penanganan.</p>
                </div>

                {{-- Chip filter status --}}
                <div class="flex flex-wrap items-center gap-2" id="filterChips">
                    <button data-filter="all"
                        class="filter-chip px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-black transition-all duration-300">
                        Semua
                    </button>
                    <button data-filter="Active"
                        class="filter-chip px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border border-[#333] bg-[#111] text-gray-400 hover:border-[#555] hover:text-white transition-all duration-300">
                        Active
                    </button>
                    <button data-filter="Resolved"
                        class="filter-chip px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border border-[#333] bg-[#111] text-gray-400 hover:border-[#555] hover:text-white transition-all duration-300">
                        Resolved
                    </button>
                    <button data-filter="Cancelled"
                        class="filter-chip px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border border-[#333] bg-[#111] text-gray-400 hover:border-[#555] hover:text-white transition-all duration-300">
                        Cancelled
                    </button>
                </div>
            </div>

            {{-- Skeleton loading --}}
            <div id="loadingState" class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                @for ($i = 0; $i < 4; $i++)
                    <div class="p-6 rounded-3xl bg-[#0a0a0a] border border-[#1a1a1a] animate-pulse">
                        <div class="h-3 w-24 bg-[#1a1a1a] rounded mb-4"></div>
                        <div class="h-5 w-3/4 bg-[#1a1a1a] rounded mb-3"></div>
                        <div class="h-3 w-1/2 bg-[#1a1a1a] rounded"></div>
                    </div>
                @endfor
            </div>

            {{-- Grid incident --}}
            <div id="incidentGrid" class="grid grid-cols-1 lg:grid-cols-2 gap-5 hidden"></div>

            {{-- Empty state --}}
            <div id="emptyState" class="hidden text-center py-24">
                <div
                    class="w-20 h-20 mx-auto mb-6 rounded-3xl bg-[#0a0a0a] border border-[#222] flex items-center justify-center">
                    <iconify-icon icon="solar:inbox-line-linear" class="text-4xl text-gray-600"></iconify-icon>
                </div>
                <h3 class="font-['Syne',sans-serif] text-xl font-bold text-white mb-2">Belum ada incident</h3>
                <p class="text-gray-500 text-sm" id="emptyStateMsg">Tidak ada data untuk filter ini.</p>
            </div>
        </section>
    </div>

    {{-- ============================================================
     BACKDROP PANEL (klik untuk menutup)
     ============================================================ --}}
    <div id="panelBackdrop"
        class="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm opacity-0 pointer-events-none transition-opacity duration-500">
    </div>

    {{-- ============================================================
     SLIDE-IN PANEL: DETAIL INCIDENT (3 TAB)
     ============================================================ --}}
    <aside id="incidentPanel"
        class="fixed right-0 top-0 h-full w-full sm:w-[520px] bg-[#0a0a0a] border-l border-[#222] flex flex-col translate-x-full transition-transform duration-500 z-[100] shadow-2xl"
        style="transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);" aria-hidden="true">

        {{-- ---------- HEADER PANEL ---------- --}}
        <header class="border-b border-[#222] bg-[#050505] px-6 py-5 shrink-0">
            <div class="flex items-start justify-between gap-4 mb-3">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span id="panelProblemId"
                            class="px-2.5 py-1 rounded-md bg-[#111] border border-[#333] text-[11px] font-mono font-bold text-[rgb(var(--accent))]">
                            INC-NEW
                        </span>
                        <span id="panelStatusBadge"
                            class="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border">
                            Active
                        </span>
                        <span id="panelLockBadge"
                            class="hidden px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#111] border border-[#333] text-gray-400 items-center gap-1">
                            <iconify-icon icon="solar:lock-keyhole-bold"></iconify-icon> Terkunci
                        </span>
                    </div>
                    <h2 id="panelTitle"
                        class="font-['Syne',sans-serif] text-lg font-bold tracking-tight text-white truncate">
                        Incident Baru
                    </h2>
                    <p id="panelMeta" class="text-[11px] text-gray-500 mt-0.5"></p>
                </div>

                <button id="btnClosePanel" title="Tutup" aria-label="Tutup panel detail incident"
                    class="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-[#111] hover:bg-[#222] border border-[#333] transition-colors duration-300">
                    <iconify-icon icon="solar:close-circle-linear" class="text-white text-lg"></iconify-icon>
                </button>
            </div>

            {{-- Tab navigasi --}}
            <div class="flex gap-1.5 flex-wrap">
                <button
                    class="panel-tab-btn px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-[rgb(var(--accent))]/10 text-[rgb(var(--accent))] transition-colors duration-300 flex items-center gap-1.5"
                    data-tab="tabDetail">
                    <iconify-icon icon="solar:document-text-linear"></iconify-icon> Incident Detail
                </button>
                <button
                    class="panel-tab-btn px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider text-gray-500 hover:text-white hover:bg-[#111] transition-colors duration-300 flex items-center gap-1.5"
                    data-tab="tabAlert">
                    <iconify-icon icon="solar:clock-circle-linear"></iconify-icon> Detail Alert
                </button>
                <button
                    class="panel-tab-btn px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider text-gray-500 hover:text-white hover:bg-[#111] transition-colors duration-300 flex items-center gap-1.5"
                    data-tab="tabTask">
                    <iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>
                    Assign Task <span id="tabTaskCount" class="text-gray-600">(0)</span>
                </button>
            </div>
        </header>

        {{-- ---------- ISI PANEL ---------- --}}
        <div class="flex-1 overflow-y-auto px-6 py-6">

            {{-- Banner peringatan validasi --}}
            <div id="validationBox" class="hidden mb-6 rounded-xl border border-amber-900/60 bg-amber-500/10 p-4">
                <div class="flex items-start gap-2.5">
                    <iconify-icon icon="solar:danger-triangle-bold"
                        class="text-amber-400 text-lg shrink-0 mt-0.5"></iconify-icon>
                    <div class="min-w-0">
                        <p class="text-amber-300 text-xs font-bold uppercase tracking-wider mb-2">
                            Belum bisa di-resolve &mdash; lengkapi dulu:
                        </p>
                        <ul id="validationList" class="text-amber-200/90 text-xs space-y-1 list-disc list-inside"></ul>
                    </div>
                </div>
            </div>

            {{-- Banner info read-only --}}
            <div id="lockedBox" class="hidden mb-6 rounded-xl border border-[#333] bg-[#111] p-4">
                <div class="flex items-start gap-2.5">
                    <iconify-icon icon="solar:lock-keyhole-bold"
                        class="text-gray-400 text-lg shrink-0 mt-0.5"></iconify-icon>
                    <div>
                        <p class="text-white text-xs font-bold uppercase tracking-wider mb-1">Incident terkunci</p>
                        <p id="lockedMsg" class="text-gray-400 text-xs leading-relaxed"></p>
                    </div>
                </div>
            </div>

            {{-- Banner info role staff --}}
            <div id="staffBox" class="hidden mb-6 rounded-xl border border-blue-900/50 bg-blue-500/10 p-4">
                <div class="flex items-start gap-2.5">
                    <iconify-icon icon="solar:eye-bold" class="text-blue-400 text-lg shrink-0 mt-0.5"></iconify-icon>
                    <div>
                        <p class="text-blue-300 text-xs font-bold uppercase tracking-wider mb-1">Mode lihat saja</p>
                        <p class="text-blue-200/80 text-xs leading-relaxed">
                            Role <strong>staff</strong> hanya dapat melihat data. Perubahan hanya bisa dilakukan oleh
                            operator.
                        </p>
                    </div>
                </div>
            </div>

            {{-- ======================================================
             TAB A — INCIDENT DETAIL
             ====================================================== --}}
            <div id="tabDetail" class="panel-tab space-y-5">

                {{-- Judul Alert (prefix otomatis) --}}
                <div>
                    <label for="fJudul"
                        class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                        Judul Alert <span class="text-rose-400">*</span>
                    </label>
                    <div
                        class="flex items-stretch rounded-lg border border-[#333] bg-[#050505] overflow-hidden focus-within:border-[rgb(var(--accent))] transition-colors">
                        <span
                            class="px-3 py-2.5 bg-[#141414] border-r border-[#333] text-[rgb(var(--accent))] text-xs font-mono font-bold whitespace-nowrap flex items-center select-none">
                            Event-Mon&nbsp;-
                        </span>
                        <input type="text" id="fJudul" placeholder="High CPU pada node DB-01"
                            class="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none">
                    </div>
                    <p class="text-[10px] text-gray-600 mt-1.5">
                        Prefix <span class="font-mono text-gray-500">Event-Mon -</span> ditambahkan otomatis.
                    </p>
                </div>

                {{-- Kronologi --}}
                <div>
                    <label for="fKronologi"
                        class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                        Kronologi
                    </label>
                    <textarea id="fKronologi" rows="7" spellcheck="false"
                        class="w-full bg-[#050505] border border-[#333] rounded-lg px-3 py-2.5 text-xs text-white font-mono leading-relaxed placeholder-gray-600 focus:outline-none focus:border-[rgb(var(--accent))] transition-colors resize-y"></textarea>
                    <p class="text-[10px] text-gray-600 mt-1.5">
                        Baris <span class="font-mono text-gray-500">Description</span> &amp;
                        <span class="font-mono text-gray-500">Start Time</span> terisi otomatis. Tulis uraian Anda setelah
                        <span class="font-mono text-gray-500">Kronologi :</span>
                    </p>
                </div>

                {{-- Kategori --}}
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label for="fKategoriTim"
                            class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                            Kategori Tim <span class="text-rose-400">*</span>
                        </label>
                        <select id="fKategoriTim"
                            class="w-full bg-[#050505] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[rgb(var(--accent))] transition-colors">
                            <option value="Network">Network</option>
                            <option value="Server">Server</option>
                            <option value="Database">Database</option>
                            <option value="Application">Application</option>
                            <option value="Security">Security</option>
                        </select>
                    </div>
                    <div>
                        <label for="fPerangkat"
                            class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                            Perangkat / Service <span class="text-rose-400">*</span>
                        </label>
                        <input type="text" id="fPerangkat" placeholder="mis. DB-01, Core Router, API Gateway"
                            class="w-full bg-[#050505] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[rgb(var(--accent))] transition-colors">
                    </div>
                </div>

                {{-- Blok closure: Resolution + Problem Type --}}
                <div class="pt-5 border-t border-[#1a1a1a] space-y-5">

                    <div id="closureHint"
                        class="hidden rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2.5 flex items-start gap-2">
                        <iconify-icon icon="solar:lock-keyhole-minimalistic-linear"
                            class="text-gray-500 text-base shrink-0 mt-0.5"></iconify-icon>
                        <p class="text-[11px] text-gray-400 leading-relaxed">
                            <strong class="text-gray-300">Resolution</strong> dan <strong class="text-gray-300">Problem
                                Type</strong>
                            terbuka setelah seluruh task pada tab <em>Assign Task</em> berstatus <strong
                                class="text-emerald-400">completed</strong>.
                        </p>
                    </div>

                    <div>
                        <label for="fResolution"
                            class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                            Resolution <span class="text-gray-600 normal-case tracking-normal font-medium">(wajib untuk
                                resolve)</span>
                        </label>
                        <textarea id="fResolution" rows="3" placeholder="Tindakan penyelesaian akhir..."
                            class="w-full bg-[#050505] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[rgb(var(--accent))] transition-colors resize-y"></textarea>
                    </div>

                    <div>
                        <label for="fProblemType"
                            class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                            Problem Type <span class="text-gray-600 normal-case tracking-normal font-medium">(wajib untuk
                                resolve)</span>
                        </label>
                        <select id="fProblemType"
                            class="w-full bg-[#050505] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[rgb(var(--accent))] transition-colors">
                            <option value="">&mdash; Pilih problem type &mdash;</option>
                            <option value="Configuration Error">Configuration Error</option>
                            <option value="Hardware Failure">Hardware Failure</option>
                            <option value="Software Bug">Software Bug</option>
                            <option value="Human Error">Human Error</option>
                            <option value="Capacity Issue">Capacity Issue</option>
                            <option value="Others">Others</option>
                        </select>
                    </div>
                </div>

                {{-- Alasan pembatalan (hanya tampil bila Cancelled) --}}
                <div id="cancelReasonView" class="hidden pt-5 border-t border-[#1a1a1a]">
                    <label class="block text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-2">
                        Alasan Pembatalan
                    </label>
                    <p id="cancelReasonText"
                        class="text-sm text-rose-200/90 bg-rose-500/10 border border-rose-900/50 rounded-lg px-3 py-2.5 whitespace-pre-wrap">
                    </p>
                </div>
            </div>

            {{-- ======================================================
             TAB B — DETAIL ALERT
             ====================================================== --}}
            <div id="tabAlert" class="panel-tab hidden space-y-5">

                <p class="text-[11px] text-gray-500 leading-relaxed bg-[#111] border border-[#222] rounded-lg px-3 py-2.5">
                    <iconify-icon icon="solar:info-circle-bold" class="text-gray-400"></iconify-icon>
                    Seluruh kolom di tab ini <strong class="text-gray-300">wajib terisi</strong> sebelum status incident
                    dapat diubah menjadi Resolved.
                </p>

                <div>
                    <label for="fJamMuncul"
                        class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                        Jam Problem Muncul <span class="text-rose-400">*</span>
                    </label>
                    <input type="datetime-local" id="fJamMuncul"
                        class="w-full bg-[#050505] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[rgb(var(--accent))] transition-colors">
                </div>

                <div>
                    <label for="fJamResponse"
                        class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                        Jam Response Tim <span class="text-rose-400">*</span>
                    </label>
                    <input type="datetime-local" id="fJamResponse"
                        class="w-full bg-[#050505] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[rgb(var(--accent))] transition-colors">
                </div>

                <div>
                    <label for="fJamSolving"
                        class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                        Jam Solving <span class="text-rose-400">*</span>
                    </label>
                    <input type="datetime-local" id="fJamSolving"
                        class="w-full bg-[#050505] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[rgb(var(--accent))] transition-colors">
                </div>

                <div>
                    <label for="fRootCause"
                        class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                        Root Cause <span class="text-rose-400">*</span>
                    </label>
                    <textarea id="fRootCause" rows="3" placeholder="Akar penyebab masalah..."
                        class="w-full bg-[#050505] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[rgb(var(--accent))] transition-colors resize-y"></textarea>
                </div>

                <div>
                    <label for="fImpact"
                        class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                        Impact Problem <span class="text-rose-400">*</span>
                    </label>
                    <textarea id="fImpact" rows="3" placeholder="Dampak yang ditimbulkan..."
                        class="w-full bg-[#050505] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[rgb(var(--accent))] transition-colors resize-y"></textarea>
                </div>
            </div>

            {{-- ======================================================
             TAB C — ASSIGN TASK
             ====================================================== --}}
            <div id="tabTask" class="panel-tab hidden space-y-5">

                {{-- Form penambahan task --}}
                <div id="taskForm" class="rounded-2xl border border-[#222] bg-[#0d0d0d] p-4 space-y-4">
                    <h3 class="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                        <iconify-icon icon="solar:user-plus-linear"
                            class="text-[rgb(var(--accent))] text-base"></iconify-icon>
                        Assign Task Baru
                    </h3>

                    {{-- Pencarian owner --}}
                    <div class="relative">
                        <label for="fPicSearch"
                            class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                            Cari Owner
                        </label>
                        <div class="relative">
                            <iconify-icon icon="solar:magnifer-linear"
                                class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-base pointer-events-none"></iconify-icon>
                            <input type="text" id="fPicSearch" autocomplete="off"
                                placeholder="ketik nama atau tim..."
                                class="w-full bg-[#050505] border border-[#333] rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[rgb(var(--accent))] transition-colors">
                        </div>
                        {{-- Hasil pencarian --}}
                        <div id="picResults"
                            class="hidden absolute z-20 left-0 right-0 mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-[#333] bg-[#111] shadow-2xl">
                        </div>
                    </div>

                    {{-- Terisi otomatis dari hasil pencarian --}}
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label for="fPicTim"
                                class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                                Tim
                            </label>
                            <input type="text" id="fPicTim" readonly placeholder="otomatis"
                                class="w-full bg-[#141414] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-gray-300 placeholder-gray-600 focus:outline-none cursor-default">
                        </div>
                        <div>
                            <label for="fPicNama"
                                class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                                Owner (PIC)
                            </label>
                            <input type="text" id="fPicNama" readonly placeholder="otomatis"
                                class="w-full bg-[#141414] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-gray-300 placeholder-gray-600 focus:outline-none cursor-default">
                        </div>
                    </div>

                    <div>
                        <label for="fTaskAction"
                            class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                            Action
                        </label>
                        <textarea id="fTaskAction" rows="2" placeholder="Apa yang harus dilakukan PIC..."
                            class="w-full bg-[#050505] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[rgb(var(--accent))] transition-colors resize-y"></textarea>
                    </div>

                    <button id="btnAddTask"
                        class="w-full py-2.5 bg-[rgb(var(--accent))] text-black text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-white transition-colors duration-300 flex items-center justify-center gap-1.5">
                        <iconify-icon icon="solar:add-circle-bold" class="text-base"></iconify-icon> Tambah Task
                    </button>
                </div>

                {{-- Daftar task --}}
                <div>
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Daftar Task</h3>
                        <span id="taskProgress" class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">0 /
                            0 completed</span>
                    </div>
                    <div id="taskList" class="space-y-2.5"></div>
                </div>
            </div>
        </div>

        {{-- ---------- FOOTER PANEL: STATUS + SIMPAN ---------- --}}
        <footer id="panelFooter" class="border-t border-[#222] bg-[#050505] px-6 py-4 shrink-0 space-y-3">
            <div class="flex items-end gap-3">
                <div class="flex-1 min-w-0">
                    <label for="fStatus"
                        class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                        Status Incident
                    </label>
                    <select id="fStatus"
                        class="w-full bg-[#111] border border-[#333] rounded-lg px-3 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-[rgb(var(--accent))] transition-colors">
                        <option value="Active">Active</option>
                        <option value="Resolved">Resolved</option>
                        <option value="Cancelled">Cancelled</option>
                    </select>
                </div>
                <button id="btnSavePanel"
                    class="flex-1 py-2.5 bg-[rgb(var(--accent))] text-black text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-white hover:shadow-[0_0_15px_rgba(var(--accent),0.25)] transition-all duration-300 flex items-center justify-center gap-1.5 h-[42px]">
                    <iconify-icon icon="solar:diskette-bold" class="text-base"></iconify-icon>
                    <span id="btnSaveLabel">Simpan</span>
                </button>
            </div>
            <p class="text-[10px] text-gray-600 leading-relaxed">
                Incident tidak dapat dihapus. Status <strong class="text-emerald-400">Resolved</strong> dan
                <strong class="text-rose-400">Cancelled</strong> bersifat final &mdash; data terkunci permanen.
            </p>
        </footer>
    </aside>

    {{-- ============================================================
     MODAL: ALASAN PEMBATALAN
     ============================================================ --}}
    <div id="cancelModal"
        class="fixed inset-0 z-[150] bg-black/60 backdrop-blur-md hidden opacity-0 transition-opacity duration-300 flex items-center justify-center px-6">
        <div id="cancelModalBox"
            class="bg-[#0a0a0a] border border-[#222] p-7 rounded-2xl w-full max-w-md transform scale-95 transition-transform duration-300 shadow-2xl">

            <div class="flex items-center gap-3 mb-5 border-b border-[#222] pb-4">
                <iconify-icon icon="solar:close-circle-bold" class="text-2xl text-rose-400"></iconify-icon>
                <h2 class="text-lg font-['Syne',sans-serif] font-bold tracking-tight text-white">Batalkan Incident</h2>
            </div>

            <p class="text-xs text-gray-400 leading-relaxed mb-4">
                Pembatalan bersifat <strong class="text-rose-400">final</strong>. Setelah dibatalkan, seluruh data incident
                terkunci permanen dan tidak dapat diubah lagi. Alasan wajib diisi.
            </p>

            <label for="fCancelReason" class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                Alasan Pembatalan <span class="text-rose-400">*</span>
            </label>
            <textarea id="fCancelReason" rows="3" placeholder="mis. false alarm dari sistem monitoring"
                class="w-full bg-[#050505] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-rose-500 transition-colors resize-y"></textarea>
            <p id="cancelReasonError" class="hidden text-rose-400 text-xs font-medium mt-2">
                Alasan pembatalan wajib diisi.
            </p>

            <div class="flex gap-3 mt-6">
                <button id="btnCancelModalAbort"
                    class="flex-1 py-2.5 bg-[#111] border border-[#333] text-gray-300 text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#1a1a1a] hover:text-white transition-colors duration-300">
                    Kembali
                </button>
                <button id="btnCancelModalConfirm"
                    class="flex-1 py-2.5 bg-rose-500 text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-rose-400 transition-colors duration-300">
                    Batalkan Incident
                </button>
            </div>
        </div>
    </div>
@endsection

@push('scripts')
    {{-- Injeksi konfigurasi dari server ke client --}}
    <script>
        window.__APP_CONFIG = {
            firebase: {
                apiKey: @json(config('firebase.api_key')),
                authDomain: @json(config('firebase.auth_domain')),
                projectId: @json(config('firebase.project_id')),
                storageBucket: @json(config('firebase.storage_bucket')),
                messagingSenderId: @json(config('firebase.messaging_sender_id')),
                appId: @json(config('firebase.app_id')),
            },
            user: {
                name: @json(session('operator_name')),
                id: @json(session('operator_id')),
                role: @json(session('operator_role', 'staff')),
            },
        };
    </script>
    <script type="module" src="{{ asset('js/myincident.js') }}"></script>
@endpush
