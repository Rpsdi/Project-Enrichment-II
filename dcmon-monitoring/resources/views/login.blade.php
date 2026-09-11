@extends('layouts.app')

@section('title', 'Login | myIncident')

@section('body')
    <div class="relative min-h-screen flex items-center justify-center px-6 overflow-hidden">

        {{-- Background blob dekoratif --}}
        <div class="absolute inset-0 z-0 pointer-events-none opacity-40 animate-blob"
            style="background: radial-gradient(circle at 70% 30%, rgba(var(--accent), 0.15) 0%, transparent 50%);"></div>
        <div class="absolute inset-0 z-0 pointer-events-none opacity-20 animate-blob animation-delay-2000"
            style="background: radial-gradient(circle at 30% 70%, rgba(138, 43, 226, 0.12) 0%, transparent 50%);"></div>

        <div class="relative z-10 w-full max-w-md">

            {{-- Brand --}}
            <div class="reveal text-center mb-10">
                <div
                    class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm text-xs font-medium text-[rgb(var(--accent))] mb-6">
                    <span
                        class="w-1.5 h-1.5 rounded-full bg-[rgb(var(--accent))] animate-pulse shadow-[0_0_8px_rgb(var(--accent))]"></span>
                    Incident Management System
                </div>
                <h1 class="font-['Syne',sans-serif] text-5xl md:text-6xl font-bold tracking-tighter uppercase leading-none">
                    <span class="text-white">my</span><span
                        class="text-transparent bg-clip-text bg-gradient-to-r from-[rgb(var(--accent))] via-white to-[rgb(var(--accent))] animate-gradient-x">Incident</span>
                </h1>
                <p class="text-gray-400 text-sm mt-4">Masuk untuk mulai mencatat &amp; memantau incident.</p>
            </div>

            {{-- Kartu login --}}
            <div
                class="reveal reveal-delay-100 bg-[#0a0a0a]/90 border border-[#222] rounded-2xl p-8 shadow-2xl backdrop-blur-md">

                <div class="flex items-center gap-3 mb-6 border-b border-[#222] pb-4">
                    <iconify-icon icon="solar:lock-keyhole-minimalistic-linear"
                        class="text-2xl text-[rgb(var(--accent))]"></iconify-icon>
                    <h2 class="text-xl font-['Syne',sans-serif] font-semibold tracking-tight text-white">Sign In</h2>
                </div>

                <form action="/login" method="POST" class="space-y-5" id="login-form">
                    @csrf

                    <div>
                        <label for="username"
                            class="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-2">
                            Username
                        </label>
                        <div class="relative">
                            <iconify-icon icon="solar:user-linear"
                                class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg pointer-events-none"></iconify-icon>
                            <input type="text" name="username" id="username" required autofocus autocomplete="username"
                                placeholder="masukkan username"
                                class="w-full bg-[#050505] border border-[#333] rounded-lg pl-10 pr-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[rgb(var(--accent))] transition-colors">
                        </div>
                    </div>

                    <div>
                        <label for="password"
                            class="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-2">
                            Password
                        </label>
                        <div class="relative">
                            <iconify-icon icon="solar:key-minimalistic-square-linear"
                                class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg pointer-events-none"></iconify-icon>
                            <input type="password" name="password" id="password" required autocomplete="current-password"
                                placeholder="masukkan password"
                                class="w-full bg-[#050505] border border-[#333] rounded-lg pl-10 pr-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[rgb(var(--accent))] transition-colors">
                        </div>
                    </div>

                    @if (session('error'))
                        <div id="login-error"
                            class="flex items-center gap-2 text-red-400 text-xs font-medium bg-red-500/10 border border-red-900/50 rounded-lg px-3 py-2.5">
                            <iconify-icon icon="solar:danger-triangle-bold" class="text-base shrink-0"></iconify-icon>
                            <span>{{ session('error') }}</span>
                        </div>
                    @endif

                    <button type="submit"
                        class="group w-full py-3 bg-[rgb(var(--accent))] text-black text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-white hover:shadow-[0_0_25px_rgba(var(--accent),0.35)] transition-all duration-300 flex items-center justify-center gap-2">
                        Authenticate
                        <iconify-icon icon="solar:arrow-right-linear"
                            class="text-lg group-hover:translate-x-1 transition-transform"></iconify-icon>
                    </button>
                </form>
            </div>

            {{-- Bantuan kredensial demo --}}
            <div class="reveal reveal-delay-200 mt-6 bg-[#0a0a0a]/60 border border-[#1a1a1a] rounded-xl p-4">
                <p class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Akun Demo</p>
                <div class="grid grid-cols-2 gap-3 text-xs">
                    <div>
                        <p class="text-[rgb(var(--accent))] font-semibold mb-1 flex items-center gap-1">
                            <iconify-icon icon="solar:shield-check-linear"></iconify-icon> Operator
                        </p>
                        <p class="text-gray-500 font-mono text-[11px]">matthew / operator1</p>
                        <p class="text-gray-500 font-mono text-[11px]">delbert / operator2</p>
                    </div>
                    <div>
                        <p class="text-gray-300 font-semibold mb-1 flex items-center gap-1">
                            <iconify-icon icon="solar:eye-linear"></iconify-icon> Staff <span
                                class="text-gray-600 font-normal">(lihat saja)</span>
                        </p>
                        <p class="text-gray-500 font-mono text-[11px]">sarah / staff1</p>
                        <p class="text-gray-500 font-mono text-[11px]">budi / staff2</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection

@push('scripts')
    <script>
        // Getar halus pada kartu error agar kegagalan login lebih terasa
        const errBox = document.getElementById('login-error');
        if (errBox) {
            errBox.classList.add('animate-shake');
            setTimeout(() => errBox.classList.remove('animate-shake'), 600);
        }
    </script>
@endpush
