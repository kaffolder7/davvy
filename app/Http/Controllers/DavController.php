<?php

namespace App\Http\Controllers;

use App\Services\Dav\DavServerFactory;
use App\Services\DavRequestContext;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
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

        $sabreRequest = new SabreRequest(
            method: $request->method(),
            url: $request->getRequestUri(),
            headers: $headers,
            body: $request->getContent(),
        );

        $sabreResponse = new SabreResponse;

        $server = $this->davServerFactory->make();
        $server->invokeMethod($sabreRequest, $sabreResponse, false);

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
}
