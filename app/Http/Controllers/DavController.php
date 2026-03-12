<?php

namespace App\Http\Controllers;

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
    public function __construct(
        private readonly DavServerFactory $davServerFactory,
        private readonly DavRequestContext $davContext,
    ) {}

    /**
     * Handles the incoming request.
     */
    public function handle(Request $request): Response
    {
        $this->davContext->clear();

        $rawBody = $request->getContent();
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

        $this->davContext->clear();

        return $response;
    }

    /**
     * Checks whether it should log client DAV traffic.
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
     * Returns serialize DAV exception.
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
