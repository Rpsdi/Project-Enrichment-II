<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Http\Request;

/*
|--------------------------------------------------------------------------
| Daftar User myIncident
|--------------------------------------------------------------------------
|
| Role yang tersedia:
|   - operator : dapat membuat incident, mengedit semua tab, mengubah status
|                incident dan status task.
|   - staff    : read-only. Hanya dapat melihat daftar & detail incident.
|
| Catatan: kredensial masih disimpan sebagai array statis mengikuti pola
| aplikasi sebelumnya (skala kecil, belum ada tabel users). Password sengaja
| dibandingkan apa adanya karena ini data demo, bukan kredensial produksi.
|
*/
const APP_USERS = [
    'matthew' => [
        'password' => 'operator1',
        'name'     => 'Matthew',
        'id'       => '1',
        'role'     => 'operator',
    ],
    'delbert' => [
        'password' => 'operator2',
        'name'     => 'Delbert',
        'id'       => '2',
        'role'     => 'operator',
    ],
    'sarah' => [
        'password' => 'staff1',
        'name'     => 'Sarah',
        'id'       => '3',
        'role'     => 'staff',
    ],
    'budi' => [
        'password' => 'staff2',
        'name'     => 'Budi',
        'id'       => '4',
        'role'     => 'staff',
    ],
];

// 1. Halaman Login
Route::get('/login', function () {
    if (session()->has('operator_name')) {
        return redirect('/');
    }

    return view('login');
})->name('login');

// 2. Proses Pengecekan Login
Route::post('/login', function (Request $request) {
    $username = strtolower(trim((string) $request->input('username')));
    $password = (string) $request->input('password');

    $user = APP_USERS[$username] ?? null;

    if ($user && hash_equals($user['password'], $password)) {
        $request->session()->regenerate();

        session([
            'operator_name' => $user['name'],
            'operator_id'   => $user['id'],
            'operator_role' => $user['role'],
        ]);

        return redirect('/');
    }

    return back()->with('error', 'Username atau Password salah!');
});

// 3. Proses Logout
Route::get('/logout', function () {
    session()->flush();

    return redirect('/login');
});

// 4. Dashboard myIncident (list incident + slide-in panel detail)
Route::get('/', function () {
    if (! session()->has('operator_name')) {
        return redirect('/login');
    }

    return view('dashboard');
});
