# SCADA HMI Builder: Versi Jaringan Lokal (On-Premise)

Aplikasi SCADA/HMI yang sudah ada akan dikemas agar bisa diinstal dan dijalankan langsung di PC pabrik. Dengan begitu, aplikasi dapat berkomunikasi langsung dengan PLC melalui Ethernet dan konverter USB ke RS232/RS422/RS485. Layar HMI dapat dibuka dari browser di komputer, tablet, atau HP mana pun yang terhubung ke jaringan lokal pabrik, tanpa memerlukan internet.

## Penjelasan singkat: Edge Gateway vs Versi Lokal
- **Edge Gateway**: aplikasi utama tetap di cloud. Sebuah program kecil di PC pabrik bertugas membaca PLC, lalu mengirim datanya ke cloud. Model ini memerlukan internet.
- **Versi Lokal (dipilih sekarang)**: seluruh aplikasi, termasuk editor, runtime, data record, alarm, trend, dan PDF, berjalan di PC pabrik. PLC terbaca langsung dan tidak memerlukan internet. Edge Gateway dijadwalkan sebagai opsi di Fase 3.

## Untuk siapa
- **Engineer / integrator**: membuat layar HMI, mengatur driver PLC, tag, alarm, dan data record langsung di lokasi pabrik.
- **Operator / klien pabrik**: memantau dan mengontrol mesin lewat browser di jaringan lokal, dengan akses sesuai grup pengguna.

## Fitur inti dan pengalaman pengguna
1. **Paket instalasi untuk PC pabrik**
   - Diinstal sekali di PC Windows, lalu aplikasi otomatis berjalan setiap kali PC dinyalakan.
   - Setelah instalasi, aplikasi menampilkan alamat akses lokal, misalnya `http://192.168.1.10:8080`, untuk dibuka dari perangkat lain di jaringan.
   - Semua fitur yang sudah ada tetap tersedia: editor drag & drop, simbol industri, runtime, keamanan grup, data record, alarm bit/word, trend, dan ekspor PDF.
2. **Koneksi langsung ke PLC**
   - **Modbus TCP** melalui port Ethernet.
   - **Modbus RTU** melalui RS485, RS232, atau RS422 dengan konverter USB. Pengguna memilih COM port dari daftar port yang terdeteksi, lalu mengatur baud rate, parity, data bit, stop bit, dan slave ID.
   - **Siemens S7-1200/1500, alamat absolut**, contohnya DB1.DBW0, M0.0, I0.0, dan Q0.1.
   - **Siemens S7-1200/1500, alamat simbolik**, contohnya `"Motor1".Start`. Tag dibaca berdasarkan nama simbol melalui fitur OPC UA bawaan PLC, dan tag hasil impor TIA Portal langsung dapat dipakai.
   - **Siemens S7-200** melalui Ethernet.
   - **Omron** dengan FINS TCP/UDP melalui Ethernet dan Host Link melalui serial.
   - **Fatek** dengan protokol bawaan Fatek melalui Ethernet atau serial.
   - **Wecon** melalui Modbus TCP/RTU dengan pemetaan alamat Wecon (D, M, X, Y) otomatis.
3. **Auto-reconnect**
   - Jika kabel lepas, PLC mati, atau jaringan terputus, aplikasi terus mencoba menyambung kembali secara otomatis dengan interval yang bisa diatur.
   - Selama terputus, tag menampilkan status "Bad/Offline", dan nilai terakhir tetap terlihat dengan tanda peringatan.
4. **Diagnostik koneksi**
   - Tombol "Test Koneksi" tersedia untuk setiap perangkat.
   - Status tiap perangkat ditampilkan secara langsung: Terhubung, Menyambung ulang, atau Error, beserta pesan error yang mudah dipahami, misalnya "COM3 sedang dipakai program lain" atau "PUT/GET belum diaktifkan di PLC".
   - Tersedia statistik sederhana: jumlah baca berhasil/gagal dan waktu respons.
5. **Mode simulator tetap ada** agar layar bisa diuji tanpa PLC.

## Alur pengguna
1. Engineer menginstal paket di PC pabrik, lalu membuka alamat lokal di browser.
2. Engineer login, membuat atau membuka project, dan menambahkan perangkat. Setelah memilih protokol, engineer mengisi IP atau memilih COM port, lalu menekan Test Koneksi.
3. Engineer menambahkan tag secara manual atau mengimpornya dari TIA Portal, lalu mengikat tag tersebut ke widget di editor.
4. Engineer menekan Publish, dan runtime tersedia di alamat lokal.
5. Operator membuka runtime dari perangkat mana pun di jaringan pabrik, login sesuai grup, lalu memantau dan mengontrol mesin.
6. Jika koneksi PLC terputus, status perangkat berubah menjadi "Menyambung ulang", lalu kembali normal tanpa tindakan manual.

## Nuansa UI/UX
- Tetap memakai gaya gelap industrial ala ruang kontrol yang sudah ada.
- Panel perangkat menampilkan indikator status berwarna yang jelas (hijau, kuning, merah) dan dapat dibaca dari jauh.
- Form protokol hanya menampilkan kolom yang relevan dengan protokol yang dipilih.

## Fase implementasi
- **Fase 1 (MVP, dibangun sekarang)**: mode lokal dan paket instalasi Windows; seluruh protokol di atas (Modbus TCP/RTU RS485/232/422, S7-1200/1500 absolut dan simbolik, S7-200, Omron, Fatek, Wecon); pendeteksian COM port; auto-reconnect; Test Koneksi; dan diagnostik status perangkat.
- **Fase 2**: backup dan restore project ke file; ekspor/impor project antar-PC; pembersihan otomatis data record lama agar disk tidak penuh; halaman log komunikasi (raw frame) untuk troubleshooting lanjutan.
- **Fase 3**: Edge Gateway untuk mode hybrid, yaitu aplikasi di cloud dan program kecil di PC pabrik yang mengirim data lewat internet dengan buffer saat offline. Fase ini juga mencakup akses jarak jauh ke runtime dari luar pabrik.

## Asumsi
- PC pabrik menggunakan **Windows 10/11**. Karena pengguna belum menentukan bentuk gateway, bentuk yang dipilih adalah paket instalasi yang dijalankan dengan klik, bukan skrip atau Docker.
- Aplikasi dan datanya disimpan di PC tersebut. Akses dilakukan melalui browser di jaringan lokal yang sama, tanpa internet.
- Login engineer dan grup operator memakai sistem yang sudah ada, tanpa perubahan.
- S7-1200/1500 dengan alamat absolut memerlukan pengaturan **PUT/GET aktif** dan **Optimized Block Access nonaktif** pada DB terkait di TIA Portal.
- S7-1200/1500 dengan alamat simbolik memerlukan **OPC UA server aktif di PLC**. Fitur ini tersedia pada S7-1500 dan S7-1200 firmware V4.4 ke atas, dan mungkin memerlukan lisensi runtime OPC UA dari Siemens.
- S7-200 didukung melalui Ethernet (modul CP243-1 atau S7-200 SMART). Komunikasi PPI serial tidak termasuk.
- Wecon dihubungkan melalui Modbus karena PLC Wecon mendukung Modbus secara bawaan.
- Semua protokol diuji dengan simulator dan PLC virtual. Pengujian dengan PLC fisik dilakukan oleh pengguna di lokasi.
- Integrasi penyimpanan file/media tetap tidak termasuk karena sebelumnya dibatalkan.
