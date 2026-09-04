import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    updateDoc, 
    deleteDoc, 
    doc 
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// GANTI BAGIAN INI DENGAN FIREBASE CONFIG PROYEK ANDA
const firebaseConfig = {
  apiKey: "API_KEY_ANDA",
  authDomain: "PROJEK_ANDA.firebaseapp.com",
  projectId: "PROJEK_ANDA",
  storageBucket: "PROJEK_ANDA.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let activeProblemDocId = null;
let currentProblems = [];

// Elemen DOM
const tabList = document.getElementById("tabList");
const totalProblem = document.getElementById("totalProblem");
const emptyState = document.getElementById("emptyState");
const detailView = document.getElementById("detailView");

const viewProblemId = document.getElementById("viewProblemId");
const badgeStatus = document.getElementById("badgeStatus");
const editJudul = document.getElementById("editJudul");
const editKronologi = document.getElementById("editKronologi");
const editKategori = document.getElementById("editKategori");
const editTipe = document.getElementById("editTipe");
const editMetode = document.getElementById("editMetode");
const editStatusQc = document.getElementById("editStatusQc");

// 1. Sinkronisasi Data Firestore (Real-time Reader)
onSnapshot(collection(db, "qc_problems"), (snapshot) => {
    currentProblems = [];
    tabList.innerHTML = "";
    totalProblem.innerText = snapshot.size;

    snapshot.forEach((docSnap) => {
        const item = { id: docSnap.id, ...docSnap.data() };
        currentProblems.push(item);

        // Buat Item Tab
        const tabEl = document.createElement("div");
        tabEl.className = `tab-item ${activeProblemDocId === item.id ? "active" : ""}`;
        tabEl.onclick = () => selectProblemTab(item.id);
        tabEl.innerHTML = `
            <div class="tab-title">${item.judul || "Tanpa Judul"}</div>
            <div class="tab-meta">
                <span>${item.kategori} - ${item.tipe}</span>
                <strong>${item.problem_id}</strong>
            </div>
        `;
        tabList.appendChild(tabEl);
    });

    if (activeProblemDocId) {
        const exists = currentProblems.find(p => p.id === activeProblemDocId);
        if (exists) {
            renderDetail(exists);
        } else {
            resetDetailView();
        }
    }
});

// 2. Logika Pindah Tab
window.selectProblemTab = function(docId) {
    activeProblemDocId = docId;
    
    // Perbarui penanda class active di tab
    document.querySelectorAll(".tab-item").forEach(el => el.classList.remove("active"));
    const selectedData = currentProblems.find(p => p.id === docId);
    
    if (selectedData) {
        renderDetail(selectedData);
    }
};

function renderDetail(data) {
    emptyState.classList.add("hidden");
    detailView.classList.remove("hidden");

    viewProblemId.innerText = data.problem_id;
    badgeStatus.innerText = data.status_qc || "Menunggu Pengecekan";
    
    // Update warna badge status
    if (data.status_qc === "QC Sesuai (Approved)") {
        badgeStatus.style.backgroundColor = "#dcfce7";
        badgeStatus.style.color = "#15803d";
    } else if (data.status_qc === "Perlu Revisi Operator") {
        badgeStatus.style.backgroundColor = "#fee2e2";
        badgeStatus.style.color = "#b91c1c";
    } else {
        badgeStatus.style.backgroundColor = "#fef3c7";
        badgeStatus.style.color = "#d97706";
    }

    editJudul.value = data.judul || "";
    editKronologi.value = data.kronologi || "";
    editKategori.value = data.kategori || "Database";
    editTipe.value = data.tipe || "CPU Usage";
    editMetode.value = data.metode || "";
    editStatusQc.value = data.status_qc || "Menunggu Pengecekan";
}

function resetDetailView() {
    activeProblemDocId = null;
    detailView.classList.add("hidden");
    emptyState.classList.remove("hidden");
}

// 3. Update Data Problem & Status QC
document.getElementById("btnUpdate").addEventListener("click", async () => {
    if (!activeProblemDocId) return;

    try {
        await updateDoc(doc(db, "qc_problems", activeProblemDocId), {
            judul: editJudul.value,
            kronologi: editKronologi.value,
            kategori: editKategori.value,
            tipe: editTipe.value,
            metode: editMetode.value,
            status_qc: editStatusQc.value,
            updatedAt: new Date()
        });
        alert("Perubahan dan Hasil QC berhasil diperbarui!");
    } catch (err) {
        console.error("Gagal update data:", err);
        alert("Gagal menyimpan perubahan!");
    }
});

// 4. Hapus Problem
document.getElementById("btnHapus").addEventListener("click", async () => {
    if (!activeProblemDocId) return;
    
    if (confirm("Apakah Anda yakin ingin menghapus tiket problem ini dari monitoring?")) {
        try {
            await deleteDoc(doc(db, "qc_problems", activeProblemDocId));
            resetDetailView();
        } catch (err) {
            console.error("Gagal menghapus:", err);
            alert("Gagal menghapus data!");
        }
    }
});

// 5. Modal & Input Problem Baru
const modalTambah = document.getElementById("modalTambah");
document.getElementById("btnBukaModal").onclick = () => modalTambah.classList.remove("hidden");
document.getElementById("btnTutupModal").onclick = () => modalTambah.classList.add("hidden");

document.getElementById("btnSimpanBaru").addEventListener("click", async () => {
    const judul = document.getElementById("inputJudul").value;
    if (!judul) return alert("Judul wajib diisi!");

    const btnSimpan = document.getElementById("btnSimpanBaru");
    btnSimpan.innerText = "Menyimpan...";
    btnSimpan.disabled = true; // Kunci tombol agar tidak diklik berkali-kali

    try {
        await addDoc(collection(db, "noc_laporan"), {
            problem_id: "PRB-" + Math.floor(1000 + Math.random() * 9000),
            judul: judul,
            kronologi: document.getElementById("inputKronologi").value,
            kategori: document.getElementById("inputKategori").value,
            tipe: document.getElementById("inputTipe").value,
            status: "Open",
            operator: operator.name, 
            operator_id: operator.id, 
            metode: ""
        });

        // 1. Tutup modal secara otomatis
        document.getElementById("modalTambah").classList.add("hidden");
        
        // 2. Kosongkan isian form untuk laporan berikutnya
        document.getElementById("inputJudul").value = "";
        document.getElementById("inputKronologi").value = "";
        
    } catch (error) {
        console.error("Error Firebase:", error);
        alert("Gagal menerbitkan laporan. Pastikan koneksi aman dan Firestore Rules sudah 'true'.");
    } finally {
        // 3. Kembalikan kondisi tombol
        btnSimpan.innerText = "Terbitkan Laporan";
        btnSimpan.disabled = false;
    }
});