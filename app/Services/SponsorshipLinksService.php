<?php

namespace App\Services;

class SponsorshipLinksService
{
    /**
     * Returns public configuration.
     *
     * @return array{enabled: bool, links: array<int, array{name: string, url: string}>}
     */
    public function publicConfig(): array
    {
        if ((bool) config('services.sponsorship.button_hidden', false)) {
            return [
                'enabled' => false,
                'links' => [],
            ];
        }

        $links = $this->linksFromFundingFile();

        return [
            'enabled' => count($links) > 0,
            'links' => $links,
        ];
    }

    /**
     * Returns links from funding file.
     *
     * @return array<int, array{name: string, url: string}>
     */
    private function linksFromFundingFile(): array
    {
        $fundingFile = (string) config(
            'services.sponsorship.funding_file',
            base_path('.github/FUNDING.yml')
        );

        if ($fundingFile === '' || ! is_file($fundingFile) || ! is_readable($fundingFile)) {
            return [];
        }

        $parsed = $this->parseFundingFile($fundingFile);

        $links = [];
        $seenUrls = [];

        $this->appendPlatformLinks(
            $links,
            $seenUrls,
            $parsed['buy_me_a_coffee'] ?? null,
            'Buy Me a Coffee',
            static fn (string $value): string => "https://www.buymeacoffee.com/{$value}"
        );
        $this->appendPlatformLinks(
            $links,
            $seenUrls,
            $parsed['github'] ?? null,
            'GitHub Sponsors',
            static fn (string $value): string => "https://github.com/sponsors/{$value}",
            splitCommaValues: true
        );
        $this->appendPlatformLinks(
            $links,
            $seenUrls,
            $parsed['patreon'] ?? null,
            'Patreon',
            static fn (string $value): string => "https://www.patreon.com/{$value}"
        );
        $this->appendPlatformLinks(
            $links,
            $seenUrls,
            $parsed['open_collective'] ?? null,
            'Open Collective',
            static fn (string $value): string => "https://opencollective.com/{$value}"
        );
        $this->appendPlatformLinks(
            $links,
            $seenUrls,
            $parsed['ko_fi'] ?? null,
            'Ko-fi',
            static fn (string $value): string => "https://ko-fi.com/{$value}"
        );
        $this->appendPlatformLinks(
            $links,
            $seenUrls,
            $parsed['tidelift'] ?? null,
            'Tidelift',
            static fn (string $value): string => "https://tidelift.com/funding/github/{$value}"
        );
        $this->appendPlatformLinks(
            $links,
            $seenUrls,
            $parsed['community_bridge'] ?? null,
            'Community Bridge',
            static fn (string $value): string => "https://funding.communitybridge.org/projects/{$value}"
        );
        $this->appendPlatformLinks(
            $links,
            $seenUrls,
            $parsed['liberapay'] ?? null,
            'Liberapay',
            static fn (string $value): string => "https://liberapay.com/{$value}"
        );
        $this->appendPlatformLinks(
            $links,
            $seenUrls,
            $parsed['issuehunt'] ?? null,
            'IssueHunt',
            static fn (string $value): string => "https://issuehunt.io/r/{$value}"
        );
        $this->appendPlatformLinks(
            $links,
            $seenUrls,
            $parsed['lfx_crowdfunding'] ?? null,
            'LFX Crowdfunding',
            static fn (string $value): string => "https://crowdfunding.lfx.linuxfoundation.org/projects/{$value}"
        );
        $this->appendPlatformLinks(
            $links,
            $seenUrls,
            $parsed['polar'] ?? null,
            'Polar',
            static fn (string $value): string => "https://polar.sh/{$value}"
        );
        $this->appendPlatformLinks(
            $links,
            $seenUrls,
            $parsed['thanks_dev'] ?? null,
            'thanks.dev',
            static fn (string $value): string => "https://thanks.dev/{$value}"
        );
        $this->appendCustomLinks($links, $seenUrls, $parsed['custom'] ?? null);

        return $links;
    }

    /**
     * Performs the append platform links operation.
     *
     * @param  array<int, array{name: string, url: string}>  $links
     * @param  array<string, true>  $seenUrls
     */
    private function appendPlatformLinks(
        array &$links,
        array &$seenUrls,
        mixed $rawValue,
        string $label,
        callable $urlBuilder,
        bool $splitCommaValues = false
    ): void {
        $values = $this->normalizeValues($rawValue, $splitCommaValues);
        $isMultiValue = count($values) > 1;

        foreach ($values as $value) {
            $normalized = $this->normalizeHandle($value);
            if ($normalized === '') {
                continue;
            }

            $url = (string) $urlBuilder($normalized);
            if ($url === '') {
                continue;
            }

            $name = $isMultiValue ? "{$label} ({$normalized})" : $label;
            $this->appendValidatedLink($links, $seenUrls, $name, $url);
        }
    }

    /**
     * Performs the append custom links operation.
     *
     * @param  array<int, array{name: string, url: string}>  $links
     * @param  array<string, true>  $seenUrls
     */
    private function appendCustomLinks(array &$links, array &$seenUrls, mixed $rawValue): void
    {
        $values = $this->normalizeValues($rawValue);
        $isMultiValue = count($values) > 1;

        foreach ($values as $index => $value) {
            $url = trim($value);
            if ($url === '') {
                continue;
            }

            $host = parse_url($url, PHP_URL_HOST);
            if (is_string($host) && $host !== '') {
                $name = "Support Link ({$host})";
            } elseif ($isMultiValue) {
                $name = 'Support Link '.($index + 1);
            } else {
                $name = 'Support Link';
            }

            $this->appendValidatedLink($links, $seenUrls, $name, $url);
        }
    }

    /**
     * Performs the append validated link operation.
     *
     * @param  array<int, array{name: string, url: string}>  $links
     * @param  array<string, true>  $seenUrls
     */
    private function appendValidatedLink(array &$links, array &$seenUrls, string $name, string $url): void
    {
        $scheme = parse_url($url, PHP_URL_SCHEME);
        if (! is_string($scheme) || ! in_array(strtolower($scheme), ['http', 'https'], true)) {
            return;
        }

        if (filter_var($url, FILTER_VALIDATE_URL) === false) {
            return;
        }

        if (isset($seenUrls[$url])) {
            return;
        }

        $seenUrls[$url] = true;
        $links[] = [
            'name' => $name,
            'url' => $url,
        ];
    }

    /**
     * Normalizes values.
     *
     * @return array<int, string>
     */
    private function normalizeValues(mixed $rawValue, bool $splitCommaValues = false): array
    {
        $values = [];
        $collect = function (mixed $value) use (&$collect, &$values, $splitCommaValues): void {
            if (is_array($value)) {
                foreach ($value as $nested) {
                    $collect($nested);
                }

                return;
            }

            if (! is_scalar($value)) {
                return;
            }

            $trimmed = trim((string) $value);
            if ($trimmed === '') {
                return;
            }

            if ($splitCommaValues && str_contains($trimmed, ',')) {
                foreach (explode(',', $trimmed) as $part) {
                    $part = trim($part);
                    if ($part !== '') {
                        $values[] = $part;
                    }
                }

                return;
            }

            $values[] = $trimmed;
        };

        $collect($rawValue);

        return array_values(array_unique($values));
    }

    /**
     * Normalizes handle.
     *
     * @param  string  $value
     * @return string
     */
    private function normalizeHandle(string $value): string
    {
        $normalized = trim($value);
        $normalized = preg_replace('/^@+/', '', $normalized) ?? $normalized;

        return trim($normalized, " \t\n\r\0\x0B/");
    }

    /**
     * Parse the subset of YAML used by GitHub FUNDING files.
     *
     * @return array<string, mixed>
     */
    private function parseFundingFile(string $path): array
    {
        $lines = @file($path, FILE_IGNORE_NEW_LINES);
        if (! is_array($lines)) {
            return [];
        }

        $parsed = [];
        $activeListKey = null;

        foreach ($lines as $line) {
            $trimmed = trim($line);

            if ($trimmed === '' || str_starts_with($trimmed, '#')) {
                continue;
            }

            if (preg_match('/^([a-z0-9_]+)\s*:\s*(.*)$/i', $trimmed, $matches) === 1) {
                $key = strtolower($matches[1]);
                $rawValue = trim($matches[2]);

                if ($rawValue === '') {
                    $parsed[$key] = [];
                    $activeListKey = $key;

                    continue;
                }

                $activeListKey = null;
                $parsed[$key] = $this->parseInlineFundingValue($rawValue);

                continue;
            }

            if ($activeListKey !== null &&
                preg_match('/^-\s*(.+)$/', ltrim($line), $matches) === 1
            ) {
                $parsed[$activeListKey][] = $this->normalizeYamlScalar($matches[1]);
            }
        }

        return $parsed;
    }

    /**
     * Parses inline funding value.
     *
     * @param  string  $value
     * @return string|array
     */
    private function parseInlineFundingValue(string $value): string|array
    {
        $value = $this->stripInlineComment($value);
        if ($value === '') {
            return '';
        }

        if (str_starts_with($value, '[') && str_ends_with($value, ']')) {
            $items = trim(substr($value, 1, -1));
            if ($items === '') {
                return [];
            }

            $values = [];
            foreach (explode(',', $items) as $item) {
                $normalized = $this->normalizeYamlScalar($item);
                if ($normalized !== '') {
                    $values[] = $normalized;
                }
            }

            return $values;
        }

        return $this->normalizeYamlScalar($value);
    }

    /**
     * Normalizes yaml scalar.
     *
     * @param  string  $value
     * @return string
     */
    private function normalizeYamlScalar(string $value): string
    {
        $trimmed = trim($this->stripInlineComment($value));
        if ($trimmed === '') {
            return '';
        }

        $first = substr($trimmed, 0, 1);
        $last = substr($trimmed, -1);
        if (
            ($first === "'" && $last === "'") ||
            ($first === '"' && $last === '"')
        ) {
            $trimmed = substr($trimmed, 1, -1);
        }

        return trim($trimmed);
    }

    /**
     * Returns strip inline comment.
     *
     * @param  string  $value
     * @return string
     */
    private function stripInlineComment(string $value): string
    {
        $inSingleQuote = false;
        $inDoubleQuote = false;
        $length = strlen($value);

        for ($index = 0; $index < $length; $index++) {
            $char = $value[$index];

            if ($char === "'" && ! $inDoubleQuote) {
                $inSingleQuote = ! $inSingleQuote;

                continue;
            }

            if ($char === '"' && ! $inSingleQuote) {
                $inDoubleQuote = ! $inDoubleQuote;

                continue;
            }

            if ($char === '#' && ! $inSingleQuote && ! $inDoubleQuote) {
                return trim(substr($value, 0, $index));
            }
        }

        return trim($value);
    }
}
