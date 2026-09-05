<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <title>Login NOC System</title>
    <link rel="stylesheet" href="{{ asset('style.css') }}">
</head>
<body class="bg-gray login-body">
    <div class="login-card">
        <h2 style="text-align: center; margin-bottom: 20px;">Login Sistem NOC</h2>
        
        <!-- Form mengirim data ke route POST /login -->
        <form action="/login" method="POST">
            @csrf
            <div class="form-group">
                <label>Username</label>
                <input type="text" name="username" placeholder="Masukkan username" required>
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" name="password" placeholder="Masukkan password" required>
            </div>
            <button type="submit" class="btn-primary" style="width: 100%; margin-top: 10px;">Masuk</button>
        </form>

        @if(session('error'))
            <p style="color: red; text-align: center; margin-top: 15px;">{{ session('error') }}</p>
        @endif
    </div>
</body>
</html>