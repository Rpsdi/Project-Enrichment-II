<!DOCTYPE html>
<html lang="id" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', 'myIncident')</title>

    <script src="https://cdn.tailwindcss.com"></script>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Syne:wght@500;600;700;800&display=swap" rel="stylesheet">

    <script src="https://code.iconify.design/iconify-icon/1.0.7/iconify-icon.min.js"></script>

    <style id="theme-styles">
        :root {
            /* Accent lime #ccff00 dalam format RGB agar bisa dipakai dengan opacity */
            --accent: 204, 255, 0;
        }
    </style>

    <style>
        /* ---------- ANIMASI: BLOB BACKGROUND ---------- */
        @keyframes blob {
            0%   { transform: translate(0px, 0px) scale(1); }
            33%  { transform: translate(30px, -50px) scale(1.1); }
            66%  { transform: translate(-20px, 20px) scale(0.9); }
            100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob { animation: blob 15s infinite alternate ease-in-out; }
        .animation-delay-2000 { animation-delay: 2s; }

        /* ---------- ANIMASI: SCROLL REVEAL ---------- */
        .reveal {
            opacity: 0;
            transform: translateY(30px);
            transition: all 0.8s cubic-bezier(0.5, 0, 0, 1);
        }
        .reveal.active { opacity: 1; transform: translateY(0); }
        .reveal-delay-100 { transition-delay: 100ms; }
        .reveal-delay-200 { transition-delay: 200ms; }
        .reveal-delay-300 { transition-delay: 300ms; }
        .reveal-delay-400 { transition-delay: 400ms; }

        /* ---------- ANIMASI: GRADIENT TEXT ---------- */
        @keyframes gradient-x {
            0%, 100% { background-position: 0% 50%; }
            50%      { background-position: 100% 50%; }
        }
        .animate-gradient-x {
            background-size: 200% auto;
            animation: gradient-x 4s linear infinite;
        }

        /* ---------- ANIMASI: SHAKE (untuk error / validasi gagal) ---------- */
        @keyframes shake {
            0%, 100%  { transform: translateX(0); }
            20%, 60%  { transform: translateX(-6px); }
            40%, 80%  { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }

        /* ---------- SCROLLBAR ---------- */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #050505; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgb(var(--accent)); }

        /* ---------- SLIDE-IN PANEL: efek dim pada konten di belakang ---------- */
        #app-content { transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
        .panel-open #app-content {
            opacity: 0.4;
            pointer-events: none;
        }

        /* Input dalam kondisi terkunci (read-only / role staff) */
        .is-locked,
        input:disabled,
        select:disabled,
        textarea:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }

        /* Normalisasi tampilan datetime-local picker di dark theme */
        input[type="datetime-local"]::-webkit-calendar-picker-indicator {
            filter: invert(1) opacity(0.5);
            cursor: pointer;
        }
    </style>
    @stack('styles')
</head>
<body class="bg-[#050505] text-[#f5f5f5] font-['Plus_Jakarta_Sans',sans-serif] antialiased selection:bg-[rgb(var(--accent))] selection:text-black overflow-x-hidden min-h-screen">

    {{-- ============ TOAST NOTIFICATION ============ --}}
    <div id="toast"
         class="fixed top-6 right-6 z-[200] bg-white text-black px-6 py-3 rounded-xl font-semibold text-sm shadow-2xl transform translate-x-[150%] transition-transform duration-300 flex items-center gap-2 border-l-4 border-[rgb(var(--accent))] max-w-md">
        <iconify-icon id="toast-icon" icon="solar:check-circle-bold" class="text-lg shrink-0"></iconify-icon>
        <span id="toast-msg">Success!</span>
    </div>

    @yield('body')

    <script>
        /* ============================================================
           UTILITAS GLOBAL
           ============================================================ */

        /**
         * Tampilkan toast notification.
         * @param {string} msg  Pesan yang ditampilkan
         * @param {'success'|'error'|'info'} type  Menentukan warna & ikon
         */
        window.showToast = function (msg, type = 'success') {
            const toast = document.getElementById('toast');
            const icon  = document.getElementById('toast-icon');

            document.getElementById('toast-msg').textContent = msg;

            // Reset varian warna
            toast.classList.remove(
                'border-[rgb(var(--accent))]', 'border-red-500', 'border-blue-500'
            );

            if (type === 'error') {
                toast.classList.add('border-red-500');
                icon.setAttribute('icon', 'solar:danger-triangle-bold');
            } else if (type === 'info') {
                toast.classList.add('border-blue-500');
                icon.setAttribute('icon', 'solar:info-circle-bold');
            } else {
                toast.classList.add('border-[rgb(var(--accent))]');
                icon.setAttribute('icon', 'solar:check-circle-bold');
            }

            toast.classList.remove('translate-x-[150%]');

            clearTimeout(window.__toastTimer);
            window.__toastTimer = setTimeout(
                () => toast.classList.add('translate-x-[150%]'),
                4000
            );
        };

        /**
         * Aktifkan animasi reveal saat elemen masuk viewport.
         * Aman dipanggil berulang kali setelah render dinamis.
         */
        window.initScrollReveal = function () {
            const reveals = document.querySelectorAll('.reveal:not(.active)');
            if (!reveals.length) return;

            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('active');
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

            reveals.forEach((r) => observer.observe(r));
        };

        document.addEventListener('DOMContentLoaded', () => window.initScrollReveal());
    </script>

    @stack('scripts')
</body>
</html>
