# Requirements Document

## Introduction

myIncident QC adalah Chrome Extension baru (Manifest V3) yang berada di folder `myincident-qc/` dan berfungsi sebagai alat bantu Quality Control untuk aplikasi web myIncident (Laravel, dev server `http://localhost:8000`). Extension QC-mon yang sudah ada di folder `QC-mon/` tidak ikut diubah.

Extension menyediakan dua kapabilitas utama:

1. **Deteksi incident mandek** — memantau baris waktu berformat `HH:MM` di dalam field `kronologi` incident berstatus `Active`, lalu memperingatkan pengguna bila selisih antara timestamp terakhir dan waktu sekarang melewati ambang batas yang dapat diatur pengguna (default 30 menit).
2. **Autofill dari riwayat incident** — menawarkan pengisian otomatis field Kronologi, Root Cause, Impact, dan Resolution berdasarkan incident lama yang mirip, dengan pencocokan utama pada field `perangkat`.

Data incident dibaca langsung dari Firestore REST API pada project `dummy-dashboard-qc`, collection `incidents`, dan disalin ke `chrome.storage.local` sebagai fallback saat jaringan gagal. Pemantauan berjalan melalui content script yang aktif selama halaman myIncident terbuka. Peringatan disampaikan dua jalur: inline di dalam halaman myIncident dan notifikasi desktop Chrome.

## Glossary

- **QC_Extension**: Keseluruhan Chrome Extension myIncident QC (Manifest V3) yang berada di folder `myincident-qc/`.
- **Content_Script**: Skrip QC_Extension yang disuntikkan ke halaman myIncident pada origin `http://localhost:8000` dan menjadi satu-satunya pemicu pemantauan.
- **Background_Worker**: Service worker MV3 milik QC_Extension yang menerima pesan dari Content_Script dan menerbitkan notifikasi desktop.
- **Firestore_Client**: Modul QC_Extension yang mengambil dokumen incident melalui endpoint `https://firestore.googleapis.com/v1/projects/dummy-dashboard-qc/databases/(default)/documents/incidents`.
- **Fetch_Result**: Hasil pengambilan Firestore_Client, berisi penanda berhasil atau gagal, daftar Incident_Record, dan keterangan penyebab kegagalan.
- **Cache_Store**: Penyimpanan `chrome.storage.local` milik QC_Extension yang menyimpan hasil fetch terakhir beserta waktu pengambilannya.
- **Kronologi_Parser**: Modul QC_Extension yang mengubah teks `kronologi` menjadi daftar entri waktu terstruktur.
- **Kronologi_Printer**: Modul QC_Extension yang mengubah daftar entri waktu terstruktur kembali menjadi teks baris `HH:MM PESAN`.
- **Stalled_Monitor**: Modul QC_Extension yang menentukan apakah sebuah incident berstatus mandek berdasarkan Reference_Time dan Threshold_Minutes.
- **Check_Cycle**: Satu kali eksekusi Stalled_Monitor atas seluruh Incident_Record yang tersedia.
- **Inline_Banner**: Elemen peringatan yang disisipkan Content_Script ke dalam halaman myIncident.
- **Notifier**: Modul QC_Extension yang menerbitkan notifikasi desktop melalui API `chrome.notifications`.
- **Autofill_Engine**: Modul QC_Extension yang mencari incident historis serupa dan menyusun usulan nilai field.
- **Autofill_Panel**: Elemen antarmuka yang disisipkan Content_Script untuk menampilkan usulan Autofill_Engine dan tombol penerapannya.
- **Popup_Settings**: Halaman popup QC_Extension untuk mengatur Threshold_Minutes, memicu refresh manual, dan menampilkan daftar incident mandek.
- **Incident_Record**: Satu dokumen pada collection `incidents` dengan field `problem_id`, `judul`, `kronologi`, `kategori_tim`, `perangkat`, `status`, `created_at`, `tasks[]`, `resolution`, `problem_type`, dan objek `detail_alert` yang memuat `jam_muncul`, `jam_response`, `jam_solving`, `root_cause`, `impact`.
- **Kronologi_Entry**: Satu baris pada bagian `Kronologi :` yang diawali pola `HH:MM` diikuti pesan, dengan atau tanpa tanda kurung pada pesan.
- **Reference_Time**: Waktu acuan perhitungan kemandekan, yaitu waktu Kronologi_Entry terakhir; bila tidak ada Kronologi_Entry maka nilai `created_at` Incident_Record.
- **Threshold_Minutes**: Ambang batas kemandekan dalam menit yang tersimpan di Cache_Store, bernilai awal 30.
- **Stalled_Incident**: Incident_Record berstatus `Active` yang selisih antara Reference_Time dan waktu sekarang lebih besar dari Threshold_Minutes.
- **Unassessable_Incident**: Incident_Record berstatus `Active` yang Reference_Time-nya gagal ditentukan, dicatat pada daftar terpisah beserta `problem_id` dan alasannya.
- **Notification_Key**: Kunci de-duplikasi notifikasi berbentuk gabungan `problem_id` dan Reference_Time dari Stalled_Incident.
- **Candidate_List**: Daftar Incident_Record historis hasil pemeringkatan Autofill_Engine.
- **Autofill_Fields**: Empat field yang boleh diisi otomatis, yaitu `#fKronologi`, `#fRootCause`, `#fImpact`, dan `#fResolution`.

## Requirements

### Requirement 1: Struktur dan Pemasangan Extension

**User Story:** Sebagai anggota tim QC, saya ingin memasang QC_Extension sebagai extension terpisah, sehingga extension QC-mon yang sudah berjalan tetap utuh.

#### Acceptance Criteria

1. THE QC_Extension SHALL menempatkan seluruh berkasnya, yaitu `manifest.json`, berkas Background_Worker, berkas Content_Script, berkas Popup_Settings, modul pendukung, aset ikon, dan berkas konfigurasi, di dalam folder `myincident-qc/` pada root workspace tanpa menempatkan berkas milik QC_Extension di luar folder tersebut.
2. THE QC_Extension SHALL menyertakan `manifest.json` pada akar folder `myincident-qc/` dengan `manifest_version` bernilai 3 serta field `name` berisi 1 sampai 75 karakter, `version` berisi 1 sampai 4 kelompok angka yang dipisahkan tanda titik, dan `description` berisi 1 sampai 132 karakter.
3. THE QC_Extension SHALL mendeklarasikan tepat tiga permission pada `manifest.json`, yaitu `storage`, `unlimitedStorage`, dan `notifications`, tanpa permission lain.
4. THE QC_Extension SHALL mendeklarasikan tepat dua host permission pada `manifest.json`, yaitu `http://localhost:8000/*` dan `https://firestore.googleapis.com/*`, tanpa pola host lain termasuk pola seluruh URL.
5. THE QC_Extension SHALL mengimplementasikan seluruh logikanya dengan berkas JavaScript bersintaks ES module berupa pernyataan `import` dan `export`, tanpa framework pihak ketiga, dan tanpa langkah build, sehingga folder `myincident-qc/` tidak memuat berkas konfigurasi bundler maupun direktori dependensi terpasang.
6. THE QC_Extension SHALL membiarkan seluruh berkas di folder `QC-mon/` dan folder `dcmon-monitoring/` tanpa perubahan isi, nama, maupun lokasi.
7. THE QC_Extension SHALL mendeklarasikan pada `manifest.json` titik masuk Background_Worker sebagai service worker bertipe module, titik masuk Content_Script dengan pola pencocokan `http://localhost:8000/*`, dan titik masuk Popup_Settings sebagai halaman action.
8. WHEN pengguna memuat folder `myincident-qc/` sebagai unpacked extension pada mode developer Chrome, THE QC_Extension SHALL terdaftar sebagai extension dengan ID tersendiri tanpa pesan error pada daftar extension Chrome.
9. WHILE QC_Extension terpasang, THE QC_Extension SHALL membiarkan extension QC-mon tetap terpasang dengan status aktif dan ID extension yang berbeda dari ID QC_Extension.

### Requirement 2: Pengambilan Data Incident dari Firestore

**User Story:** Sebagai anggota tim QC, saya ingin QC_Extension membaca data incident langsung dari Firestore, sehingga pemeriksaan memakai data yang sama dengan aplikasi myIncident.

#### Acceptance Criteria

1. WHEN Content_Script memerlukan data incident, THE Firestore_Client SHALL mengirim permintaan HTTP GET ke `https://firestore.googleapis.com/v1/projects/dummy-dashboard-qc/databases/(default)/documents/incidents` dengan menyertakan API key Firebase dan meminta maksimum 300 dokumen per permintaan.
2. THE Firestore_Client SHALL mengubah setiap dokumen respons Firestore menjadi satu Incident_Record dengan membuka seluruh wrapper tipe Firestore sampai kedalaman bersarang maksimum 5 tingkat, yaitu `stringValue` menjadi string, `integerValue` dan `doubleValue` menjadi number, `booleanValue` menjadi boolean, `timestampValue` menjadi string waktu format ISO 8601, `nullValue` menjadi null, `arrayValue` menjadi array, dan `mapValue` menjadi objek, sehingga Incident_Record hasil konversi tidak lagi memuat nama kunci wrapper tipe.
3. WHILE respons Firestore terakhir memuat field `nextPageToken` bernilai string tidak kosong, THE Firestore_Client SHALL mengambil halaman berikutnya sampai batas 50 halaman atau 10.000 dokumen tercapai, mana yang lebih dulu, dan menandai Fetch_Result sebagai data terpotong apabila pengambilan dihentikan karena salah satu batas tersebut.
4. IF respons Firestore memuat kode status HTTP di luar rentang 200 sampai 299, THEN THE Firestore_Client SHALL menghentikan pengambilan halaman berikutnya dan mengembalikan Fetch_Result bertanda gagal yang memuat kode status tersebut beserta keterangan bahwa pengambilan data incident gagal, tanpa mengembalikan Incident_Record sebagian.
5. IF satu permintaan ke Firestore tidak menerima respons lengkap dalam 10 detik, atau total durasi pengambilan seluruh halaman melewati 60 detik, THEN THE Firestore_Client SHALL membatalkan permintaan yang sedang berjalan dan mengembalikan Fetch_Result bertanda timeout, tanpa mengembalikan Incident_Record sebagian.
6. THE Firestore_Client SHALL membaca API key Firebase dari berkas konfigurasi di dalam folder `myincident-qc/` sebelum mengirim permintaan pertama ke Firestore.
7. IF sebuah dokumen Firestore tidak memuat salah satu field yang diharapkan, yaitu `problem_id`, `judul`, `kronologi`, `kategori_tim`, `perangkat`, `status`, `created_at`, `resolution`, `problem_type`, `tasks`, atau field di dalam `detail_alert` yaitu `jam_muncul`, `jam_response`, `jam_solving`, `root_cause`, dan `impact`, THEN THE Firestore_Client SHALL mengisi field tersebut pada Incident_Record dengan null untuk nilai tunggal dan array kosong untuk `tasks`, serta melanjutkan konversi dokumen lainnya.
8. WHEN pengambilan seluruh halaman collection `incidents` selesai dan tidak ada satu pun dokumen dikembalikan, THE Firestore_Client SHALL mengembalikan Fetch_Result bertanda berhasil berisi daftar Incident_Record berjumlah 0 elemen.
9. IF berkas konfigurasi di dalam folder `myincident-qc/` tidak memuat API key Firebase bernilai string tidak kosong, THEN THE Firestore_Client SHALL menahan pengiriman permintaan ke Firestore dan mengembalikan Fetch_Result bertanda gagal yang menyatakan konfigurasi API key tidak tersedia.

### Requirement 3: Cache Lokal dan Fallback Offline

**User Story:** Sebagai anggota tim QC, saya ingin QC_Extension tetap menampilkan hasil pemeriksaan saat Firestore tidak terjangkau, sehingga pekerjaan QC tidak terhenti.

#### Acceptance Criteria

1. WHEN Firestore_Client mengembalikan Fetch_Result bertanda berhasil, THE Cache_Store SHALL menggantikan seluruh daftar Incident_Record yang tersimpan sebelumnya tanpa menyisakan Incident_Record dari pengambilan sebelumnya, dan menyimpan waktu selesai pengambilan dalam format ISO 8601 lengkap dengan offset zona waktu.
2. IF Firestore_Client mengembalikan Fetch_Result bertanda gagal dan Cache_Store memuat daftar Incident_Record, THEN THE QC_Extension SHALL melanjutkan pemeriksaan memakai daftar Incident_Record terakhir dari Cache_Store tanpa batas usia data dan tanpa menghapus isi Cache_Store.
3. WHILE QC_Extension memakai data dari Cache_Store, THE Inline_Banner SHALL menampilkan waktu pengambilan data terakhir dalam waktu lokal berformat `HH:MM`, usia data dalam menit bulat, dan penanda teks bahwa data berasal dari cache lokal.
4. IF Firestore_Client mengembalikan Fetch_Result bertanda gagal dan Cache_Store belum memuat daftar Incident_Record, THEN THE Popup_Settings SHALL menampilkan pesan bahwa data incident belum tersedia dan menahan pesan bahwa seluruh incident `Active` terpantau normal.
5. THE Cache_Store SHALL menyimpan Threshold_Minutes sebagai bilangan bulat menit dalam rentang 1 sampai 1440, serta daftar Notification_Key yang sudah diterbitkan beserta waktu pencatatannya dalam format ISO 8601.
6. WHEN Cache_Store selesai menulis daftar Incident_Record dan total ukuran data QC_Extension pada Cache_Store melewati 4 megabyte, THE Cache_Store SHALL membuang Incident_Record berstatus `Resolved` dan `Cancelled` berurutan dari `created_at` paling lama sampai total ukuran data berada di bawah 4 megabyte.
7. IF seluruh Incident_Record berstatus `Resolved` dan `Cancelled` sudah dibuang dan total ukuran data pada Cache_Store masih melewati 4 megabyte, THEN THE Cache_Store SHALL menghentikan pembuangan dan mempertahankan seluruh Incident_Record berstatus `Active`.
8. WHEN jumlah Notification_Key tersimpan pada Cache_Store melewati 1000, THE Cache_Store SHALL membuang Notification_Key dengan waktu pencatatan paling lama sampai jumlahnya sama dengan 1000.
9. IF Firestore_Client mengembalikan Fetch_Result bertanda gagal dan Cache_Store belum memuat daftar Incident_Record, THEN THE Content_Script SHALL menahan penyisipan Inline_Banner pada halaman myIncident.

### Requirement 4: Parsing Baris Waktu pada Kronologi

**User Story:** Sebagai anggota tim QC, saya ingin QC_Extension membaca baris waktu di dalam kronologi secara tepat, sehingga penilaian kemandekan memakai timestamp yang benar.

#### Acceptance Criteria

1. THE Kronologi_Parser SHALL memproses hanya teks yang berada setelah kemunculan pertama penanda `Kronologi :` pada field `kronologi`, terhitung dari karakter pertama setelah penanda sampai akhir field, sehingga baris `Description :` dan baris `Start Time :` tidak pernah menghasilkan Kronologi_Entry.
2. WHEN sebuah baris pada bagian kronologi diawali, setelah spasi dan tab di awal baris dibuang, oleh pola tepat dua digit jam, satu tanda titik dua, dan tepat dua digit menit yang tidak diikuti tanda titik dua lain, THE Kronologi_Parser SHALL menghasilkan satu Kronologi_Entry yang memuat nilai jam, nilai menit, dan pesan berupa seluruh teks setelah pola waktu dengan spasi di awal dan akhir dibuang.
3. THE Kronologi_Parser SHALL menormalkan pesan dengan membuang tepat satu pasang tanda kurung pembuka dan penutup yang membungkus keseluruhan pesan, sehingga `09:00 (MEW infokan alert ke Tim DBA)` dan `09:00 MEW infokan alert ke Tim DBA` menghasilkan Kronologi_Entry dengan nilai pesan yang identik.
4. THE Kronologi_Parser SHALL mempertahankan tanda kurung yang tidak membungkus keseluruhan pesan sebagai bagian dari isi pesan.
5. IF sebuah baris pada bagian kronologi tidak diawali pola waktu sebagaimana ditetapkan pada kriteria 2, THEN THE Kronologi_Parser SHALL mengabaikan baris tersebut tanpa menghasilkan Kronologi_Entry dan melanjutkan pemrosesan baris berikutnya.
6. IF nilai jam berada di luar rentang 00 sampai 23 atau nilai menit berada di luar rentang 00 sampai 59, THEN THE Kronologi_Parser SHALL mengabaikan baris tersebut tanpa menghasilkan Kronologi_Entry dan melanjutkan pemrosesan baris berikutnya.
7. THE Kronologi_Parser SHALL menyusun daftar Kronologi_Entry dalam urutan kemunculan baris dari atas ke bawah, tanpa pengurutan ulang berdasarkan nilai waktu, termasuk ketika terdapat entri dengan nilai waktu identik maupun nilai waktu yang menurun.
8. IF field `kronologi` tidak memuat penanda `Kronologi :`, atau bagian setelah penanda tidak memuat satu pun baris yang lolos kriteria 2, THEN THE Kronologi_Parser SHALL menghasilkan daftar Kronologi_Entry kosong dan menandai hasil sebagai tanpa entri kronologi, tanpa menghentikan pemrosesan field lain.
9. IF pesan pada sebuah baris kosong setelah normalisasi kriteria 3, THEN THE Kronologi_Parser SHALL mengabaikan baris tersebut tanpa menghasilkan Kronologi_Entry.
10. IF panjang pesan pada sebuah baris melewati 1000 karakter, THEN THE Kronologi_Parser SHALL memotong pesan pada 1000 karakter pertama.
11. THE Kronologi_Parser SHALL memproses paling banyak 500 Kronologi_Entry per field `kronologi` dan mengabaikan baris berpola waktu yang melampaui batas tersebut.
12. THE Kronologi_Printer SHALL menghasilkan satu baris per Kronologi_Entry berbentuk dua digit jam berimbuh nol di depan, satu tanda titik dua, dua digit menit berimbuh nol di depan, satu karakter spasi, lalu pesan hasil normalisasi tanpa tanda kurung pembungkus, tanpa spasi di akhir baris, dengan antarbaris dipisahkan satu karakter baris baru.
13. FOR ALL daftar Kronologi_Entry yang valid, yaitu setiap entri memiliki jam 00 sampai 23, menit 00 sampai 59, pesan 1 sampai 1000 karakter tanpa karakter baris baru, dan jumlah entri 0 sampai 500, teks hasil Kronologi_Printer yang diletakkan setelah penanda `Kronologi :` lalu diproses kembali oleh Kronologi_Parser SHALL menghasilkan daftar Kronologi_Entry yang setara dalam jumlah entri, urutan entri, nilai jam, nilai menit, dan isi pesan.

### Requirement 5: Penentuan Waktu Acuan Kemandekan

**User Story:** Sebagai anggota tim QC, saya ingin QC_Extension menghitung waktu acuan secara konsisten, sehingga incident tanpa baris waktu tetap dapat dinilai.

#### Acceptance Criteria

1. WHEN daftar Kronologi_Entry sebuah Incident_Record memuat minimal satu entri, THE Stalled_Monitor SHALL menetapkan Reference_Time sama dengan gabungan tanggal hasil rekonstruksi dan nilai `HH:MM` Kronologi_Entry pada posisi terakhir urutan kemunculan, dengan nilai detik dan milidetik 0, pada zona waktu lokal perangkat pengguna.
2. WHEN daftar Kronologi_Entry sebuah Incident_Record kosong, THE Stalled_Monitor SHALL menetapkan Reference_Time sama dengan nilai `created_at` Incident_Record yang dikonversi ke zona waktu lokal perangkat pengguna dengan presisi menit.
3. WHEN daftar Kronologi_Entry sebuah Incident_Record memuat minimal satu entri, THE Stalled_Monitor SHALL menetapkan tanggal Kronologi_Entry pertama sama dengan tanggal lokal pada `created_at` Incident_Record.
4. WHEN nilai `HH:MM` sebuah Kronologi_Entry lebih kecil daripada nilai `HH:MM` Kronologi_Entry sebelumnya dalam urutan kemunculan, THE Stalled_Monitor SHALL menetapkan tanggal Kronologi_Entry tersebut sama dengan tanggal Kronologi_Entry sebelumnya ditambah satu hari kalender.
5. WHEN nilai `HH:MM` sebuah Kronologi_Entry sama dengan atau lebih besar daripada nilai `HH:MM` Kronologi_Entry sebelumnya dalam urutan kemunculan, THE Stalled_Monitor SHALL menetapkan tanggal Kronologi_Entry tersebut sama dengan tanggal Kronologi_Entry sebelumnya tanpa penambahan hari kalender.
6. IF Reference_Time hasil rekonstruksi bernilai lebih besar daripada waktu sekarang pada zona waktu lokal perangkat pengguna, THEN THE Stalled_Monitor SHALL memakai selisih 0 menit untuk Incident_Record tersebut, menandainya sebagai terpantau normal, dan mencatat alasan berupa waktu acuan berada di masa depan pada daftar hasil Check_Cycle.
7. IF nilai `created_at` sebuah Incident_Record kosong atau tidak dapat dikonversi menjadi tanggal yang sah, THEN THE Stalled_Monitor SHALL menandai Incident_Record tersebut sebagai Unassessable_Incident, mengeluarkannya dari daftar Stalled_Incident, dan mencatat `problem_id` beserta alasan berupa `created_at` tidak sah.

### Requirement 6: Deteksi Incident Mandek

**User Story:** Sebagai anggota tim QC, saya ingin mengetahui incident yang belum mendapat update selama melewati ambang batas, sehingga saya dapat menagih tindak lanjut ke PIC terkait.

#### Acceptance Criteria

1. THE Stalled_Monitor SHALL memeriksa hanya Incident_Record yang nilai `status`-nya sama dengan `Active` setelah normalisasi huruf besar-kecil dan pelepasan spasi di tepi.
2. THE Stalled_Monitor SHALL melewati tanpa penilaian setiap Incident_Record yang nilai `status`-nya bukan `Active`, termasuk `Resolved`, `Cancelled`, nilai kosong, dan nilai lain di luar tiga status tersebut.
3. WHEN selisih menit bulat sebuah Incident_Record berstatus `Active`, yaitu waktu sekarang dikurangi Reference_Time lalu dibulatkan ke bawah ke menit bulat, bernilai lebih besar daripada Threshold_Minutes, THE Stalled_Monitor SHALL menandai Incident_Record tersebut sebagai Stalled_Incident.
4. WHEN selisih menit bulat sebuah Incident_Record berstatus `Active` bernilai sama dengan atau lebih kecil daripada Threshold_Minutes, termasuk nilai nol dan nilai negatif akibat Reference_Time yang berada di masa depan, THE Stalled_Monitor SHALL menandai Incident_Record tersebut sebagai terpantau normal.
5. THE Stalled_Monitor SHALL menyertakan `problem_id`, `judul`, `perangkat`, Reference_Time dalam format ISO 8601, dan selisih menit bulat pada setiap Stalled_Incident yang dihasilkan, serta mengisi penanda teks tidak tersedia pada `judul` atau `perangkat` yang bernilai kosong.
6. THE Stalled_Monitor SHALL mengurutkan daftar Stalled_Incident dari selisih menit bulat terbesar ke terkecil, lalu untuk selisih menit yang sama mengurutkan dari `created_at` paling lama ke paling baru, lalu untuk `created_at` yang sama mengurutkan `problem_id` secara naik.
7. WHILE halaman myIncident terbuka pada origin `http://localhost:8000`, THE Content_Script SHALL menjalankan Check_Cycle setiap 60 detik dengan toleransi 5 detik.
8. WHEN Content_Script selesai dimuat pada halaman myIncident, THE Content_Script SHALL menjalankan Check_Cycle satu kali dalam 2 detik tanpa menunggu jadwal 60 detik berikutnya.
9. IF sebuah Incident_Record berstatus `Active` ditandai sebagai Unassessable_Incident, THEN THE Stalled_Monitor SHALL mengeluarkan Incident_Record tersebut dari daftar Stalled_Incident dan menempatkannya pada daftar terpisah yang memuat `problem_id` dan alasan kegagalan penilaian.
10. IF jadwal Check_Cycle berikutnya tiba sementara Check_Cycle sebelumnya belum selesai, THEN THE Content_Script SHALL melewati jadwal tersebut dan mempertahankan hasil pemeriksaan terakhir sampai Check_Cycle yang sedang berjalan selesai.
11. WHEN halaman myIncident ditutup atau berpindah ke alamat di luar origin `http://localhost:8000`, THE Content_Script SHALL menghentikan penjadwalan Check_Cycle.

### Requirement 7: Pengaturan Ambang Batas

**User Story:** Sebagai anggota tim QC, saya ingin mengubah ambang batas menit, sehingga sensitivitas peringatan sesuai dengan kesepakatan operasional tim.

#### Acceptance Criteria

1. IF Threshold_Minutes belum tersimpan pada Cache_Store, THEN THE QC_Extension SHALL memakai nilai bawaan 30 menit dan menampilkan nilai 30 sebagai nilai awal pada Popup_Settings.
2. WHEN pengguna menyimpan nilai ambang batas yang valid pada Popup_Settings, THE Cache_Store SHALL menyimpan nilai tersebut sebagai Threshold_Minutes dalam waktu maksimum 1 detik dan mempertahankannya antar sesi peramban sampai nilai diubah kembali.
3. THE Popup_Settings SHALL menerima masukan ambang batas berupa bilangan bulat tanpa pemisah desimal, terdiri dari 1 sampai 4 digit, dengan nilai 1 sampai 1440 menit.
4. IF nilai ambang batas yang dimasukkan kosong, bukan bilangan bulat, atau berada di luar rentang 1 sampai 1440, THEN THE Popup_Settings SHALL menolak penyimpanan, mempertahankan nilai Threshold_Minutes yang tersimpan sebelumnya pada Cache_Store, dan menampilkan pesan yang menyebutkan rentang nilai 1 sampai 1440 menit.
5. WHEN Content_Script menerima event `chrome.storage.onChanged` untuk Threshold_Minutes, THE Content_Script SHALL menjalankan Check_Cycle memakai nilai baru dan memperbarui penandaan seluruh baris yang sedang ditampilkan dalam waktu maksimum 5 detik tanpa memuat ulang halaman myIncident.
6. WHEN Threshold_Minutes berhasil tersimpan pada Cache_Store, THE Popup_Settings SHALL menampilkan indikasi keberhasilan penyimpanan beserta nilai menit yang tersimpan.
7. IF nilai Threshold_Minutes yang terbaca dari Cache_Store bukan bilangan bulat dalam rentang 1 sampai 1440, THEN THE QC_Extension SHALL memakai nilai bawaan 30 menit dan menimpa nilai tidak valid tersebut pada Cache_Store dengan nilai 30.
8. IF Content_Script gagal menerapkan nilai Threshold_Minutes yang baru, THEN THE Content_Script SHALL memakai nilai Threshold_Minutes sebelumnya dan menampilkan indikasi bahwa perubahan ambang batas belum diterapkan.

### Requirement 8: Peringatan Inline di Halaman myIncident

**User Story:** Sebagai anggota tim QC, saya ingin melihat peringatan langsung di halaman myIncident, sehingga saya mengetahui incident mandek tanpa membuka popup.

#### Acceptance Criteria

1. WHEN Stalled_Monitor menghasilkan minimal satu Stalled_Incident, THE Content_Script SHALL menyisipkan Inline_Banner ke dalam halaman myIncident.
2. THE Inline_Banner SHALL menampilkan jumlah Stalled_Incident, serta `problem_id`, `judul`, dan selisih menit untuk setiap Stalled_Incident.
3. WHEN pengguna memilih sebuah entri pada Inline_Banner, THE Content_Script SHALL menandai kartu incident terkait pada `#incidentGrid` dengan sorotan visual.
4. WHEN Stalled_Monitor menghasilkan daftar Stalled_Incident kosong, THE Content_Script SHALL menghapus Inline_Banner dari halaman myIncident.
5. WHEN pengguna menutup Inline_Banner, THE Content_Script SHALL menyembunyikan Inline_Banner sampai Stalled_Monitor menghasilkan Stalled_Incident dengan Notification_Key baru.
6. THE Content_Script SHALL menyisipkan Inline_Banner tanpa mengubah berkas dan elemen milik aplikasi myIncident selain menambah elemen bertanda milik QC_Extension.
7. WHILE panel `#incidentPanel` terbuka, THE Inline_Banner SHALL tetap terlihat pada halaman myIncident.

### Requirement 9: Notifikasi Desktop dan De-duplikasi

**User Story:** Sebagai anggota tim QC, saya ingin menerima notifikasi desktop untuk incident mandek, sehingga saya tetap terinformasi saat tab myIncident tidak sedang aktif.

#### Acceptance Criteria

1. WHEN Content_Script menemukan Stalled_Incident dengan Notification_Key yang belum tercatat pada Cache_Store, THE Content_Script SHALL mengirim pesan penerbitan notifikasi ke Background_Worker.
2. WHEN Background_Worker menerima pesan penerbitan notifikasi, THE Notifier SHALL menerbitkan notifikasi desktop melalui `chrome.notifications` yang memuat `problem_id`, `judul`, dan selisih menit.
3. WHEN Notifier berhasil menerbitkan notifikasi, THE Cache_Store SHALL mencatat Notification_Key notifikasi tersebut.
4. WHEN Notification_Key sebuah Stalled_Incident sudah tercatat pada Cache_Store, THE Notifier SHALL melewati penerbitan notifikasi untuk Stalled_Incident tersebut.
5. WHEN sebuah Incident_Record memperoleh Kronologi_Entry baru, THE QC_Extension SHALL memperlakukan Notification_Key hasil Reference_Time baru sebagai kunci yang belum tercatat.
6. WHEN sebuah Incident_Record berubah status menjadi `Resolved` atau `Cancelled`, THE Cache_Store SHALL menghapus seluruh Notification_Key milik `problem_id` tersebut.
7. IF penerbitan notifikasi desktop gagal, THEN THE QC_Extension SHALL mempertahankan Inline_Banner sebagai jalur peringatan dan mencatat kegagalan pada log konsol Background_Worker.
8. THE Notifier SHALL menerbitkan paling banyak 5 notifikasi desktop per siklus pemeriksaan Stalled_Monitor.

### Requirement 10: Halaman Popup Pengaturan

**User Story:** Sebagai anggota tim QC, saya ingin satu tempat untuk mengatur ambang batas, menyegarkan data, dan melihat daftar incident mandek, sehingga kontrol QC terkumpul dalam satu antarmuka.

#### Acceptance Criteria

1. WHEN pengguna membuka Popup_Settings, THE Popup_Settings SHALL menampilkan nilai Threshold_Minutes yang tersimpan, daftar Stalled_Incident terakhir, dan waktu pengambilan data terakhir.
2. WHEN pengguna memilih tombol refresh manual, THE Firestore_Client SHALL mengambil ulang daftar Incident_Record dan THE Popup_Settings SHALL menampilkan hasil pemeriksaan yang diperbarui.
3. WHILE proses refresh manual berjalan, THE Popup_Settings SHALL menampilkan indikator proses dan menonaktifkan tombol refresh manual.
4. WHEN daftar Stalled_Incident kosong, THE Popup_Settings SHALL menampilkan pesan bahwa seluruh incident Active masih terpantau normal.
5. WHEN pengguna memilih satu entri Stalled_Incident pada Popup_Settings, THE Popup_Settings SHALL mengaktifkan tab myIncident pada `http://localhost:8000` bila tab tersebut terbuka.
6. IF tab myIncident pada `http://localhost:8000` belum terbuka, THEN THE Popup_Settings SHALL menampilkan pesan bahwa halaman myIncident perlu dibuka agar pemantauan aktif.

### Requirement 11: Pencarian Incident Historis Serupa

**User Story:** Sebagai operator myIncident, saya ingin melihat incident lama yang mirip saat mengisi incident baru, sehingga saya tidak menulis ulang informasi yang sudah pernah dicatat.

#### Acceptance Criteria

1. WHEN pengguna mengisi field `#fPerangkat` pada form incident, THE Autofill_Engine SHALL menyusun Candidate_List dari Incident_Record historis.
2. THE Autofill_Engine SHALL memberi peringkat tertinggi pada Incident_Record dengan nilai `perangkat` yang sama dengan isi `#fPerangkat` setelah normalisasi huruf besar-kecil dan spasi di tepi.
3. THE Autofill_Engine SHALL menaikkan peringkat Incident_Record berdasarkan jumlah kata yang sama antara `judul` Incident_Record dan isi `#fJudul` setelah prefix `Event-Mon - ` dilepas.
4. WHERE isi `#fKategoriTim` sama dengan `kategori_tim` sebuah Incident_Record, THE Autofill_Engine SHALL menaikkan peringkat Incident_Record tersebut.
5. WHEN dua Incident_Record memperoleh peringkat sama, THE Autofill_Engine SHALL menempatkan Incident_Record dengan `created_at` lebih baru pada posisi lebih atas.
6. THE Autofill_Engine SHALL mengeluarkan Incident_Record yang sedang dibuka pada `#incidentPanel` dari Candidate_List.
7. THE Autofill_Engine SHALL membatasi Candidate_List pada 5 Incident_Record teratas.
8. IF tidak ada Incident_Record dengan nilai `perangkat` yang sama dan tanpa kata yang sama pada `judul`, THEN THE Autofill_Engine SHALL menghasilkan Candidate_List kosong.
9. WHEN Candidate_List kosong, THE Content_Script SHALL menahan penampilan Autofill_Panel.

### Requirement 12: Penerapan Autofill oleh Pengguna

**User Story:** Sebagai operator myIncident, saya ingin memutuskan sendiri apakah usulan autofill diterapkan, sehingga isian yang sudah saya tulis tetap terjaga.

#### Acceptance Criteria

1. WHEN Candidate_List memuat minimal satu Incident_Record, THE Content_Script SHALL menampilkan Autofill_Panel berisi `problem_id`, `judul`, `perangkat`, dan `created_at` setiap kandidat.
2. WHEN pengguna memilih satu kandidat pada Autofill_Panel, THE Autofill_Panel SHALL menampilkan pratinjau nilai untuk Autofill_Fields sebelum penerapan.
3. WHEN pengguna menyetujui penerapan autofill, THE Autofill_Engine SHALL mengisi `#fKronologi` dengan narasi kronologi kandidat, `#fRootCause` dengan `detail_alert.root_cause`, `#fImpact` dengan `detail_alert.impact`, dan `#fResolution` dengan `resolution`.
4. THE Autofill_Engine SHALL membiarkan seluruh field selain Autofill_Fields tanpa perubahan, termasuk field PIC dan tim pada `#tabTask`.
5. WHEN sebuah field pada Autofill_Fields sudah memuat teks dari pengguna, THE Autofill_Panel SHALL meminta konfirmasi terpisah sebelum menimpa field tersebut.
6. WHEN pengguna menolak konfirmasi penimpaan sebuah field, THE Autofill_Engine SHALL mempertahankan isi field tersebut dan melanjutkan penerapan pada field lain yang disetujui.
7. WHEN Autofill_Engine mengisi `#fKronologi`, THE Autofill_Engine SHALL mempertahankan baris `Description :` dan `Start Time :` milik incident yang sedang dibuka dan mengganti hanya teks setelah `Kronologi :`.
8. WHEN Autofill_Engine selesai mengisi sebuah field, THE Autofill_Engine SHALL memicu event `input` pada field tersebut agar aplikasi myIncident mengenali perubahan nilai.
9. WHEN pengguna menutup Autofill_Panel tanpa memilih kandidat, THE Autofill_Engine SHALL membiarkan seluruh field form tanpa perubahan.
10. WHILE incident yang dibuka memiliki `status` selain `Active`, THE Content_Script SHALL menahan penampilan Autofill_Panel.

### Requirement 13: Tema Antarmuka Extension

**User Story:** Sebagai pengguna myIncident, saya ingin antarmuka extension terlihat menyatu dengan aplikasi, sehingga peralihan perhatian antar keduanya terasa wajar.

#### Acceptance Criteria

1. THE QC_Extension SHALL memakai warna latar `#050505` pada Popup_Settings, Inline_Banner, dan Autofill_Panel.
2. THE QC_Extension SHALL memakai warna aksen `#ccff00` untuk elemen penekanan dan tombol utama.
3. THE QC_Extension SHALL memakai font Syne untuk judul dan font Plus Jakarta Sans untuk teks isi.
4. IF berkas font gagal dimuat, THEN THE QC_Extension SHALL menampilkan teks memakai font sans-serif bawaan sistem.
5. THE Inline_Banner SHALL memakai penanda kelas CSS berprefix `mqc-` agar gaya QC_Extension terpisah dari gaya aplikasi myIncident.

### Requirement 14: Ketahanan, Keamanan, dan Aksesibilitas

**User Story:** Sebagai pemilik sistem, saya ingin QC_Extension berjalan aman dan andal, sehingga pemakaiannya tidak menimbulkan risiko baru pada lingkungan myIncident.

#### Acceptance Criteria

1. IF permintaan jaringan ke Firestore gagal tiga kali berturut-turut, THEN THE QC_Extension SHALL menunda permintaan berikutnya selama 5 menit dan menampilkan status jaringan pada Popup_Settings.
2. THE QC_Extension SHALL menyimpan hanya API key Firebase yang bersifat publik pada berkas konfigurasinya.
3. THE QC_Extension SHALL mengambil data dengan metode HTTP GET saja pada seluruh permintaan ke Firestore.
4. THE QC_Extension SHALL menyisipkan nilai data ke dalam markup melalui properti `textContent` atau escaping HTML.
5. THE QC_Extension SHALL menjaga rasio kontras warna teks terhadap latar minimal 4.5 banding 1 pada Popup_Settings, Inline_Banner, dan Autofill_Panel.
6. THE Inline_Banner SHALL memuat atribut `role` bernilai `alert` dan label teks yang dapat dibaca pembaca layar.
7. THE Popup_Settings SHALL memungkinkan pengoperasian seluruh kontrolnya melalui tombol Tab dan Enter pada papan ketik.
8. WHEN Stalled_Monitor memeriksa 500 Incident_Record, THE Stalled_Monitor SHALL menyelesaikan satu siklus pemeriksaan dalam 500 milidetik.
9. IF `chrome.storage.local` menolak operasi penulisan karena kuota, THEN THE QC_Extension SHALL melanjutkan pemeriksaan memakai data dalam memori dan menampilkan pesan kuota penyimpanan pada Popup_Settings.
