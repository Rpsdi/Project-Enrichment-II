<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Penanganan Laporan</title>
    <link rel="stylesheet" href="{{ asset('style.css') }}">
    <style>
        .tab-btn { background: none; border: none; padding: 8px 16px; cursor: pointer; font-weight: 600; color: #666; border-radius: 4px; transition: 0.2s; }
        .tab-btn.active { background: #e3f2fd; color: #1a73e8; }
        .tab-btn:hover { background: #f1f3f4; }
        .hidden { display: none !important; }
        .task-card { border: 1px solid #ddd; padding: 12px; border-radius: 8px; margin-bottom: 10px; transition: 0.3s; position: relative; }
        .task-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .status-container { margin-top: 30px; background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #ddd; display: flex; align-items: flex-end; gap: 15px; }
        .btn-action { border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; }
    </style>
</head>
<body class="bg-gray">

    <div class="detail-container">
        <a href="/" class="back-link">&larr; Kembali ke Dashboard</a>
        
        <div class="detail-header">
            <h2>Penanganan Laporan <span id="viewId" class="badge">Memuat...</span></h2>
            <p style="margin-top: 10px; color: #64748b; font-size: 0.9rem;">
                Sedang ditangani oleh: <strong id="operatorPenangan"></strong> 
            </p>
        </div>

        <!-- TABS HEADER -->
        <div class="tabs-header" style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 2px solid #eee; padding-bottom: 10px;">
            <button class="tab-btn active" data-target="tab1">Detail Peringatan</button>
            <button class="tab-btn" data-target="tab2">Analisis & Waktu</button>
            <button class="tab-btn" data-target="tab3">Delegasi Task</button>
        </div>

        <!-- TAB 1: FORM UTAMA -->
        <div id="tab1" class="tab-content active">
            <div class="form-group"><label>Judul Peringatan</label><input type="text" id="editJudul"></div>
            <div class="form-group"><label>Kronologi Penanganan</label><textarea id="editKronologi" rows="4"></textarea></div>
            <div class="row-dropdown">
                <div class="form-group flex-1">
                    <label>Kategori Tim</label>
                    <select id="editKategori">
                        <option value="Database">Database</option>
                        <option value="Network">Network</option>
                        <option value="Server">Server</option>
                    </select>
                </div>
                <div class="form-group flex-1">
                    <label>Tipe Kendala</label>
                    <select id="editTipe">
                        <option value="CPU Usage">CPU Usage</option>
                        <option value="Memory Leak">Memory Leak</option>
                        <option value="Link Down">Link Down</option>
                    </select>
                </div>
            </div>
            <div class="form-group"><label>Problem Solving Method</label><textarea id="editMetode" rows="4"></textarea></div>
        </div>

        <!-- TAB 2: WAKTU & DAMPAK -->
        <div id="tab2" class="tab-content hidden">
            <div class="row-dropdown">
                <div class="form-group flex-1"><label>Jam Problem Muncul</label><input type="datetime-local" id="inputJamMuncul"></div>
                <div class="form-group flex-1"><label>Jam Response Tim</label><input type="datetime-local" id="inputJamResponse"></div>
                <div class="form-group flex-1"><label>Jam Solving</label><input type="datetime-local" id="inputJamSolving"></div>
            </div>
            <div class="form-group"><label>Penyebab Masalah (Root Cause)</label><textarea id="inputPenyebab" rows="2"></textarea></div>
            <div class="form-group"><label>Impact Problem</label><textarea id="inputImpact" rows="2"></textarea></div>
        </div>

        <!-- TAB 3: TASK LINTAS TIM -->
        <div id="tab3" class="tab-content hidden">
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <button id="btnBukaModalTask" class="btn-success" style="font-size: 12px; padding: 6px 12px;">+ Tambah Task Tim</button>
                <button id="btnConfirmAllTask" class="btn-primary" style="font-size: 12px; padding: 6px 12px; display: none;">Confirm Semua Task</button>
            </div>
            <div id="taskList" style="display: flex; flex-direction: column;"></div>
        </div>

        <!-- KONTROL STATUS & SIMPAN -->
        <div class="status-container">
            <div class="form-group flex-1" style="margin-bottom: 0;">
                <label>Status Laporan</label>
                <select id="inputStatus" style="font-weight: bold; background: #f8f9fa;">
                    <option value="Open">Active</option>
                    <option value="Resolved">Resolved</option>
                </select>
            </div>
            <button id="btnSimpan" class="btn-primary" style="flex: 2; height: 42px;">Simpan Pembaruan</button>
        </div>
    </div>

    <!-- MODAL TAMBAH / EDIT TASK -->
    <div id="modalTask" class="modal hidden">
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="modalTaskTitle">Assign Task Baru</h3>
                <span id="btnTutupModalTask" class="close-btn" style="cursor:pointer;">&times;</span>
            </div>
            <div class="form-group">
                <label>Judul Alert / Task</label>
                <input type="text" id="inputTaskJudul" readonly style="background-color: #f1f3f4; cursor: not-allowed;">
            </div>
            <div class="form-group"><label>Nama Team (Assign to)</label><input type="text" id="inputTaskTeam" placeholder="Misal: NOC L2, Database Admin"></div>
            <div class="form-group"><label>Solusi dari Tim</label><textarea id="inputTaskSolusi" rows="3"></textarea></div>
            <button id="btnSimpanTaskModal" class="btn-primary" style="width: 100%;">Simpan Task</button>
        </div>
    </div>

    <script type="module">
        // CEK SESSION PHP
        const user = {
            name: "{{ session('operator_name') ?? 'Operator' }}",
            id: "{{ session('operator_id') ?? '0' }}"
        };
        document.getElementById('operatorPenangan').innerText = user.name;

        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
        import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

        // CONFIG FIREBASE
        const firebaseConfig = {
            apiKey: "AIzaSyAvEdgLXC_l6pxCDsSTLPwEtzeIYv0UJS4",
            authDomain: "dummy-dashboard-qc.firebaseapp.com",
            projectId: "dummy-dashboard-qc",
            storageBucket: "dummy-dashboard-qc.firebasestorage.app",
            messagingSenderId: "354987731717",
            appId: "1:354987731717:web:3c894a4f7ab4449906656c"
        };

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        const urlParams = new URLSearchParams(window.location.search);
        const docId = urlParams.get('id');
        if (!docId) window.location.href = "/";
        const docRef = doc(db, "noc_laporan", docId);

        let tasksArray = [];
        let editTaskIndex = -1;

        const getCurrentDateTimeLocal = () => {
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            return now.toISOString().slice(0, 16);
        };

        // RENDER TASK
        const renderTasks = () => {
            const list = document.getElementById('taskList');
            list.innerHTML = "";
            
            // Tampilkan tombol "Confirm Semua Task" hanya jika ada task yang berstatus belum confirm
            const hasUnconfirmed = tasksArray.some(t => t.status !== 'Confirmed');
            document.getElementById('btnConfirmAllTask').style.display = (tasksArray.length > 0 && hasUnconfirmed) ? 'block' : 'none';

            tasksArray.forEach((t, index) => {
                const isConfirmed = t.status === 'Confirmed';
                const bgColor = isConfirmed ? '#e8f5e9' : '#ffffff';
                const borderLeft = isConfirmed ? '4px solid #10b981' : '4px solid #1a73e8';
                
                let actionButtons = '';
                let dblClickClass = '';
                let titleAttr = '';

                if (!isConfirmed) {
                    // Tombol Hapus saja yang ada di dalam card
                    actionButtons = `
                        <button class="btn-action btn-hapus" data-index="${index}" style="background: #ef4444; color: #fff;">Hapus</button>
                    `;
                    dblClickClass = 'clickable-task';
                    titleAttr = 'title="Double-click untuk Edit / View" style="cursor: pointer;"';
                } else {
                    actionButtons = '<span style="color: #2e7d32; font-size: 11px; font-weight: bold;">✓ TERKONFIRMASI</span>';
                }

                list.innerHTML += `
                    <div class="task-card ${dblClickClass}" data-index="${index}" style="background: ${bgColor}; border-left: ${borderLeft};" ${titleAttr}>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                            <div style="font-size: 12px; color: #1a73e8; font-weight: bold;">Di-assign ke: ${t.team}</div>
                            ${actionButtons}
                        </div>
                        <div style="font-weight: bold; margin-bottom: 5px; font-size: 14px;">${t.judul}</div>
                        <div style="font-size: 13px; color: #555;">Solusi: ${t.solusi || '-'}</div>
                    </div>`;
            });

            // Event Listeners Dinamis
            document.querySelectorAll('.clickable-task').forEach(card => {
                card.addEventListener('dblclick', (e) => {
                    // Cegah klik ganda jika yang ditekan adalah tombol Hapus
                    if (e.target.closest('.btn-action')) return; 
                    bukaModalEdit(card.dataset.index);
                });
            });

            document.querySelectorAll('.btn-hapus').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation(); 
                    hapusTask(e.target.dataset.index);
                };
            });
        };

        // FUNGSI AKSI TASK
        const hapusTask = (index) => {
            if (confirm("Yakin ingin menghapus task ini?")) {
                tasksArray.splice(index, 1);
                renderTasks();
            }
        };

        // Tombol Confirm Global (Sejajar dengan Tambah Task)
        document.getElementById('btnConfirmAllTask').addEventListener('click', () => {
            if (confirm("Konfirmasi semua task yang masih aktif? Task yang dikonfirmasi tidak akan bisa diedit atau dihapus lagi.")) {
                tasksArray.forEach(t => t.status = 'Confirmed');
                renderTasks();
            }
        });

        const bukaModalEdit = (index) => {
            editTaskIndex = index;
            const t = tasksArray[index];
            document.getElementById('modalTaskTitle').innerText = "Edit Task";
            document.getElementById('inputTaskJudul').value = t.judul;
            document.getElementById('inputTaskTeam').value = t.team;
            document.getElementById('inputTaskSolusi').value = t.solusi;
            document.getElementById('modalTask').classList.remove('hidden');
        };

        // AMBIL DATA FIRESTORE
        getDoc(docRef).then((docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                document.getElementById('viewId').innerText = data.problem_id;
                
                // Tab 1
                document.getElementById('editJudul').value = data.judul || "";
                document.getElementById('editKronologi').value = data.kronologi || "";
                document.getElementById('editKategori').value = data.kategori || "Database";
                document.getElementById('editTipe').value = data.tipe || "CPU Usage";
                document.getElementById('editMetode').value = data.metode || "";
                
                // Tab 2
                document.getElementById('inputJamMuncul').value = data.jam_muncul || getCurrentDateTimeLocal();
                document.getElementById('inputJamResponse').value = data.jam_response || "";
                document.getElementById('inputJamSolving').value = data.jam_solving || "";
                document.getElementById('inputPenyebab').value = data.penyebab || "";
                document.getElementById('inputImpact').value = data.impact || "";

                // Tab 3
                if(data.tasks) { tasksArray = data.tasks; renderTasks(); }

                // Status Dropdown
                document.getElementById('inputStatus').value = data.status === 'Resolved' ? 'Resolved' : 'Open';
            }
        });

        // LOGIKA PERPINDAHAN TAB
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
                e.target.classList.add('active');
                document.getElementById(e.target.dataset.target).classList.remove('hidden');
            });
        });

        // LOGIKA MODAL TASK
        document.getElementById('btnBukaModalTask').onclick = () => {
            editTaskIndex = -1; 
            document.getElementById('modalTaskTitle').innerText = "Assign Task Baru";
            document.getElementById('inputTaskJudul').value = document.getElementById('editJudul').value;
            document.getElementById('inputTaskTeam').value = "";
            document.getElementById('inputTaskSolusi').value = "";
            document.getElementById('modalTask').classList.remove('hidden');
        };
        
        document.getElementById('btnTutupModalTask').onclick = () => document.getElementById('modalTask').classList.add('hidden');
        
        document.getElementById('btnSimpanTaskModal').addEventListener('click', () => {
            const judul = document.getElementById('inputTaskJudul').value;
            const team = document.getElementById('inputTaskTeam').value;
            const solusi = document.getElementById('inputTaskSolusi').value;

            if(!team) return alert("Nama Tim wajib diisi!");

            if (editTaskIndex > -1) {
                tasksArray[editTaskIndex].team = team;
                tasksArray[editTaskIndex].solusi = solusi;
            } else {
                tasksArray.push({ judul, team, solusi, status: 'Pending' });
            }
            
            renderTasks();
            document.getElementById('modalTask').classList.add('hidden');
        });

        // PENGUMPUL DATA & SIMPAN KE DATABASE
        document.getElementById('btnSimpan').addEventListener('click', async () => {
            const dataToUpdate = {
                operator: user.name,
                judul: document.getElementById('editJudul').value,
                kronologi: document.getElementById('editKronologi').value,
                kategori: document.getElementById('editKategori').value,
                tipe: document.getElementById('editTipe').value,
                metode: document.getElementById('editMetode').value,
                jam_muncul: document.getElementById('inputJamMuncul').value,
                jam_response: document.getElementById('inputJamResponse').value,
                jam_solving: document.getElementById('inputJamSolving').value,
                penyebab: document.getElementById('inputPenyebab').value,
                impact: document.getElementById('inputImpact').value,
                status: document.getElementById('inputStatus').value,
                tasks: tasksArray
            };

            await updateDoc(docRef, dataToUpdate);
            alert("Pembaruan Laporan Berhasil Disimpan!"); 
            window.location.href = "/";
        });
    </script>
</body>
</html>