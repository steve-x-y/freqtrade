# Agent Arena V2: lebih selektif, belum terbukti unggul

Untuk Steve · 7 September 2026 · Riset dan simulasi BTC spot, bukan rekomendasi membeli aset.

## Jawaban langsung

Lima strategi harian baru menghasilkan return gabungan **+5,25%** dan winrate **46,43% (13 dari 28 transaksi tertutup)** pada 1 Januari 2024–4 Mei 2026. Modal simulasi gabungan 50.000 menjadi 52.622,72 USDT. Angka ini kumulatif selama sekitar 28 bulan, bukan profit bulanan. Tidak ada kandidat yang lolos seluruh kriteria bukti yang ditetapkan sebelum evaluasi. Tujuan profit maksimal belum tercapai dan tidak bisa dijanjikan.

**Pulse**, dipilih hanya dari data pengembangan 2018–2021, memperoleh +23,50% di validasi 2022–2023, tetapi hanya **+1,95%** pada uji akhir, dengan 1 kemenangan dari 5 transaksi dan drawdown 10,15%; kemudian berhenti. Atlas +11,68% adalah pemenang setelah melihat hasil akhir, bukan pilihan yang bisa diklaim diketahui sebelumnya. Sage 75% winrate hanya berasal dari 3 kemenangan/4 transaksi, termasuk satu likuidasi akhir pengujian. Itu belum winrate yang dapat diandalkan.

## Apa yang diubah dan dasar penilaiannya

1. Keputusan dari candle 5 menit menjadi harian pada profil opsional V2, agar sinyal tidak selalu bereaksi pada perubahan kecil. Atlas memakai MA20/100 dengan rezim MA200; Nova RSI14 di bawah 35 hanya dalam tren MA50/200 naik; Pulse momentum 28 hari plus MA200; Vex breakout 55 hari dengan exit 20 hari; Sage dua dari tiga sinyal tren dengan setengah alokasi. Parameter ini hipotesis implementasi, bukan angka optimum yang dibuktikan paper.
2. Ambang masuk beberapa strategi memasukkan friksi pulang-pergi yang dimodelkan, ditambah jeda tiga hari setelah keluar. Ambang ini bukan perkiraan keuntungan atau jaminan menutup biaya. Tidak ada leverage, short, martingale, atau penambahan posisi untuk menutup kerugian.
3. Biaya utama 80bps (0,80%) per sisi dan slippage 5bps (0,05%) per sisi. Jadwal resmi Kraken yang dibaca menampilkan taker tingkat awal 0,80%; tarif aktual bergantung tier/pair, sehingga ini asumsi konservatif tetap, bukan rekonstruksi tarif historis atau diskon volume akun. [Kraken, Fee Structures, diakses 7 September 2026](https://www.kraken.com/features/fee-schedule).
4. Dibandingkan terhadap kas dan buy-and-hold, bukan hanya winrate. Riset Hudson–Urquhart menemukan profitabilitas teknikal historis tetapi aturan terbaik Bitcoin gagal pada uji di luar sampel Januari–Juni 2018. Ini mendukung pengujian tren, bukan menjamin keberhasilannya. [Technical trading and cryptocurrencies, terbit daring 2019; jurnal 2021](https://link.springer.com/article/10.1007/s10479-019-03357-1).
5. Momentum juga memiliki bukti penyangkal: Grobys–Sapkota tidak menemukan signifikansi konvensional untuk strategi momentum yang diteliti pada 143 kripto 2014–2018. Sampel dan strategi long/short bulanan berbeda dari aplikasi BTC spot. [Cryptocurrencies and momentum, 2019](https://osuva.uwasa.fi/bitstreams/ffee5cb1-92a8-443e-a117-cbaacd8a1028/download).

Literatur tidak memberi konsensus bahwa menambah indikator, LLM atau jumlah agent akan menghasilkan alpha. Pemilihan terbaik dari banyak variasi sendiri meningkatkan risiko overfitting; karena itu hanya lima kandidat dipatok, semua hasil dilaporkan, dan tidak dilakukan pencarian parameter berulang pada final test. [Bailey dkk., Online tools for demonstration of backtest overfitting, 29 November 2015](https://www.davidhbailey.com/dhbpapers/overfit-tools.pdf).

## Rancangan evaluasi

- Dataset BTC: 3.184 baris harian dari 17 Agustus 2017; baris terakhir dibuang, 3.183 digunakan hingga 4 Mei 2026. ETH: 3.167 baris digunakan hingga 18 April 2026. Tak ada gap harian, duplikat atau OHLC invalid dalam audit.
- Sumber adalah mirror pihak ketiga berlabel Binance dengan skrip pengambilan API; **bukan dataset langsung yang telah kami verifikasi ke bursa**. Cross-check 1.647 hari OHLC dengan mirror kedua menunjukkan nol selisih >0,011. Ini menambah keyakinan untuk periode overlap lama, bukan membuktikan seluruh data mutakhir. Dua kandidat dataset lain ditolak karena berlabel generated atau harga/tanggal mencurigakan.
- Binance menyediakan arsip resmi dengan checksum; akses unduh langsung lingkungan kerja dibatalkan oleh kontrol jaringan. Tidak dicoba melewati kontrol tersebut. Data mirror diambil melalui koneksi GitHub yang tersedia. [Binance Public Data, dokumentasi resmi](https://github.com/binance/binance-public-data).
- Pengembangan: portofolio tahunan baru 2018–2021; 2018 parsial karena butuh 201 candle pemanasan. Skor median return tahunan dikurangi separuh drawdown tahunan terburuk. Pulse dipilih, dan protokol serta hash sumber disimpan sebelum melihat performa 2022 ke depan.
- Validasi: portofolio kontinu baru 2022–2023. Uji akhir: portofolio kontinu baru 2024–4 Mei 2026. Pembatas drawdown permanen, tidak direset ketika rugi. Diagnostik tahunan adalah rekening baru terpisah dan tidak boleh dijumlahkan menjadi rekening kontinu.
- Sinyal menggunakan hanya candle selesai sebelum fill; eksekusi pada open berikutnya. Modal 10.000 per agen; alokasi masuk maksimal 35% (Sage 17,5%), stop observasi 10%, drawdown halt 10%. Stop 10% berbeda dari versi lama 5%; perbandingan bukan atribusi murni perubahan sinyal.
- Semua posisi tersisa dan benchmark dilikuidasi pada open observasi terakhir untuk memasukkan biaya keluar. Hasil aplikasi tombol backtest tetap mark-to-market tanpa likuidasi akhir, jadi dapat berbeda dari laporan ini.
- Portofolio dinilai pada open harian; stop bukan intrabar. Risiko intrabar bisa lebih besar. Sesi forward tetap memeriksa risiko saat tab aktif, lebih sering daripada simulasi harian; hasil live/paper-forward tidak identik dengan backtest.

## Hasil final test

| Agen | Win / closed | Winrate | Return bersih | Max DD observasi | Status |
|---|---:|---:|---:|---:|---|
| Atlas | 1/3 | 33,33% | +11,68% | 10,74% | Halt |
| Nova | 7/13 | 53,85% | +2,52% | 9,84% | Tidak halt |
| Pulse, pilihan pengembangan | 1/5 | 20,00% | +1,95% | 10,15% | Halt |
| Vex | 1/3 | 33,33% | −1,18% | 10,77% | Halt |
| Sage | 3/4 | 75,00% | +11,25% | 7,43% | Tidak halt |

Gabungan validasi 2022–2023: +11,82%, 14/22 menang (63,64%). Gabungan final: +5,25%, 13/28 menang (46,43%). Lima portofolio memakai aset sama, sehingga transaksi bukan observasi independen. Max DD pada tabel bukan max DD gabungan.

Buy-and-hold dengan **35% modal awal** menghasilkan +28,94%, tetapi drawdown 30,29%. Alokasi dibiarkan berubah bersama harga, tanpa stop atau halt, sehingga tidak setara risiko. Buy-and-hold 100%: +82,68%, drawdown 49,53%. Kas diasumsikan 0% bunga. V2 menahan drawdown observasi lebih kecil, tetapi belum mengalahkan return sederhana tersebut.

## Stress test dan ketidakpastian

| Fee per sisi | Return gabungan final | Return Pulse |
|---|---:|---:|
| 0,10% | +6,74% | +2,43% |
| 0,40% | +4,24% | +2,46% |
| 0,80% utama | +5,25% | +1,95% |
| 1,20% | +3,20% | +1,23% |

Pada sensitivity ini ambang sinyal tetap menggunakan biaya dasar 80bps, hanya biaya eksekusi yang diubah. Ukuran posisi, basis biaya untuk stop, saldo dan waktu halt tetap dapat berubah, sehingga return tidak wajib monoton terhadap fee. Pass awal sensitivity yang juga mengubah ambang sinyal diperbaiki karena mencampur dua efek; bukan perubahan kandidat atau pemilihan ulang berdasarkan hasil akhir.

Tambahan keterlambatan satu candle menghasilkan Pulse +12,16%, bukan lebih buruk. Perbedaan besar ini menunjukkan sensitivitas jalur stop/halt dan timing; tidak dijadikan alasan mengganti aturan eksekusi. ETH robustness gabungan +4,66% dengan 10/16 menang, hingga 18 April 2026, bukan rekomendasi berganti aset.

Jika membuka rekening baru pada 2025, **Pulse rugi 10,01%** dan gabungan lima agen rugi 1,61%. Hasil rekening kontinu 2024–2026 tampak lebih baik sebagian karena beberapa agen sudah berhenti pada 2024. Ini bukan sistem yang terus menghasilkan pendapatan.

Bootstrap blok 14 hari, 1.000 replikasi, memberi rentang return deskriptif Pulse sekitar **−19,28% sampai +37,09%**. Metode ini mengacak return portofolio yang sudah terjadi, tidak mensimulasikan ulang respons stop/halt di jalur pasar baru dan bukan jaminan cakupan atau uji signifikansi setelah seleksi. Wilson winrate Pulse sekitar 3,62%–62,45%, juga terlalu lebar. Jangan menafsirkan profit factor tinggi Sage dari hanya satu kerugian sebagai bukti stabilitas.

## Keputusan dan batas penyelesaian

Tidak ada kandidat memenuhi seluruh gerbang yang dipatok: validasi dan final positif, profit factor keduanya >1, minimal 10 transaksi tertutup pada masing-masing periode, dan final stress biaya tinggi positif. Ambang 10 transaksi hanya penyaring minimal, bukan jumlah sampel yang cukup untuk sertifikasi profitabilitas. Tidak ada klaim penemuan profit maksimum.

Profil V2 tersedia untuk eksplorasi paper, sementara sesi lama tidak diubah atau dihapus. Pengguna dapat membuka Review V2 settings lalu menyimpan pada sesi baru; tetap perlu mengekspor sesi lama sebelum reset. Tidak ada order uang asli, koneksi broker, inferensi AI berbayar atau scheduler 24/7 yang ditambahkan. AI tetap eksperimen terpisah dan biaya token belum dimodelkan. Tidak termasuk pajak, market impact, partial fill, risiko USDT/USD, atau biaya infrastruktur.

20 tes lolos: 19 tes unit/adapter untuk akuntansi, cap, stop/gap, isolasi/enkripsi, no-lookahead, warmup harian, cooldown, friksi, likuidasi akhir, pemilihan beku dan adapter candle, ditambah satu tes rendering laporan di server yang memeriksa angka, peringatan dan tautan. TypeScript dan build produksi diverifikasi pada penyelesaian. Browser visual QA tidak dilakukan. Runtime jaringan dan feed produksi belum diuji ulang setelah kontrol jaringan menghentikan akses langsung.

Riset dihentikan setelah sumber primer mendukung atau membatasi semua klaim utama, kandidat beku telah dievaluasi, dan bukti kontra ditemukan. Menambah optimasi pada final test yang sudah dibuka berisiko mengejar kebetulan. Langkah pembuktian berikutnya adalah forward paper dengan data setelah titik pengembangan, bukan menaikkan leverage atau menjanjikan winrate.

## Reproduksi dan provenance data

Lihat EXPERIMENT-V2.md, v2-selection.json, v2-results.json dan run-v2.mjs. Jalankan fetch-v2-data.py untuk mengambil blob tetap, lalu research:develop dan research:evaluate. Hash memastikan kandidat dan protokol sama. Riwayat sumber memiliki commit pemilihan sebelum evaluasi.

- [BTC mirror](https://github.com/marek3993/trendatlas-crypto/blob/main/data/ohlcv/BTCUSDT_1d.csv), blob 09072461ec00805b7a17c68ff6f279a40807eaa1.
- [ETH mirror](https://github.com/marek3993/trendatlas-crypto/blob/main/data/ohlcv/ETHUSDT_1d.csv), blob fa0efa8f5628f0172822fa24eb30420a4cb38787.
- [Cross-check BTC](https://github.com/Ruhguevara/Algorithmic_trading/blob/main/files/BTCUSDT_1d.csv), blob cafaaeca41df4e0ae65ee28a25a383a4b862ba39.

Angka winrate lama 11,82% berasal dari periode dan konfigurasi berbeda. Jangan mengiklankan perubahan menjadi 46,43% sebagai peningkatan setara yang terukur pada dataset sama.
