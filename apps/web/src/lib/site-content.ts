/** Isi website publik. Ubah di sini — semua halaman membaca dari berkas ini. */
export const CONTACT = {
  email: 'halo@mainthub.example', // GANTI dengan email resmi
  phone: '+62 21 0000 0000',      // GANTI
  address: 'Indonesia',           // GANTI dengan alamat kantor
};

/** Daftar klien. Isi hanya klien yang sudah setuju namanya ditampilkan. Kosong = halaman menampilkan program mitra pilot. */
export const CLIENTS: { name: string; sector: string; note?: string }[] = [];

export const MODULES = [
  { id: 'wo', no: 3, name: 'Work Order', tag: 'Eksekusi', desc: 'Dari laporan kerusakan sampai penutupan, dengan alur status yang dijaga database: tak ada loncat tahap, tak ada log yang bisa diedit.', bullets: ['Prioritas, SLA, dan penugasan teknisi', 'Suku cadang & jam kerja tercatat per WO', 'Foto dan lampiran dari lapangan'] },
  { id: 'pm', no: 2, name: 'Preventive Maintenance', tag: 'Pencegahan', desc: 'Jadwal berbasis kalender atau jam operasi yang membuat work order sendiri, lengkap dengan BOM suku cadang.', bullets: ['Jadwal berulang per aset', 'Kepatuhan PM terukur otomatis', 'BOM suku cadang per tugas'] },
  { id: 'assets', no: 1, name: 'Aset & Equipment', tag: 'Fondasi', desc: 'Hierarki plant → area → equipment → komponen, dengan kritikalitas A/B/C dan kode QR untuk akses cepat di lapangan.', bullets: ['Hierarki tak terbatas', 'Skor kritikalitas 4 dimensi', 'Impor massal dari Excel'] },
  { id: 'inv', no: 6, name: 'Sparepart & Inventory', tag: 'Logistik', desc: 'Stok yang tidak bisa minus, mutasi append-only, saran reorder, dan permintaan pembelian dengan persetujuan.', bullets: ['Mutasi stok tak bisa diubah', 'Saran reorder otomatis', 'PR dengan approval'] },
  { id: 'kpi', no: 9, name: 'Dashboard KPI', tag: 'Analitik', desc: 'Availability, MTTR, MTBF, kepatuhan PM, backlog, dan Pareto kerusakan — dihitung langsung dari data lapangan, bukan input manual.', bullets: ['Rumus teruji dengan data hitungan manual', 'Pareto penyebab & biaya', 'Ekspor CSV'] },
  { id: 'rca', no: 8, name: 'RCA & Failure Analysis', tag: 'Akar masalah', desc: 'Siklus PDCA bergerbang, 5 Why, fishbone 6M, FMEA dengan RPN, dan tindakan yang diverifikasi supervisor.', bullets: ['Gerbang tahap: tak bisa lompat', 'FMEA & saran angka kejadian', 'Pareto penyebab'] },
  { id: 'energy', no: 7, name: 'Electrical & Utility', tag: 'Energi', desc: 'Konsumsi listrik dan utilitas per lini, tarif, kWh per ton, model beban dasar, dan deteksi anomali.', bullets: ['Harian / shift / rentang / per PO', 'Regresi beban dasar', 'Deteksi anomali konsumsi'] },
  { id: 'ai', no: 5, name: 'AI Assistant', tag: 'Cerdas', desc: 'Tanya jawab atas manual dan riwayat perbaikan Anda dengan sumber yang bisa ditelusuri, plus diagnosis awal dari alarm.', bullets: ['Jawaban selalu menyertakan sumber', 'Alarm → diagnosis → buat WO', 'Berjalan tanpa kunci API: mode pencarian'] },
  { id: 'wa', no: 4, name: 'WhatsApp Teknisi', tag: 'Lapangan', desc: 'Teknisi memulai dan menyelesaikan WO, cek status, dan mengirim foto langsung dari WhatsApp.', bullets: ['Perintah MULAI / SELESAI / STATUS', 'Foto otomatis jadi lampiran WO', 'Opt-in per teknisi'] },
  { id: 'admin', no: 10, name: 'Administrasi & Keamanan', tag: 'Kendali', desc: 'Multi-plant, multi-peran, dan isolasi data antar organisasi di tingkat database (row-level security).', bullets: ['4 peran, akses per plant', 'Jejak audit', 'Isolasi data di level database'] },
];

export const SERVICES = [
  { name: 'Implementasi & Onboarding', desc: 'Kami memetakan struktur plant Anda, menyiapkan organisasi, peran, dan alur kerja sehingga tim bisa memakainya di minggu pertama.' },
  { name: 'Migrasi Data Master', desc: 'Aset, teknisi, dan suku cadang dari Excel atau sistem lama dibersihkan, divalidasi, dan diimpor dengan laporan galat per baris.' },
  { name: 'Pelatihan Tim', desc: 'Sesi terpisah untuk teknisi, planner, dan supervisor, dengan panduan singkat yang bisa dipakai ulang oleh orang baru.' },
  { name: 'Konsultasi Keandalan', desc: 'Penentuan kritikalitas aset, strategi preventive, dan pembacaan KPI bersama praktisi perawatan.' },
  { name: 'Integrasi', desc: 'WhatsApp untuk teknisi, penyimpanan berkas S3, dan sumber data alarm sesuai kebutuhan pabrik Anda.' },
  { name: 'Dukungan & Pemeliharaan', desc: 'Pemantauan, pembaruan, pencadangan basis data harian, dan kanal bantuan yang jelas.' },
];

export const SECTORS = ['Makanan & Minuman', 'Farmasi & Kosmetik', 'Kimia & Plastik', 'Tekstil & Garmen', 'Logam & Manufaktur', 'Utilitas & Energi'];

export const STEPS = [
  { w: 'Predict', c: 'text-teal-400', t: 'Lihat masalah sebelum terjadi', d: 'Kritikalitas aset, anomali energi, alarm, dan tren KPI memberi tahu mesin mana yang perlu perhatian — sebelum berhenti.' },
  { w: 'Maintain', c: 'text-blue-400', t: 'Kerjakan dengan disiplin', d: 'Preventive terjadwal, work order dengan alur yang dijaga, sparepart tersedia, teknisi bekerja dari WhatsApp atau web.' },
  { w: 'Optimize', c: 'text-teal-300', t: 'Belajar dari setiap kerusakan', d: 'RCA, FMEA, dan Pareto mengubah kerusakan menjadi perbaikan permanen. Biaya turun, ketersediaan naik.' },
];
