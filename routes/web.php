<?php

use App\Http\Controllers\AddressBookController;
use App\Http\Controllers\AddressBookMilestoneCalendarController;
use App\Http\Controllers\AddressBookMirrorController;
use App\Http\Controllers\AdminController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CalendarController;
use App\Http\Controllers\ContactChangeRequestController;
use App\Http\Controllers\ContactController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DavController;
use App\Http\Controllers\ExportController;
use App\Http\Controllers\ShareController;
use Illuminate\Support\Facades\Route;

Route::post('/api/auth/login', [AuthController::class, 'login'])->middleware('throttle:auth-login');
Route::post('/api/auth/register', [AuthController::class, 'register'])->middleware('throttle:auth-register');
Route::get('/api/public/config', [AuthController::class, 'publicConfig']);
Route::redirect('/.well-known/caldav', '/dav', 301);
Route::redirect('/.well-known/carddav', '/dav', 301);
Route::match([
    'OPTIONS',
    'PROPFIND',
    'PROPPATCH',
    'MKCOL',
    'COPY',
    'MOVE',
    'LOCK',
    'UNLOCK',
    'REPORT',
    'MKCALENDAR',
    'ACL',
], '/.well-known/caldav', fn () => redirect('/dav', 308));
Route::match([
    'OPTIONS',
    'PROPFIND',
    'PROPPATCH',
    'MKCOL',
    'COPY',
    'MOVE',
    'LOCK',
    'UNLOCK',
    'REPORT',
    'MKCALENDAR',
    'ACL',
], '/.well-known/carddav', fn () => redirect('/dav', 308));

Route::middleware('auth')->group(function (): void {
    Route::get('/api/auth/me', [AuthController::class, 'me']);
    Route::post('/api/auth/logout', [AuthController::class, 'logout']);
    Route::patch('/api/auth/password', [AuthController::class, 'changePassword'])->middleware('throttle:auth-password');

    Route::get('/api/dashboard', [DashboardController::class, 'index']);

    Route::get('/api/exports/calendars', [ExportController::class, 'exportAllCalendars']);
    Route::get('/api/exports/calendars/{calendar}', [ExportController::class, 'exportCalendar']);
    Route::get('/api/exports/address-books', [ExportController::class, 'exportAllAddressBooks']);
    Route::get('/api/exports/address-books/{addressBook}', [ExportController::class, 'exportAddressBook']);

    Route::post('/api/calendars', [CalendarController::class, 'store']);
    Route::patch('/api/calendars/{calendar}', [CalendarController::class, 'update']);
    Route::delete('/api/calendars/{calendar}', [CalendarController::class, 'destroy']);

    Route::post('/api/address-books', [AddressBookController::class, 'store']);
    Route::patch('/api/address-books/{addressBook}/milestone-calendars', [AddressBookMilestoneCalendarController::class, 'update']);
    Route::patch('/api/address-books/apple-compat', [AddressBookMirrorController::class, 'update']);
    Route::patch('/api/address-books/{addressBook}', [AddressBookController::class, 'update']);
    Route::delete('/api/address-books/{addressBook}', [AddressBookController::class, 'destroy']);

    Route::middleware('contact-management')->group(function (): void {
        Route::get('/api/contacts', [ContactController::class, 'index']);
        Route::post('/api/contacts', [ContactController::class, 'store']);
        Route::patch('/api/contacts/{contact}', [ContactController::class, 'update']);
        Route::delete('/api/contacts/{contact}', [ContactController::class, 'destroy']);
    });

    Route::get('/api/shares', [ShareController::class, 'index']);
    Route::post('/api/shares', [ShareController::class, 'upsert']);
    Route::delete('/api/shares/{share}', [ShareController::class, 'destroy']);

    Route::middleware('contact-change-moderation')->group(function (): void {
        Route::get('/api/contact-change-requests', [ContactChangeRequestController::class, 'index']);
        Route::get('/api/contact-change-requests/summary', [ContactChangeRequestController::class, 'summary']);
        Route::post('/api/contact-change-requests/bulk', [ContactChangeRequestController::class, 'bulk']);
        Route::patch('/api/contact-change-requests/{contactChangeRequest}/approve', [ContactChangeRequestController::class, 'approve']);
        Route::patch('/api/contact-change-requests/{contactChangeRequest}/deny', [ContactChangeRequestController::class, 'deny']);
    });

    Route::middleware('admin')->group(function (): void {
        Route::get('/api/admin/users', [AdminController::class, 'users']);
        Route::post('/api/admin/users', [AdminController::class, 'createUser']);
        Route::get('/api/admin/resources', [AdminController::class, 'sharableResources']);
        Route::patch('/api/admin/settings/registration', [AdminController::class, 'setRegistrationSetting']);
        Route::patch('/api/admin/settings/owner-share-management', [AdminController::class, 'setOwnerShareManagementSetting']);
        Route::patch('/api/admin/settings/dav-compatibility-mode', [AdminController::class, 'setDavCompatibilityModeSetting']);
        Route::patch('/api/admin/settings/contact-management', [AdminController::class, 'setContactManagementSetting']);
        Route::patch('/api/admin/settings/contact-change-moderation', [AdminController::class, 'setContactChangeModerationSetting']);
        Route::get('/api/admin/settings/contact-change-retention', [AdminController::class, 'contactChangeRequestRetentionSetting']);
        Route::patch('/api/admin/settings/contact-change-retention', [AdminController::class, 'setContactChangeRequestRetentionSetting']);
        Route::get('/api/admin/settings/backups', [AdminController::class, 'backupSettings']);
        Route::patch('/api/admin/settings/backups', [AdminController::class, 'setBackupSettings']);
        Route::post('/api/admin/backups/run', [AdminController::class, 'runBackupNow']);
        Route::post('/api/admin/contact-milestones/purge-generated-calendars', [AdminController::class, 'purgeGeneratedMilestoneCalendars']);

        Route::get('/api/admin/shares', [ShareController::class, 'index']);
        Route::post('/api/admin/shares', [ShareController::class, 'upsert']);
        Route::delete('/api/admin/shares/{share}', [ShareController::class, 'destroy']);
    });
});

Route::match([
    'GET',
    'HEAD',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
    'PROPFIND',
    'PROPPATCH',
    'MKCOL',
    'COPY',
    'MOVE',
    'LOCK',
    'UNLOCK',
    'REPORT',
    'MKCALENDAR',
    'ACL',
], '/dav/{path?}', [DavController::class, 'handle'])
    ->middleware('dav-auth-throttle')
    ->where('path', '.*');

Route::view('/{any?}', 'app')->where('any', '^(?!api|dav).*$');
