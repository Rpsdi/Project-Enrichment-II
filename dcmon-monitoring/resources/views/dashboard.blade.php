<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <title>Dc Monitoring</title>
    <link rel="stylesheet" href="{{ asset('style.css') }}">
</head>
<body class="bg-gray">

    <header class="navbar">
        <div class="logo">Dc Monitoring</div>
        <div style="display: flex; gap: 15px; align-items: center;">
            <!-- Mengambil nama dari Session PHP -->
            <span style="font-weight: 600;">Halo, {{ session('operator_name') }}</span>
            <button id="btnBukaModal" class="btn-success">+ Laporan Baru</button>
            <a href="/logout" class="btn-danger" style="text-decoration: none; padding: 6px 12px; font-size: 0.85rem; border-radius: 6px;">Logout</a>
        </div>
    </header>

    <div class="main-container">
        <div class="dashboard-header">
            <h2>DAFTAR PROBLEM AKTIF (<span id="totalProblem">0</span>)</h2>
        </div>
        <div id="problemList" class="problem-list"></div>
    </div>

    <!-- Modal Tambah (Isinya sama persis dengan HTML Anda sebelumnya) -->
    <div id="modalTambah" class="modal hidden">
        <div class="modal-content">
            <div class="modal-header">
                <h3>Buat Laporan Baru</h3>
                <span id="btnTutupModal" class="close-btn" style="cursor:pointer;">&times;</span>
            </div>
            <div class="form-group"><label>Judul Peringatan</label><input type="text" id="inputJudul"></div>
            <div class="form-group"><label>Kronologi</label><textarea id="inputKronologi" rows="3"></textarea></div>
            <div class="row-dropdown">
                <div class="form-group flex-1">
                    <label>Kategori</label><select id="inputKategori"><option>Database</option><option>Network</option><option>Server</option></select>
                </div>
                <div class="form-group flex-1">
                    <label>Tipe Kendala</label><select id="inputTipe"><option>CPU Usage</option><option>Memory Leak</option><option>Link Down</option></select>
                </div>
            </div>
            <button id="btnSimpanBaru" class="btn-primary" style="width: 100%;">Terbitkan Laporan</button>
        </div>
    </div>

    <!-- Inject Session PHP ke JavaScript -->
    <script>
        const operator = {
            name: "{{ session('operator_name') }}",
            id: "{{ session('operator_id') }}"
        };
    </script>

    <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
        import { getFirestore, collection, addDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

        // MASUKKAN CONFIG FIREBASE ANDA DI SINI
        const firebaseConfig = {
            apiKey: "AIzaSyAvEdgLXC_...",
            authDomain: "dummy-dashboard-qc.firebaseapp.com",
            projectId: "dummy-dashboard-qc",
            storageBucket: "dummy-dashboard-qc.firebasestorage.app",
            messagingSenderId: "354987731717",
            appId: "1:354987731717:web:3c894a4f..."
        };

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        // Skrip JS Real-time persis seperti HTML Anda sebelumnya
        onSnapshot(collection(db, "noc_laporan"), (snapshot) => {
            const problemList = document.getElementById("problemList");
            problemList.innerHTML = "";
            document.getElementById("totalProblem").innerText = snapshot.size;

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const card = document.createElement("div");
                card.className = `problem-card ${data.status === 'Resolved' ? 'resolved' : ''}`;
                // Link menuju route detail Laravel
                card.onclick = () => { window.location.href = `/detail?id=${docSnap.id}`; };
                
                let statusLabel = data.status === 'Resolved' ? '<span class="badge-success">Problem Solved</span>' : '<span class="badge-warning">Open</span>';

                card.innerHTML = `
                    <div class="card-left">
                        <div class="card-title">${data.judul || '-'}</div>
                        <div class="card-subtitle">${data.kategori || '-'} - ${data.tipe || '-'} | Dibuat oleh: <strong>${data.operator || '-'}</strong></div>
                    </div>
                    <div class="card-right">
                        <div class="card-id">${data.problem_id || '-'}</div>
                        ${statusLabel}
                    </div>
                `;
                problemList.appendChild(card);
            });
        });

        // Logika Modal
        document.getElementById("btnBukaModal").onclick = () => document.getElementById("modalTambah").classList.remove("hidden");
        document.getElementById("btnTutupModal").onclick = () => document.getElementById("modalTambah").classList.add("hidden");

        document.getElementById("btnSimpanBaru").addEventListener("click", async () => {
            const judul = document.getElementById("inputJudul").value;
            if (!judul) return alert("Judul wajib diisi!");

            await addDoc(collection(db, "noc_laporan"), {
                problem_id: "PRB-" + Math.floor(1000 + Math.random() * 9000),
                judul: judul,
                kronologi: document.getElementById("inputKronologi").value,
                kategori: document.getElementById("inputKategori").value,
                tipe: document.getElementById("inputTipe").value,
                status: "Open",
                operator: operator.name, // Diambil dari variabel yg di-inject PHP
                operator_id: operator.id,
                metode: ""
            });

            document.getElementById("modalTambah").classList.add("hidden");
            document.getElementById("inputJudul").value = "";
            document.getElementById("inputKronologi").value = "";
        });
    </script>
</body>
</html>