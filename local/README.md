# NusaHMI SCADA — Versi Lokal (On-Premise)

Seluruh aplikasi (editor, runtime, data record, alarm, trend, PDF) berjalan di PC pabrik dan membaca PLC langsung tanpa internet.

## Instalasi di PC pabrik (Windows 10/11 64-bit)
1. Jalankan `NusaHMI-Setup-x.y.z.exe` sebagai Administrator.
2. Installer akan: membuat konfigurasi, membuka port firewall **8080**, mendaftarkan autostart saat PC menyala, lalu menjalankan aplikasi.
3. Login engineer ada di `C:\ProgramData\NusaHMI\LOGIN-ADMIN.txt`.
4. Buka `http://localhost:8080` di PC ini. Alamat jaringan (misal `http://192.168.1.10:8080`) tampil di halaman Proyek dan bisa dibuka dari PC/tablet/HP lain di jaringan yang sama.

Data (database, file, log) tersimpan di `C:\ProgramData\NusaHMI`. Ubah port atau password admin di `config.json`, lalu restart PC atau jalankan "Hentikan NusaHMI" → "Jalankan NusaHMI" dari Start Menu.

## Membuat installer (.exe)
- **Otomatis (GitHub Actions):** push repo ke GitHub → tab *Actions* → *Build Windows Installer* → *Run workflow*. Unduh artefak `NusaHMI-Setup`.
- **Manual di PC Windows:** pasang Node.js 20 + Yarn + Inno Setup 6, lalu:
  ```powershell
  powershell -ExecutionPolicy Bypass -File local\build_windows.ps1
  iscc local\installer.iss
  ```
  Hasil: `local\Output\NusaHMI-Setup-1.0.0.exe`.

## Menjalankan tanpa installer (Linux / uji coba)
```bash
MONGO_URL=mongodb://127.0.0.1:27017 python local/launcher.py   # atau sediakan mongod di PATH
```

## Syarat per PLC
| PLC | Koneksi | Syarat |
|---|---|---|
| S7-1200/1500 absolut | Ethernet, port 102 | PUT/GET aktif, *Optimized block access* nonaktif di DB |
| S7-1200/1500 simbolik | OPC UA, port 4840 | OPC UA server aktif (S7-1500 / S7-1200 FW ≥ V4.4, bisa butuh lisensi) |
| S7-200 / SMART | Ethernet (CP243-1 / SMART) | Isi TSAP bila memakai CP243-1 (mis. 10.00 / 10.01) |
| Omron | FINS TCP/UDP 9600, Host Link serial | Host Link default 9600 7E2 |
| Fatek | Ethernet port 500, serial | Default serial 9600 7E1 |
| Wecon | Modbus TCP / RTU | Alamat D/M/X/Y dipetakan otomatis (X/Y oktal) |
| Modbus | TCP / RTU RS485/RS232/RS422 | Konverter USB → pilih COM port di dialog perangkat |
