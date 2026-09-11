<?php

/*
|--------------------------------------------------------------------------
| Firebase Web Client Configuration
|--------------------------------------------------------------------------
|
| Nilai-nilai di bawah ini adalah konfigurasi Firebase Web SDK yang dipakai
| di sisi browser (client-side). Web API key Firebase bukan rahasia: ia
| adalah identifier publik project, dan pengamanan data dilakukan lewat
| Firestore Security Rules, bukan dengan menyembunyikan key ini.
|
| Diambil dari .env supaya tidak hardcode di file Blade.
|
*/

return [

    'api_key' => env('FIREBASE_API_KEY'),

    'auth_domain' => env('FIREBASE_AUTH_DOMAIN'),

    'project_id' => env('FIREBASE_PROJECT_ID'),

    'storage_bucket' => env('FIREBASE_STORAGE_BUCKET'),

    'messaging_sender_id' => env('FIREBASE_MESSAGING_SENDER_ID'),

    'app_id' => env('FIREBASE_APP_ID'),

];
