<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Http\Request;

// 1. Halaman Login
Route::get('/login', function () {
    if (session()->has('operator_name')) return redirect('/');
    return view('login');
})->name('login');

// 2. Proses Pengecekan Login
Route::post('/login', function (Request $request) {
    $user = strtolower($request->input('username'));
    $pass = $request->input('password');

    if ($user === 'matthew' && $pass === 'operator1') {
        session(['operator_name' => 'Matthew', 'operator_id' => '1']);
        return redirect('/');
    } elseif ($user === 'delbert' && $pass === 'operator2') {
        session(['operator_name' => 'Delbert', 'operator_id' => '2']);
        return redirect('/');
    }
    
    return back()->with('error', 'Username atau Password salah!');
});

// 3. Proses Logout
Route::get('/logout', function () {
    session()->flush();
    return redirect('/login');
});

// 4. Rute Halaman Utama (Pengecekan login dipindah langsung ke dalam sini)
Route::get('/', function () {
    if (!session()->has('operator_name')) return redirect('/login');
    return view('dashboard');
});

// 5. Rute Halaman Detail
Route::get('/detail', function () {
    if (!session()->has('operator_name')) return redirect('/login');
    return view('detail');
});