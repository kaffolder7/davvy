<?php

use App\Http\Controllers\AddressBookController;
use App\Http\Controllers\AdminController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CalendarController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DavController;
use App\Http\Controllers\ShareController;
use Illuminate\Support\Facades\Route;

Route::post('/api/auth/login', [AuthController::class, 'login']);
Route::post('/api/auth/register', [AuthController::class, 'register']);
Route::get('/api/public/config', [AuthController::class, 'publicConfig']);
Route::redirect('/.well-known/caldav', '/dav', 301);
Route::redirect('/.well-known/carddav', '/dav', 301);

Route::middleware('auth')->group(function (): void {
    Route::get('/api/auth/me', [AuthController::class, 'me']);
    Route::post('/api/auth/logout', [AuthController::class, 'logout']);

    Route::get('/api/dashboard', [DashboardController::class, 'index']);

    Route::post('/api/calendars', [CalendarController::class, 'store']);
    Route::patch('/api/calendars/{calendar}', [CalendarController::class, 'update']);
    Route::delete('/api/calendars/{calendar}', [CalendarController::class, 'destroy']);

    Route::post('/api/address-books', [AddressBookController::class, 'store']);
    Route::patch('/api/address-books/{addressBook}', [AddressBookController::class, 'update']);
    Route::delete('/api/address-books/{addressBook}', [AddressBookController::class, 'destroy']);

    Route::get('/api/shares', [ShareController::class, 'index']);
    Route::post('/api/shares', [ShareController::class, 'upsert']);
    Route::delete('/api/shares/{share}', [ShareController::class, 'destroy']);

    Route::middleware('admin')->group(function (): void {
        Route::get('/api/admin/users', [AdminController::class, 'users']);
        Route::post('/api/admin/users', [AdminController::class, 'createUser']);
        Route::get('/api/admin/resources', [AdminController::class, 'sharableResources']);
        Route::patch('/api/admin/settings/registration', [AdminController::class, 'setRegistrationSetting']);
        Route::patch('/api/admin/settings/owner-share-management', [AdminController::class, 'setOwnerShareManagementSetting']);

        Route::get('/api/admin/shares', [ShareController::class, 'index']);
        Route::post('/api/admin/shares', [ShareController::class, 'upsert']);
        Route::delete('/api/admin/shares/{share}', [ShareController::class, 'destroy']);
    });
});

Route::any('/dav/{path?}', [DavController::class, 'handle'])->where('path', '.*');

Route::view('/{any?}', 'app')->where('any', '^(?!api|dav).*$');
