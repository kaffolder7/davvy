<?php

namespace App\Http\Controllers;

use App\Facades\Analytics;
use App\Models\AppSetting;
use App\Services\Dav\DavServerFactory;
use App\Services\DavRequestContext;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;
use Sabre\DAV\Exception as DavException;
use Sabre\HTTP\Request as SabreRequest;
use Sabre\HTTP\Response as SabreResponse;

class DavController extends Controller
{
    /**
     * Create a new DAV controller instance.
     */
    public function __construct(
        private readonly DavServerFactory $davServerFactory,
        private readonly DavRequestContext $davContext,
    ) {}

    /**
     * Handle the incoming request.
     */
    public function handle(Request $request): Response
    {
        $this->davContext->clear();

        $rawBody = $request->getContent();
        $isSyncReportRequest = $this->isSyncReportRequest($request, $rawBody);
        $shouldLogClientDavTraffic = $this->shouldLogClientDavTraffic($request);

        $headers = [];
        foreach ($request->headers->all() as $name => $values) {
            $headers[$name] = implode(', ', $values);
        }

        $sabreUrl = $request->getPathInfo();
        $queryString = $request->getQueryString();
        if ($queryString !== null && $queryString !== '') {
            $sabreUrl .= '?'.$queryString;
        }

        $sabreRequest = new SabreRequest(
            method: $request->method(),
            url: $sabreUrl,
            headers: $headers,
            body: $rawBody,
        );

        $sabreResponse = new SabreResponse;

        $server = $this->davServerFactory->make();
        $sabreRequest->setBaseUrl($server->getBaseUri());
        $server->httpRequest = $sabreRequest;
        $server->httpResponse = $sabreResponse;

        try {
            $server->invokeMethod($sabreRequest, $sabreResponse, false);
        } catch (DavException $exception) {
            $sabreResponse->setStatus($exception->getHTTPCode());
            $sabreResponse->setHeaders($exception->getHTTPHeaders($server));

            if (
                $sabreResponse->getStatus() === 401
                && ! $sabreResponse->hasHeader('WWW-Authenticate')
            ) {
                $sabreResponse->setHeader('WWW-Authenticate', 'Basic realm="Davvy DAV", charset="UTF-8"');
            }

            if (! $sabreResponse->hasHeader('Content-Type')) {
                $sabreResponse->setHeader('Content-Type', 'application/xml; charset=utf-8');
            }

            if ($sabreResponse->getBodyAsString() === '') {
                $sabreResponse->setBody($this->serializeDavException($exception));
            }
        }

        if ($shouldLogClientDavTraffic) {
            Log::debug('DAV client request/response', [
                'method' => $request->method(),
                'path' => $request->getPathInfo(),
                'user_agent' => $request->userAgent(),
                'depth' => $request->header('Depth'),
                'content_type' => $request->header('Content-Type'),
                'request_body' => $rawBody,
                'response_status' => $sabreResponse->getStatus(),
                'response_body' => $sabreResponse->getBodyAsString(),
            ]);
        }

        $response = response(
            content: $sabreResponse->getBodyAsString(),
            status: $sabreResponse->getStatus()
        );

        foreach ($sabreResponse->getHeaders() as $name => $value) {
            if (is_array($value)) {
                foreach ($value as $v) {
                    $response->headers->set($name, $v, false);
                }

                continue;
            }

            $response->headers->set($name, $value);
        }

        if ($isSyncReportRequest) {
            $statusCode = (int) $sabreResponse->getStatus();
            Analytics::capture(
                $statusCode >= 200 && $statusCode < 400
                    ? 'dav_sync_succeeded'
                    : 'dav_sync_failed',
                [
                    'status_code' => $statusCode,
                    'status_class' => floor($statusCode / 100).'xx',
                    'client_family' => $this->clientFamily((string) $request->userAgent()),
                    'compat_mode_enabled' => AppSetting::davCompatibilityModeEnabled(),
                ],
                $this->davContext->getAuthenticatedUser(),
            );
        }

        $this->davContext->clear();

        return $response;
    }

    /**
     * Determine whether to log client DAV traffic.
     */
    private function shouldLogClientDavTraffic(Request $request): bool
    {
        if (! config('dav.log_client_traffic', false)) {
            return false;
        }

        $path = $request->getPathInfo();
        if (! str_starts_with($path, '/dav')) {
            return false;
        }

        $method = strtoupper($request->method());
        if (! in_array($method, ['PROPFIND', 'REPORT', 'OPTIONS'], true)) {
            return false;
        }

        return str_contains((string) $request->userAgent(), 'AddressBookCore');
    }

    /**
     * Determines whether the DAV request is a sync collection report.
     */
    private function isSyncReportRequest(Request $request, string $rawBody): bool
    {
        if (strtoupper($request->method()) !== 'REPORT') {
            return false;
        }

        return str_contains(strtolower($rawBody), 'sync-collection');
    }

    /**
     * Reduces a full DAV user agent to a small client family label.
     */
    private function clientFamily(string $userAgent): string
    {
        $normalized = strtolower($userAgent);

        return match (true) {
            str_contains($normalized, 'addressbookcore'),
            str_contains($normalized, 'calendaragent'),
            str_contains($normalized, 'cfnetwork'), => 'apple',
            str_contains($normalized, 'thunderbird') => 'thunderbird',
            str_contains($normalized, 'davx') => 'davx5',
            str_contains($normalized, 'outlook') => 'outlook',
            default => 'other',
        };
    }

    /**
     * Serialize a DAV exception payload.
     */
    private function serializeDavException(DavException $exception): string
    {
        $message = htmlspecialchars($exception->getMessage(), ENT_NOQUOTES, 'UTF-8');
        $class = htmlspecialchars($exception::class, ENT_NOQUOTES, 'UTF-8');

        return sprintf(
            '<?xml version="1.0" encoding="utf-8"?><d:error xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns"><s:exception>%s</s:exception><s:message>%s</s:message></d:error>',
            $class,
            $message
        );
    }
}
