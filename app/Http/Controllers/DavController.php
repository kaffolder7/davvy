<?php

namespace App\Http\Controllers;

use App\Services\Dav\DavServerFactory;
use App\Services\DavRequestContext;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Sabre\DAV\Exception as DavException;
use Sabre\HTTP\Request as SabreRequest;
use Sabre\HTTP\Response as SabreResponse;

class DavController extends Controller
{
    public function __construct(
        private readonly DavServerFactory $davServerFactory,
        private readonly DavRequestContext $davContext,
    ) {}

    public function handle(Request $request): Response
    {
        $this->davContext->clear();

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
            body: $request->getContent(),
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
