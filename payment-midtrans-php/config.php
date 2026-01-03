<?php
// config.php

// Simple env loader
$envPath = __DIR__ . '/.env';
if (file_exists($envPath)) {
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        list($key, $value) = explode('=', $line, 2);
        $_ENV[$key] = trim($value);
    }
}

// Ambil config dari env
$server_key = $_ENV['MIDTRANS_SERVER_KEY'] ?? '';
$is_production = ($_ENV['MIDTRANS_IS_PRODUCTION'] ?? 'false') === 'true';

// Validasi
if (!$server_key) {
    http_response_code(500);
    echo json_encode(['error' => 'Midtrans server key not configured']);
    exit;
}

// API URL
$api_url = $is_production
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
