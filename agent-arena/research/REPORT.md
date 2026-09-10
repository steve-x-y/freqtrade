# Laporan pengujian Agent Arena — 7 September 2026

**Kesimpulan: aplikasi berjalan sebagai prototipe paper trading; strategi baseline belum menunjukkan profitabilitas. Belum layak dipasarkan dengan klaim bot penghasil profit.**

## Hasil utama

Backtest BTC/USDT 5 menit memakai 52.399 candle, termasuk 30 candle pemanasan. Periode eksekusi 22 September 2022 23:40 UTC–23 Maret 2023 19:40 UTC. Lima portofolio independen dimulai dengan 10.000 USDT masing-masing.

| Agen | Menang / transaksi tertutup | Winrate | Return bersih | Drawdown maksimum |
|---|---:|---:|---:|---:|
| Atlas | 3 / 29 | 10.34% | -10.42% | 10.42% |
| Nova | 14 / 68 | 20.59% | -10.08% | 10.08% |
| Pulse | 4 / 36 | 11.11% | -10.00% | 10.00% |
| Vex | 1 / 19 | 5.26% | -10.18% | 10.18% |
| Sage | 4 / 68 | 5.88% | -10.02% | 10.02% |

Gabungan: **26/220 transaksi menang (11,82%)**, modal 50.000 menjadi **44.929,18 USDT**, kerugian **5.070,82 USDT (−10,14%)**. Semua agen akhirnya dihentikan pembatas drawdown. Karena berhenti lebih awal, transaksi tidak tersebar merata selama seluruh enam bulan. Batas 10% dapat terlampaui akibat perubahan harga dan biaya.

## Ketahanan hasil

| Skenario | Menang / tertutup | Winrate | Return gabungan |
|---|---:|---:|---:|
| Last 30% · untouched chronological holdout | 9 / 217 | 4.15% | -10.11% |
| Full history · lower-cost sensitivity (10 bps) | 178 / 707 | 25.18% | -8.86% |
| Full history · higher-cost sensitivity (60 bps) | 12 / 148 | 8.11% | -10.13% |

Holdout adalah 30% data terakhir, 28 Januari–23 Maret 2023, dengan portofolio baru dan 30 candle sebelumnya untuk pemanasan. Aturan tidak dioptimasi menggunakan dataset ini. Ini diagnostik kronologis, bukan pembuktian generalisasi AI. Pengujian portofolio baru per bulan juga menghasilkan return gabungan negatif di semua tujuh potongan bulan; September dan Maret adalah bulan parsial. Hasil bulanan tidak boleh dijumlahkan sebagai satu rekening berkelanjutan.

## Metode dan batas interpretasi

- Sinyal hanya melihat candle sebelumnya; transaksi disimulasikan pada harga buka candle berikutnya.
- Biaya dasar 0,40% **per sisi**, slippage 0,05% per sisi. Sensitivitas 0,10% dan 0,60% adalah asumsi pengujian, bukan pernyataan tarif bursa saat ini.
- Maksimum eksposur 35%; drawdown 10%; stop loss 5%, diperiksa pada observasi harga, bukan intrabar. Posisi terbuka dinilai mark-to-market, tanpa penjualan paksa pada akhir dataset.
- Menang berarti P&L transaksi tertutup positif setelah biaya masuk/keluar dan slippage. Winrate gabungan dihitung dari jumlah menang/jumlah tertutup, bukan rata-rata persentase agen.
- Pengujian ini memakai **strategi aturan deterministik**, bukan inferensi Grok atau model AI. Tidak ada API key model atau akun broker terhubung saat pengujian. Winrate AI dan trading uang asli **belum diketahui**.
- Data berasal dari mirror penelitian berlabel Binance BTC/USDT; feed aplikasi adalah Kraken BTC/USD. Hasil bukan rekaman fill Kraken, bukan hasil tahun 2026, dan belum dicocokkan dengan checksum data asli bursa.
- Audit: 52.400 baris mentah, tidak ada duplikat, gap 5 menit, atau OHLC tidak valid. Baris terakhir dibuang karena mungkin belum selesai saat dikumpulkan.
- Tidak termasuk biaya API AI, pajak, antrean order, market impact atau partial fill. Interval Wilson dalam JSON hanya deskriptif karena transaksi bisa saling bergantung.
- Buy-and-hold referensi +43,66% memakai eksposur 100% dan biaya masuk, sehingga tidak setara risiko dengan agen berplafon 35%.

Kerugian tetap terjadi pada sensitivitas biaya lebih rendah. Hasil ini tidak mendukung klaim bahwa menambahkan lima agent otomatis memberi keunggulan trading. Penyebab yang terlihat adalah frekuensi transaksi dan keuntungan kotor yang tidak cukup menutup biaya; belum ada eksperimen kausal yang memisahkan semua penyebab.

## Verifikasi perangkat lunak

10 tes engine/AI meliputi akuntansi, batas eksposur setelah biaya, stop/gap, drawdown, output model invalid, isolasi dan enkripsi, serta replay tanpa melihat masa depan. TypeScript dan build produksi diperiksa. Tes integrasi Worker memakai data terkendali untuk autentikasi, isolasi pemilik, penolakan origin asing, tick bersamaan, pencegahan candle duplikat, pemisahan backtest, dan pause saat feed gagal. Pengujian ini tidak mengukur kemampuan model AI atau profitabilitas live.

Perbaikan dari pengujian: batas pembelian sekarang dihitung terhadap ekuitas setelah biaya/slippage; backtest membatasi riwayat indikator ke jendela yang benar-benar dipakai sehingga dataset panjang dapat diproses efisien. Tidak ada perubahan strategi untuk mengejar winrate tinggi.

Tidak dilakukan QA visual browser. Koneksi Kraken langsung dari lingkungan build timeout; ketersediaan feed pada deployment belum terverifikasi. Hosted app memeriksa pasar selama tab terbuka; belum dipasang scheduler 24/7. Belum ada eksekusi order uang asli, billing pelanggan, atau validasi operasional untuk menjual layanan.

## Reproduksi

```sh
npm ci
python3 research/fetch-data.py
npm run validate:history
npm run test:engine
npm run typecheck
npm run build
npm run test:runtime
```

Hasil numerik lengkap: [validation-results.json](validation-results.json). Mesin uji: [run-validation.mjs](run-validation.mjs). Dataset diambil dari blob yang dipatok dan diverifikasi hash; tidak memakai harga sintetis untuk menghitung performa.

[Sumber dataset](https://github.com/fiit-ba/ML-for-arbitrage-in-cryptoexchanges/blob/main/dataset/Binance_data_BTCUSDT_5m.csv). Git blob: `b858a91a338ae43c63711274d6d22793f754dd0a`. SHA-256 CSV lokal: `a9d71708dcd996a317e30626e201124dfd596480dc920eef56f66b762b71004a`.
