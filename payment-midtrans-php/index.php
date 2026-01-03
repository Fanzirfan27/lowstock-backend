<?php
require_once __DIR__ . '/config.php';

// Check method
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(404);
    echo "Halo Guys";
    exit;
}

// Ambil body request
$request_body = file_get_contents('php://input');

// Response JSON
header('Content-Type: application/json');

// Call Midtrans
$charge_result = chargeAPI($api_url, $server_key, $request_body);

// Set HTTP status
http_response_code($charge_result['http_code']);
echo $charge_result['body'];

/**
 * Call charge API using Curl
 */
function chargeAPI($api_url, $server_key, $request_body) {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $api_url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HEADER => false,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Accept: application/json',
            'Authorization: Basic ' . base64_encode($server_key . ':')
        ],
        CURLOPT_POSTFIELDS => $request_body
    ]);

    return [
        'body' => curl_exec($ch),
        'http_code' => curl_getinfo($ch, CURLINFO_HTTP_CODE)
    ];
}
