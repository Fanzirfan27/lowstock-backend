# Lowstock Backend

Backend service untuk aplikasi **Lowstock POS** yang menangani:

* Push Notification (Firebase Cloud Messaging) menggunakan **Node.js**
* Pembayaran menggunakan **Midtrans (PHP)**

Project ini dibuat sebagai **alternatif Firebase Functions (berbayar)** dengan backend mandiri yang lebih fleksibel dan hemat biaya.

---

## Struktur Folder

```
lowstock-backend/
│
├── fcm-node-backend/          # Backend Node.js (FCM Notification)
│   ├── index.js               # Entry point server
│   ├── Dockerfile             # Docker config (optional)
│   ├── package.json
│
├── payment-midtrans-php/      # Backend PHP (Midtrans Snap)
│   ├── index.php              # Endpoint charge Midtrans
│   ├── config.php             # Config Midtrans
│   
│
├── .gitignore
└── README.md
```

---

## FCM Backend (Node.js)

### Fitur

* Register & unregister FCM token
* Kirim push notification ke user
* Aman menggunakan **Service Account Firebase**


### Menjalankan Server

```bash
cd fcm-node-backend
npm install
node index.js
```

Server berjalan di:

```
http://localhost:8080
```

### Endpoint Utama

| Method | Endpoint          | Keterangan         |
| ------ | ----------------- | ------------------ |
| POST   | `/fcm/register`   | Register token FCM |
| POST   | `/fcm/unregister` | Hapus token FCM    |
| POST   | `/fcm/send`       | Kirim notifikasi   |

---

## Midtrans Backend (PHP)

Backend ini digunakan untuk **generate Snap Token Midtrans** agar **Server Key tidak bocor ke Android**.

### Environment Variable (`.env`)

```env
MIDTRANS_SERVER_KEY=Mid-server-xxxx
MIDTRANS_IS_PRODUCTION=false
```

### Config (`config.php`)

```php
<?php
return [
    'server_key' => getenv('MIDTRANS_SERVER_KEY'),
    'is_production' => filter_var(getenv('MIDTRANS_IS_PRODUCTION'), FILTER_VALIDATE_BOOLEAN),
];
```

### Endpoint

```http
POST /payment-midtrans-php/index.php
```

Request body dikirim dari Android menggunakan **Midtrans Mobile SDK**.
---

## Deployment

Backend ini dapat dijalankan di:

* VPS / Cloud VM
* Docker Container
* Local server (LAN)

Pastikan:

* Port terbuka
* IP server dapat diakses Android

---

## Author

**Muhammad Irfan Nuril Anwar**
Backend & Android Developer

GitHub: [https://github.com/Fanzirfan27](https://github.com/Fanzirfan27)

---

## Catatan

Project ini dibuat untuk keperluan:

* Portfolio
* Aplikasi POS / Inventory

