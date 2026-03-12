<?php

namespace App\Http\Controllers;

use App\Services\AddressBookMirrorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AddressBookMirrorController extends Controller
{
    public function __construct(private readonly AddressBookMirrorService $mirrorService) {}

    /**
     * @param  Request  $request
     * @return JsonResponse
     */
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'source_ids' => ['array'],
            'source_ids.*' => ['integer', 'min:1'],
        ]);

        $appleCompat = $this->mirrorService->updateUserConfig(
            user: $request->user(),
            enabled: (bool) $data['enabled'],
            sourceIds: $data['source_ids'] ?? [],
        );

        return response()->json([
            'apple_compat' => $appleCompat,
        ]);
    }
}
