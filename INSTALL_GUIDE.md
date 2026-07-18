# 🔮 Leviathan Immersive Reader - Panduan Instalasi & Penggunaan

Ekstensi browser premium dengan tema **Neural Void** yang dirancang untuk memberikan pengalaman membaca bebas gangguan, lengkap dengan fitur **Read Aloud (TTS)**, **Line Focus**, **Grammar Tools**, dan **AI Copilot** (Integrasi Gemini API).

---

## 🛠️ Langkah-Langkah Instalasi di Browser (Chrome / Edge / Opera / Brave)

Karena ekstensi ini dibuat secara lokal, Anda dapat memasangnya menggunakan mode Pengembang (Developer Mode) di browser berbasis Chromium:

### 1. Buka Halaman Ekstensi
- **Microsoft Edge**: Buka tab baru dan ketik `edge://extensions/` lalu tekan Enter.
- **Google Chrome**: Buka tab baru dan ketik `chrome://extensions/` lalu tekan Enter.

### 2. Aktifkan Mode Pengembang (Developer Mode)
- Di pojok kiri bawah (atau kanan atas pada beberapa browser), aktifkan toggle **"Developer mode"** (Mode pengembang).

### 3. Muat Ekstensi (Load Unpacked)
- Klik tombol **"Load unpacked"** (Muat ekstensi yang tidak dikemas) di bagian atas halaman.
- Jendela penjelajah file akan terbuka. Navigasikan ke direktori berikut:
  `C:\Users\user\immersive-reader`
- Pilih folder `immersive-reader` tersebut dan klik **Select Folder**.

### 4. Selesai!
- Ekstensi **Leviathan Immersive Reader** sekarang akan muncul di daftar ekstensi Anda.
- Pin ikon ekstensi (berlogo buku neon teal 📖) ke toolbar browser agar mudah diakses.

### 5. Aktifkan Akses ke URL File (PENTING untuk Dokumen PDF Lokal)
- Pada kartu ekstensi **Leviathan Immersive Reader** di halaman ekstensi, klik tombol **"Details"** (Detail).
- Gulir ke bawah lalu aktifkan toggle **"Allow access to file URLs"** (Izinkan akses ke URL file).
- *Langkah ini wajib dilakukan agar ekstensi dapat memuat dan mengekstrak teks dari file PDF lokal (`file:///...`) secara langsung.*

---

## 📖 Cara Menggunakan Fitur Reader

1. **Jalankan Reader**:
   - Buka artikel web apa pun (misalnya halaman berita, artikel blog, atau Wikipedia seperti [Humana](https://en.wikipedia.org/wiki/Humana)).
   - Klik **ikon ekstensi** di toolbar Anda, atau klik kanan di mana saja pada halaman dan pilih **Open in Immersive Reader 📖**.
   - Halaman akan langsung diubah menjadi mode membaca yang bersih dan elegan!

2. **Ganti Tema & Font (Text Styles)**:
   - Klik tombol **Text Styles** di toolbar untuk menyesuaikan ukuran teks, lebar kolom (Narrow, Medium, Wide), pilihan font (Georgia, Inter, Fira Code), dan tema warna (Light, Sepia, Slate, atau **Neural Void** yang futuristik).

3. **Membaca Bersuara (Read Aloud)**:
   - Klik **Read Aloud** untuk mulai mendengarkan artikel dibacakan.
   - Anda dapat memilih suara browser yang disukai, mempercepat/memperlambat pembacaan, dan berpindah paragraf dengan kontrol pemutar.

4. **Line Focus (Reading Tools)**:
   - Klik **Reading Tools** dan aktifkan *Line Focus* (1 baris, 3 baris, atau 5 baris). Mode ini akan menyorot baris yang sejajar dengan kursor mouse Anda dan meredupkan bagian lainnya agar membaca lebih fokus.

5. **Grammar Highlights**:
   - Di bawah preferensi *Reading Tools*, Anda dapat menyalakan penyorot tata bahasa untuk menandai Nouns (Kata Benda - ungu), Verbs (Kata Kerja - hijau), Adjectives (Kata Sifat - oranye), atau memenggal suku kata (Syllables).

6. **Leviathan AI Copilot**:
   - Klik tombol **AI Copilot** di kanan atas untuk membuka sidebar asisten.
   - Di sini Anda dapat:
     - **Summarize**: Merangkum poin-poin penting artikel.
     - **Explain**: Sorot (highlight) teks sulit di artikel sebelah kiri, lalu klik *Explain Selected Text*.
     - **Chat**: Mengobrol langsung dan bertanya tentang isi artikel.
   - **Opsional**: Masukkan **Gemini API Key** Anda di menu konfigurasi di dalam sidebar agar asisten AI menggunakan model saraf *Gemini 1.5 Flash* secara real-time. Jika dikosongkan, AI akan menggunakan mode simulasi cerdas luring.

7. **Keluar**:
   - Klik tombol **Exit** di sebelah kiri toolbar untuk kembali ke tampilan website asli dengan cepat.
