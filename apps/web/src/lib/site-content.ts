/** Isi website publik. Ubah di sini — semua halaman membaca dari berkas ini. */
export const CONTACT = {
  email: 'halo@mainthub.example', // GANTI dengan email resmi
  phone: '+62 21 0000 0000',      // GANTI
  address: 'Indonesia',           // GANTI dengan alamat kantor
};

/** Daftar klien. Isi hanya klien yang sudah setuju namanya ditampilkan. Kosong = halaman menampilkan program mitra pilot. */
export const CLIENTS: { name: string; sector: string; note?: string }[] = [];

export const MODULES = [
  { id: 'wo', no: 3, name: 'Work Order', tag: 'Execution', desc: 'Dari laporan kerusakan sampai pekerjaan selesai, setiap langkah tercatat. Status tidak bisa dilompati dan riwayatnya tidak bisa diubah.', bullets: ['Prioritas, target waktu (SLA), dan penugasan teknisi', 'Sparepart dan jam kerja tercatat di tiap work order', 'Foto dan lampiran langsung dari lapangan'] },
  { id: 'pm', no: 2, name: 'Preventive Maintenance', tag: 'Prevention', desc: 'Jadwal perawatan berdasarkan kalender atau jam operasi. Work order dibuat otomatis, lengkap dengan daftar sparepart yang dibutuhkan.', bullets: ['Jadwal berulang untuk setiap aset', 'Kepatuhan jadwal dihitung otomatis', 'Daftar sparepart per tugas'] },
  { id: 'assets', no: 1, name: 'Aset & Equipment', tag: 'Foundation', desc: 'Susun mesin Anda dari plant, area, equipment, sampai komponen. Tiap aset punya tingkat kritikalitas A/B/C dan kode QR agar mudah dicari di lapangan.', bullets: ['Hierarki sedalam yang Anda butuhkan', 'Skor kritikalitas dari 4 aspek', 'Impor ratusan aset sekaligus dari Excel'] },
  { id: 'inv', no: 6, name: 'Spare Parts & Inventory', tag: 'Inventory', desc: 'Stok sparepart yang selalu akurat: tidak bisa minus, dan setiap pergerakannya tercatat permanen. Sistem juga memberi saran kapan harus memesan lagi.', bullets: ['Setiap pergerakan stok tercatat', 'Saran pemesanan ulang otomatis', 'Permintaan pembelian dengan persetujuan'] },
  { id: 'kpi', no: 9, name: 'Dashboard KPI', tag: 'Analytics', desc: 'Availability, MTTR, MTBF, kepatuhan PM, dan backlog dihitung langsung dari data di lapangan, bukan diketik ulang.', bullets: ['Rumus sudah diuji dengan hitungan manual', 'Pareto kerusakan dan biaya', 'Ekspor ke CSV'] },
  { id: 'rca', no: 8, name: 'RCA & Failure Analysis', tag: 'Root Cause', desc: 'Cari penyebab sebenarnya dengan 5 Why, fishbone 6M, dan FMEA. Setiap tindakan perbaikan harus diverifikasi supervisor sebelum dianggap selesai.', bullets: ['Tahapan berurutan, tidak bisa dilewati', 'FMEA dengan nilai RPN', 'Pareto penyebab kerusakan'] },
  { id: 'energy', no: 7, name: 'Electrical & Utility', tag: 'Energy', desc: 'Pantau pemakaian listrik dan utilitas per lini, hitung kWh per ton, dan temukan lonjakan yang tidak wajar.', bullets: ['Input harian, per shift, per rentang, atau per PO', 'Perhitungan beban dasar', 'Deteksi anomali otomatis'] },
  { id: 'ai', no: 5, name: 'AI Assistant', tag: 'Assistant', desc: 'Tanya apa saja ke asisten AI. Ia menjawab dari manual dan riwayat perbaikan Anda, dan selalu menyebut sumbernya.', bullets: ['Jawaban disertai sumber', 'Dari alarm ke diagnosis awal, lalu work order dibuat', 'Tetap jalan tanpa kunci API (mode pencarian)'] },
  { id: 'wa', no: 4, name: 'WhatsApp Teknisi', tag: 'Field', desc: 'Teknisi bisa memulai dan menyelesaikan pekerjaan, cek status, dan mengirim foto langsung dari WhatsApp.', bullets: ['Perintah singkat: MULAI, SELESAI, STATUS', 'Foto otomatis masuk ke work order', 'Aktif hanya untuk teknisi yang setuju'] },
  { id: 'admin', no: 10, name: 'Administrasi & Keamanan', tag: 'Control', desc: 'Atur siapa boleh melihat apa, per plant dan per peran. Data tiap organisasi dipisahkan di level database.', bullets: ['4 peran dengan akses per plant', 'Jejak audit untuk perubahan penting', 'Data antar organisasi terisolasi'] },
];

export const SERVICES = [
  { name: 'Implementation & Onboarding', desc: 'Kami bantu memetakan plant, peran, dan alur kerja Anda, sehingga tim bisa mulai memakainya sejak minggu pertama.' },
  { name: 'Data Migration', desc: 'Data aset, teknisi, dan sparepart dari Excel atau sistem lama kami rapikan, periksa, lalu impor, lengkap dengan laporan kesalahan per baris.' },
  { name: 'Team Training', desc: 'Sesi terpisah untuk teknisi, planner, dan supervisor, plus panduan singkat untuk orang yang baru bergabung.' },
  { name: 'Reliability Consulting', desc: 'Diskusi bersama praktisi perawatan soal kritikalitas aset, strategi preventive, dan cara membaca KPI.' },
  { name: 'Integration', desc: 'Sambungkan dengan WhatsApp teknisi, penyimpanan berkas S3, dan sumber alarm sesuai kebutuhan pabrik Anda.' },
  { name: 'Ongoing Support', desc: 'Pembaruan rutin, cadangan database harian, dan jalur bantuan yang jelas.' },
];

export const SECTORS = ['Makanan & Minuman', 'Farmasi & Kosmetik', 'Kimia & Plastik', 'Tekstil & Garmen', 'Logam & Manufaktur', 'Utilitas & Energi'];

export const STEPS = [
  { w: 'Predict', c: 'text-teal-400', t: 'Know before it breaks', d: 'Skor kritikalitas, anomali energi, alarm, dan tren KPI menunjukkan aset mana yang perlu dicek lebih dulu.' },
  { w: 'Maintain', c: 'text-blue-400', t: 'Execute with discipline', d: 'Preventive terjadwal, Work Order dengan alur yang jelas, spare parts selalu tersedia, dan teknisi bekerja dari WhatsApp atau web.' },
  { w: 'Optimize', c: 'text-teal-300', t: 'Learn from every failure', d: 'Root Cause Analysis dan Pareto mengubah kerusakan menjadi perbaikan permanen. Biaya turun, uptime naik.' },
];
